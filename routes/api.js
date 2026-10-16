// მართვის სისტემის API: შესვლა, მარაგი, შეკვეთები, კურიერი, თანამშრომლები, წერილები, მაღაზიის შენახვა.
const express = require("express");
const db = require("../db");
const storage = require("../lib/storage");
const auth = require("../lib/auth");
const { getShop, saveShop, nowPrice } = require("../lib/shop");
const { mailSafe, mail, ready: mailReady, ZONES } = require("../lib/mail");

const ROLES = ["admin", "sales", "courier"];
// უფლებები: თანამშრომელი ხედავს მხოლოდ იმას, რისი უფლებაც აქვს. ადმინს ყველაფერი აქვს.
const PERMS = ["order_create", "orders_all", "orders_assign", "couriers_view", "stock_view", "stock_edit", "csv", "emails", "site_edit", "users", "courier"];
const PRESET = { admin: PERMS, sales: ["order_create", "orders_all", "stock_view"], courier: ["courier"] };
// ადმინს ყველა უფლება აქვს, გარდა კურიერის რეჟიმისა (რომ კურიერების სიაში არ გამოჩნდეს)
const permsOf = (u) => u.role === "admin" ? PERMS.filter((p) => p !== "courier") : String(u.perms || "").split(",").filter((p) => PERMS.includes(p));
const can = (u, ...ps) => { const have = permsOf(u); return ps.some((p) => have.includes(p)); };
const cleanPerms = (list) => PERMS.filter((p) => Array.isArray(list) && list.includes(p)).join(",");
const OPEN = ["new", "assigned", "picked", "problem"];
const HOLD = [...OPEN, "delivered"]; // ეს სტატუსები მარაგს იკავებს

const str = (v, max = 300) => String(v ?? "").trim().slice(0, max);
const int = (v, min = 0, max = 1e6) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : min; };
const isEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
const iso = () => new Date().toISOString();
const tbilisiDay = (plusDays = 0) => new Date(Date.now() + 4 * 36e5 + plusDays * 864e5).toISOString().slice(0, 10); // UTC+4
const todayStartIso = () => new Date(Date.parse(tbilisiDay() + "T00:00:00Z") - 4 * 36e5).toISOString();
const pub = (u) => ({ id: u.id, name: u.name, email: u.email, role: u.role, perms: permsOf(u) });
const num = (o, ...keys) => { keys.forEach((k) => { if (o[k] !== null && o[k] !== undefined) o[k] = Number(o[k]); }); return o; };

class HttpError extends Error { constructor(code, msg) { super(msg); this.code = code; } }
const fail = (code, msg) => { throw new HttpError(code, msg); };

// პირველი ადმინი იქმნება Railway Variables-დან (ADMIN_EMAIL, ADMIN_PASSWORD), მხოლოდ ცარიელ ბაზაზე
async function ensureAdmin() {
  const any = await db.one("select id from users limit 1");
  if (any) return;
  const email = str(process.env.ADMIN_EMAIL, 160).toLowerCase(), pw = String(process.env.ADMIN_PASSWORD || "");
  if (!isEmail(email) || pw.length < 8) { console.warn("ადმინი ჯერ არ არსებობს: Railway-ში ჩაწერე ADMIN_EMAIL და ADMIN_PASSWORD (მინ. 8 სიმბოლო)"); return; }
  await db.run("insert into users (name, email, pass, role, active, created) values ($1,$2,$3,'admin',true,$4) on conflict (email) do nothing", ["ადმინი", email, auth.hash(pw), iso()]);
  console.log("პირველი ადმინი შეიქმნა: " + email);
}

// მარაგი: მიღებული რაოდენობა stock ცხრილიდან, დანარჩენი შეკვეთებიდან ითვლება
async function stockView(shop) {
  const got = Object.fromEntries((await db.all("select product_id, stock_in from stock")).map((r) => [r.product_id, Number(r.stock_in)]));
  const moves = await db.all("select i.product_id, o.status, sum(i.qty) as q, sum(i.qty * i.price) as rev from order_items i join orders o on o.id = i.order_id group by i.product_id, o.status");
  const by = {};
  for (const m of moves) { const b = (by[m.product_id] ||= {}); b[m.status] = { q: Number(m.q), rev: Number(m.rev) }; }
  const q = (id, ...st) => st.reduce((a, s) => a + (by[id]?.[s]?.q || 0), 0);
  return shop.products.map((p) => {
    const stock_in = got[p.id] || 0, reserved = q(p.id, "new", "assigned"), onway = q(p.id, "picked", "problem"), sold = q(p.id, "delivered");
    return { id: p.id, name: p.ka[0], price: nowPrice(shop, p), hidden: !!p.hidden, stock_in, reserved, onway, sold, left: stock_in - reserved - onway - sold, revenue: by[p.id]?.delivered?.rev || 0 };
  });
}

// შეკვეთების სია: "ყველა შეკვეთის" უფლებით ყველაფერი, თორემ მხოლოდ თავისი გაფორმებული; კურიერისთვის ცალკე სია (deliveries)
async function ordersFor(u, mode = "office") {
  let orders;
  if (mode === "courier") orders = await db.all("select * from orders where courier_id = $1 and (status in ('assigned','picked','problem') or (status = 'delivered' and done_at >= $2)) order by delivery_date, id", [u.id, todayStartIso()]);
  else if (can(u, "orders_all")) orders = await db.all("select * from orders order by id desc limit 500");
  else if (can(u, "order_create")) orders = await db.all("select * from orders where created_by = $1 order by id desc limit 200", [u.id]);
  else orders = [];
  if (!orders.length) return [];
  const ids = new Set(orders.map((o) => Number(o.id))), min = Math.min(...ids);
  const items = (await db.all("select order_id, product_id, name, qty, price from order_items where order_id >= $1 order by id", [min])).filter((i) => ids.has(Number(i.order_id)));
  return orders.map((o) => { num(o, "id", "created_by", "courier_id", "fee"); o.items = items.filter((i) => Number(i.order_id) === o.id).map((i) => ({ product_id: i.product_id, name: i.name, qty: Number(i.qty), price: Number(i.price) })); return o; });
}

const OFFICE = ["order_create", "orders_all", "orders_assign", "couriers_view", "stock_view", "stock_edit", "csv", "emails", "users"];
async function couriersList() {
  return (await db.all("select id, name, role, perms from users where active = true order by name")).filter((c) => can(c, "courier")).map((c) => ({ id: Number(c.id), name: c.name }));
}
async function state(u) {
  const out = { me: pub(u), tomorrow: tbilisiDay(1), today: tbilisiDay(0), imgBase: storage.publicBase(), mailReady: mailReady() };
  if (can(u, "courier")) {
    out.deliveries = (await ordersFor(u, "courier")).map((o) => ({
      id: o.id, customer: o.customer, phone: o.phone, address: o.address, zone: o.zone, note: o.note, delivery_date: o.delivery_date, status: o.status, courier_note: o.courier_note,
      collect: o.items.reduce((a, i) => a + i.qty * i.price, 0) + o.fee, items: o.items.map((i) => ({ name: i.name, qty: i.qty })),
    }));
  }
  if (!can(u, ...OFFICE)) return out;
  const shop = await getShop();
  let products = await stockView(shop);
  const names = Object.fromEntries((await db.all("select id, name from users")).map((x) => [Number(x.id), x.name]));
  const orders = (await ordersFor(u)).map((o) => ({ ...o, courier: names[o.courier_id] || "", seller: names[o.created_by] || "" }));
  const thumbs = Object.fromEntries(shop.products.map((p) => [p.id, p.imgs[0] ? p.imgs[0][0] : ""]));
  products = products.map((p) => ({ ...p, img: thumbs[p.id] || "" }));
  if (!can(u, "stock_edit")) products = products.map(({ id, name, price, left, hidden, img }) => ({ id, name, price, left, hidden, img }));
  Object.assign(out, { products, couriers: await couriersList(), orders });
  if (can(u, "users")) out.users = (await db.all("select id, name, email, role, active, perms from users order by role, name")).map((x) => ({ ...num(x, "id"), active: !!x.active, perms: permsOf(x) }));
  if (can(u, "emails")) out.emails = (await db.all("select * from emails order by id desc limit 60")).map((x) => num(x, "id", "order_id"));
  return out;
}

module.exports = function register(app) {
  const h = (fn) => async (req, res) => {
    try { await fn(req, res); }
    catch (err) {
      if (err instanceof HttpError) return res.status(err.code).json({ error: err.message });
      console.error(err);
      res.status(500).json({ error: "სერვერის შეცდომა. სცადე ხელახლა." });
    }
  };
  async function me(req) {
    const uid = auth.userIdFrom(req);
    if (!uid) return null;
    const u = await db.one("select * from users where id = $1 and active = true", [uid]);
    return u ? num(u, "id") : null;
  }
  // need(req, "a", "b"): შესული უნდა იყოს და ერთ-ერთი უფლება მაინც ჰქონდეს
  const need = async (req, ...perms) => { const u = await me(req); if (!u) fail(401, "შედი სისტემაში."); if (perms.length && !can(u, ...perms)) fail(403, "უფლება არ გაქვს."); return u; };

  // ყველა ცვლილება (POST) საჭიროებს ჩვენს სათაურს: ასე სხვა საიტი ვერ გააგზავნის ფორმას შენი სახელით
  app.use("/api", (req, res, next) => {
    if (req.method !== "GET" && req.headers["x-moku"] !== "1") return res.status(403).json({ error: "bad request" });
    res.setHeader("Cache-Control", "no-store");
    next();
  });

  app.post("/api/login", h(async (req, res) => {
    const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket.remoteAddress || "?";
    if (auth.throttled(ip)) fail(429, "ძალიან ბევრი მცდელობა. სცადე 10 წუთში.");
    await ensureAdmin();
    const u = await db.one("select * from users where email = $1 and active = true", [str(req.body.email, 160).toLowerCase()]);
    if (!u || !auth.verify(str(req.body.password, 200), u.pass)) { auth.failed(ip); fail(401, "მეილი ან პაროლი არასწორია."); }
    num(u, "id");
    auth.login(res, u.id);
    res.json(await state(u));
  }));
  app.post("/api/logout", h(async (req, res) => { auth.logout(res); res.json({}); }));
  app.get("/api/state", h(async (req, res) => res.json(await state(await need(req)))));
  app.post("/api/password", h(async (req, res) => {
    const u = await need(req);
    if (!auth.verify(str(req.body.old, 200), u.pass)) fail(400, "ძველი პაროლი არასწორია.");
    if (str(req.body.new, 200).length < 8) fail(400, "ახალი პაროლი მინიმუმ 8 სიმბოლო უნდა იყოს.");
    await db.run("update users set pass = $1 where id = $2", [auth.hash(str(req.body.new, 200)), u.id]);
    res.json({});
  }));

  // ახალი შეკვეთა: გაყიდვები და ადმინი
  app.post("/api/orders", h(async (req, res) => {
    const u = await need(req, "order_create"), b = req.body, shop = await getShop();
    const customer = str(b.customer, 120), phone = str(b.phone, 40), email = str(b.email, 160).toLowerCase(), zone = ZONES[b.zone] ? b.zone : "tbilisi";
    if (!customer || !phone) fail(400, "შეავსე სახელი და ტელეფონი.");
    if (email && !isEmail(email)) fail(400, "მეილის მისამართი არასწორია.");
    const date = /^\d{4}-\d\d-\d\d$/.test(b.delivery_date) ? b.delivery_date : tbilisiDay(1);
    let courier = null;
    if (b.courier_id) { courier = (await couriersList()).find((c) => c.id === int(b.courier_id)) || null; if (!courier) fail(400, "კურიერი ვერ მოიძებნა."); }
    const stock = Object.fromEntries((await stockView(shop)).map((p) => [p.id, p]));
    const items = (Array.isArray(b.items) ? b.items : []).slice(0, 30).map((i) => ({ p: stock[String(i.product_id)], qty: int(i.qty, 1, 999), price: int(i.price) })).filter((i) => i.p);
    if (!items.length) fail(400, "დაამატე მინიმუმ ერთი სათამაშო.");
    const want = {}; items.forEach((i) => (want[i.p.id] = (want[i.p.id] || 0) + i.qty));
    for (const i of items) if (i.p.left < want[i.p.id]) fail(400, `„${i.p.name}“ მარაგში საკმარისი არ არის (დარჩა ${Math.max(0, i.p.left)}).`);
    const fee = b.fee === undefined || b.fee === "" ? ZONES[zone][1] : int(b.fee, 0, 1000);
    const id = await db.tx(async (t) => {
      const o = await t.one(
        "insert into orders (created, created_by, customer, phone, email, address, zone, fee, note, delivery_date, courier_id, status, courier_note) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'') returning id",
        [iso(), u.id, customer, phone, email, str(b.address), zone, fee, str(b.note, 500), date, courier ? courier.id : null, courier ? "assigned" : "new"]
      );
      for (const i of items) await t.run("insert into order_items (order_id, product_id, name, qty, price) values ($1,$2,$3,$4,$5)", [o.id, i.p.id, i.p.name, i.qty, i.price]);
      return Number(o.id);
    });
    mailSafe("order_created", id, email);
    if (courier) { const c = await db.one("select email from users where id = $1", [courier.id]); mailSafe("courier_assigned", id, c && c.email); }
    res.json(await state(u));
  }));

  // შეკვეთის მოქმედებები
  app.post("/api/orders/:id/:act", h(async (req, res) => {
    const u = await need(req), act = req.params.act, b = req.body;
    const o = await db.one("select * from orders where id = $1", [int(req.params.id)]);
    if (!o) fail(404, "შეკვეთა ვერ მოიძებნა.");
    num(o, "id", "created_by", "courier_id");
    const set = (sql, params) => db.run(`update orders set ${sql} where id = $${params.length + 1}`, [...params, o.id]);
    if (["pick", "deliver", "problem"].includes(act) && can(u, "courier") && o.courier_id === u.id) {
      // კურიერის მოქმედებები თავის შეკვეთაზე
      if (act === "pick" && o.status === "assigned") { await set("status = 'picked', picked_at = $1", [iso()]); mailSafe("picked", o.id, o.email); }
      else if (act === "deliver" && ["picked", "problem"].includes(o.status)) await set("status = 'delivered', done_at = $1, courier_note = $2", [iso(), str(b.note, 300)]);
      else if (act === "problem" && ["assigned", "picked"].includes(o.status)) { if (!str(b.note)) fail(400, "დაწერე, რა მოხდა."); await set("status = 'problem', courier_note = $1", [str(b.note, 300)]); }
      else fail(400, "ეს მოქმედება ამ სტატუსზე არ შეიძლება.");
      return res.json(await state(u));
    }
    if (!can(u, "orders_all") && o.created_by !== u.id) fail(404, "შეკვეთა ვერ მოიძებნა."); // სხვისი შეკვეთა "არ არსებობს"
    if (!can(u, "orders_assign")) fail(403, "უფლება არ გაქვს.");
    if (act === "assign" && ["new", "assigned", "problem"].includes(o.status)) {
      const c = (await couriersList()).find((x) => x.id === int(b.courier_id));
      if (!c) fail(400, "აირჩიე კურიერი.");
      const row = await db.one("select email from users where id = $1", [c.id]);
      await set("courier_id = $1, status = 'assigned', courier_note = ''", [c.id]);
      mailSafe("courier_assigned", o.id, row && row.email);
    } else if (act === "cancel" && ["new", "assigned", "problem"].includes(o.status)) await set("status = 'cancelled', done_at = $1", [iso()]);
    else if (act === "deliver" && OPEN.includes(o.status)) await set("status = 'delivered', done_at = $1", [iso()]);
    else if (act === "return" && ["picked", "problem", "delivered"].includes(o.status)) await set("status = 'returned', done_at = $1", [iso()]);
    else fail(400, "ეს მოქმედება ამ სტატუსზე არ შეიძლება.");
    res.json(await state(u));
  }));

  // მყიდველის ძებნა ტელეფონით: ბოლო შეკვეთიდან სახელი და მისამართი (გაყიდვები და ადმინი)
  app.get("/api/customer", h(async (req, res) => {
    await need(req, "order_create");
    const digits = String(req.query.phone || "").replace(/\D/g, "");
    if (digits.length < 6) return res.json({});
    const rows = await db.all("select customer, phone, email, address, zone from orders where regexp_replace(phone, '[^0-9]', '', 'g') like $1 order by id desc limit 1", ["%" + digits.slice(-9)]);
    res.json(rows[0] || {});
  }));

  // შეკვეთების გადმოწერა Excel-ისთვის (CSV): ადმინი
  app.get("/api/orders.csv", h(async (req, res) => {
    await need(req, "csv");
    const names = Object.fromEntries((await db.all("select id, name from users")).map((x) => [Number(x.id), x.name]));
    const orders = await db.all("select * from orders order by id desc limit 5000");
    const items = await db.all("select order_id, name, qty, price from order_items order by id");
    const by = {}; items.forEach((i) => (by[i.order_id] ||= []).push(`${i.name} × ${i.qty} (${i.price} ₾)`));
    const ST = { new: "ახალი", assigned: "კურიერი დანიშნულია", picked: "კურიერმა აიღო", problem: "ვერ ჩაბარდა", delivered: "ჩაბარებული", returned: "დაბრუნდა", cancelled: "გაუქმდა" };
    const cell = (v) => '"' + String(v ?? "").replace(/"/g, '""') + '"';
    const head = ["№", "თარიღი", "სტატუსი", "მყიდველი", "ტელეფონი", "მეილი", "ზონა", "მისამართი", "სათამაშოები", "მიწოდება ₾", "სულ ₾", "მიტანის დღე", "კურიერი", "გააფორმა", "შენიშვნა"];
    const lines = orders.map((o) => { const sum = items.filter((i) => Number(i.order_id) === Number(o.id)).reduce((a, i) => a + Number(i.qty) * Number(i.price), 0) + Number(o.fee);
      return [o.id, String(o.created).slice(0, 16).replace("T", " "), ST[o.status] || o.status, o.customer, o.phone, o.email, ZONES[o.zone]?.[0] || o.zone, o.address, (by[o.id] || []).join("; "), o.fee, sum, o.delivery_date, names[o.courier_id] || "", names[o.created_by] || "", o.note].map(cell).join(";"); });
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="moku-orders-${tbilisiDay(0)}.csv"`);
    res.send("\ufeff" + [head.map(cell).join(";"), ...lines].join("\r\n"));
  }));

  // მარაგი: მხოლოდ ადმინი წერს, რამდენი ცალი მიიღო
  app.post("/api/stock/:pid", h(async (req, res) => {
    const u = await need(req, "stock_edit"), shop = await getShop();
    if (!shop.products.some((p) => p.id === req.params.pid)) fail(404, "სათამაშო ვერ მოიძებნა.");
    await db.run("insert into stock (product_id, stock_in) values ($1,$2) on conflict (product_id) do update set stock_in = excluded.stock_in", [req.params.pid, int(req.body.stock_in)]);
    res.json(await state(u));
  }));

  // თანამშრომლები
  app.post("/api/users", h(async (req, res) => {
    const u = await need(req, "users"), b = req.body, email = str(b.email, 160).toLowerCase(), pw = str(b.password, 200);
    if (!str(b.name) || !isEmail(email)) fail(400, "შეავსე სახელი და სწორი მეილი.");
    if (pw.length < 8) fail(400, "პაროლი მინიმუმ 8 სიმბოლო უნდა იყოს.");
    if (!ROLES.includes(b.role)) fail(400, "აირჩიე როლი.");
    if (b.role === "admin" && u.role !== "admin") fail(403, "ადმინის დამატება მხოლოდ ადმინს შეუძლია.");
    if (await db.one("select id from users where email = $1", [email])) fail(400, "ეს მეილი უკვე რეგისტრირებულია.");
    const perms = b.role === "admin" ? "" : Array.isArray(b.perms) ? cleanPerms(b.perms) : PRESET[b.role].join(",");
    await db.run("insert into users (name, email, pass, role, active, created, perms) values ($1,$2,$3,$4,true,$5,$6)", [str(b.name, 80), email, auth.hash(pw), b.role, iso(), perms]);
    res.json(await state(u));
  }));
  app.post("/api/users/:id", h(async (req, res) => {
    const u = await need(req, "users"), b = req.body, t = await db.one("select id, role from users where id = $1", [int(req.params.id)]);
    if (!t) fail(404, "ვერ მოიძებნა.");
    const tid = Number(t.id);
    if (t.role === "admin" && u.role !== "admin") fail(403, "ადმინის შეცვლა მხოლოდ ადმინს შეუძლია.");
    if (b.perms !== undefined) {
      // უფლებების შეცვლა: საკუთარ თავს ვერა (რომ შემთხვევით არ ჩაიკეტო); ადმინს უფლებები როლითვე აქვს
      if (tid === u.id) fail(400, "საკუთარ უფლებებს ვერ შეცვლი.");
      if (t.role !== "admin") await db.run("update users set perms = $1 where id = $2", [cleanPerms(b.perms), tid]);
    }
    if (b.active !== undefined) { if (tid === u.id) fail(400, "საკუთარ თავს ვერ გათიშავ."); await db.run("update users set active = $1 where id = $2", [!!b.active, tid]); }
    if (b.password !== undefined) { if (str(b.password, 200).length < 8) fail(400, "პაროლი მინიმუმ 8 სიმბოლო უნდა იყოს."); await db.run("update users set pass = $1 where id = $2", [auth.hash(str(b.password, 200)), tid]); }
    res.json(await state(u));
  }));

  // ვერ გაგზავნილი წერილის ხელახლა გაგზავნა
  app.post("/api/emails/:id/retry", h(async (req, res) => {
    const u = await need(req, "emails"), e = await db.one("select * from emails where id = $1", [int(req.params.id)]);
    if (!e || !e.to_addr) fail(400, "ვერ გაიგზავნა.");
    await db.run("delete from emails where id = $1", [e.id]);
    await mail(e.kind, Number(e.order_id), e.to_addr);
    res.json(await state(u));
  }));

  // მაღაზიის მონაცემები პანელისთვის
  app.get("/api/shop", h(async (req, res) => {
    await need(req, "site_edit");
    res.json({ data: await getShop(), imgBase: storage.publicBase(), uploads: storage.ready() });
  }));

  // ფოტოს ატვირთვა პანელიდან: ბრაუზერი უკვე შეამცირა, აქედან Supabase-ში მიდის
  app.post("/api/images/:file", express.raw({ type: ["image/webp", "image/jpeg", "image/png"], limit: "8mb" }), h(async (req, res) => {
    await need(req, "site_edit");
    const file = req.params.file;
    if (!/^u-[a-z0-9]{8,30}-(480|960|1400)\.webp$|^u-[a-z0-9]{8,30}-1200\.jpg$/.test(file)) fail(400, "ფაილის სახელი არასწორია.");
    const type = String(req.headers["content-type"] || "").split(";")[0];
    if (!["image/webp", "image/jpeg", "image/png"].includes(type) || !Buffer.isBuffer(req.body) || !req.body.length) fail(400, "ფაილი არ არის სურათი.");
    try { await storage.upload(file, req.body, type); } catch (e) { fail(502, e.message); }
    res.json({ ok: true });
  }));

  // მაღაზიის ტექსტები, სათამაშოები, ფასები (საიტზე ჩაშენებული პანელიდან)
  app.post("/api/shop", h(async (req, res) => {
    await need(req, "site_edit");
    const err = await saveShop(req.body && req.body.data);
    if (err) fail(400, err);
    res.json({ ok: true });
  }));

  // საიტისთვის: რამდენი ცალია თავისუფალი. მხოლოდ ის სათამაშოები, რომლის მარაგიც ჩაწერილია
  // და მხოლოდ მაშინ, თუ პანელში "მარაგის წარწერა" ჩართულია. სხვა შემთხვევაში არაფერს ვამბობთ.
  async function stockLeft(shop) {
    if (shop.showStock === false) return {};
    const has = new Set((await db.all("select product_id from stock")).map((r) => r.product_id));
    return Object.fromEntries((await stockView(shop)).filter((p) => has.has(p.id)).map((p) => [p.id, Math.max(0, p.left)]));
  }

  return { me, ensureAdmin, stockLeft, can };
};
