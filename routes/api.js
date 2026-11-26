// მართვის სისტემის API: შესვლა, მარაგი, შეკვეთები, კურიერი, თანამშრომლები, წერილები, მაღაზიის შენახვა.
const express = require("express");
const db = require("../db");
const storage = require("../lib/storage");
const auth = require("../lib/auth");
const { getShop, saveShop, nowPrice } = require("../lib/shop");
const { mailSafe, mail, staffSafe, ready: mailReady, ZONES, APP_URL } = require("../lib/mail");
const finance = require("./finance"), visits = require("./visits");

const ROLES = ["admin", "sales", "courier"];
// უფლებები: თანამშრომელი ხედავს და აკეთებს მხოლოდ იმას, რისი უფლებაც აქვს. ადმინს ყველაფერი აქვს.
const PERMS = ["order_create", "orders_all", "orders_edit", "orders_cancel", "order_price", "csv",
  "orders_assign", "couriers_view", "courier",
  "stock_view", "stock_receive", "stock_edit",
  "finance_view",
  "site_texts", "site_products", "site_prices", "site_contact",
  "users", "emails", "audit_view"];
const SITE = ["site_texts", "site_products", "site_prices", "site_contact"];
// მზა შაბლონები (როლი ბაზაში: admin / sales / courier; დანარჩენი მხოლოდ უფლებების ნაკრებია)
const TEMPLATES = {
  sales: { role: "sales", title: "გამყიდველი", perms: ["order_create", "stock_view"] },
  senior: { role: "sales", title: "უფროსი გამყიდველი", perms: ["order_create", "orders_all", "orders_edit", "orders_cancel", "order_price", "orders_assign", "couriers_view", "stock_view", "csv"] },
  courier: { role: "courier", title: "კურიერი", perms: ["courier"] },
  warehouse: { role: "sales", title: "საწყობი", perms: ["stock_view", "stock_receive", "stock_edit", "orders_all", "orders_assign", "couriers_view"] },
  site: { role: "sales", title: "საიტის მენეჯერი", perms: ["site_texts", "site_products", "site_contact"] },
  admin: { role: "admin", title: "ადმინი", perms: [] },
};
const PRESET = { admin: PERMS, sales: TEMPLATES.sales.perms, courier: ["courier"] };
// ადმინს ყველა უფლება აქვს, გარდა კურიერის რეჟიმისა (რომ კურიერების სიაში არ გამოჩნდეს).
// ძველი "site_edit" (SQL 011-მდე) = საიტის ოთხივე უფლება.
const permsOf = (u) => {
  if (u.role === "admin") return PERMS.filter((p) => p !== "courier");
  let list = u.perms === undefined || u.perms === null ? PRESET[u.role] || [] : String(u.perms).split(",");
  if (list.includes("site_edit")) list = [...list, ...SITE];
  return PERMS.filter((p) => list.includes(p));
};
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
const pub = (u) => ({ id: u.id, name: u.name, email: u.email, role: u.role, title: u.title || "", perms: permsOf(u) });
const num = (o, ...keys) => { keys.forEach((k) => { if (o[k] !== null && o[k] !== undefined) o[k] = Number(o[k]); }); return o; };

class HttpError extends Error { constructor(code, msg) { super(msg); this.code = code; } }
const fail = (code, msg) => { throw new HttpError(code, msg); };

// ცვლილებების ჟურნალი: ვინ, როდის, რა. ჩაწერის შეცდომა მთავარ მოქმედებას არ აჩერებს.
async function logA(u, action, detail = "", orderId = null) {
  try { await db.run("insert into audit (at, user_id, user_name, action, detail, order_id) values ($1,$2,$3,$4,$5,$6)", [iso(), u ? u.id : null, u ? u.name : "", action, String(detail).slice(0, 2000), orderId]); }
  catch (e) { console.error("ჟურნალი:", e.message); }
}

// პაროლის დაყენების ბმული (ერთჯერადი: მიბმულია მიმდინარე პაროლზე, შეცვლისთანავე კვდება)
const resetLink = (u, ttl) => `${APP_URL || ""}/admin?reset=${encodeURIComponent(auth.makeReset(u.id, u.pass, ttl))}`;

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
    return { id: p.id, name: p.ka[0] + (p.ka[4] ? " · " + ((x) => (x.split(":")[0].trim().length < 12 ? x : x.split(":")[0].trim()))(String(p.ka[4]).trim()) : ""), price: nowPrice(shop, p), hidden: !!p.hidden, stock_in, reserved, onway, sold, left: stock_in - reserved - onway - sold, revenue: by[p.id]?.delivered?.rev || 0 };
  });
}

// შეკვეთების სია: "ყველა შეკვეთის" უფლებით ყველაფერი, თორემ მხოლოდ თავისი გაფორმებული; კურიერისთვის ცალკე სია (deliveries)
async function ordersFor(u, mode = "office") {
  let orders;
  if (mode === "courier") orders = await db.all("select * from orders where courier_id = $1 and (status in ('assigned','picked','problem') or (status = 'delivered' and done_at >= $2)) order by delivery_date, id", [u.id, todayStartIso()]);
  else if (can(u, "orders_all", "couriers_view", "finance_view")) orders = await db.all("select * from orders order by id desc limit 3000"); // კურიერების ფურცელს და სტატისტიკას ყველა შეკვეთა სჭირდება
  else if (can(u, "order_create")) orders = await db.all("select * from orders where created_by = $1 order by id desc limit 200", [u.id]);
  else orders = [];
  if (!orders.length) return [];
  const ids = new Set(orders.map((o) => Number(o.id))), min = Math.min(...ids);
  const items = (await db.all("select order_id, product_id, name, qty, price from order_items where order_id >= $1 order by id", [min])).filter((i) => ids.has(Number(i.order_id)));
  return orders.map((o) => { num(o, "id", "created_by", "courier_id", "fee"); o.items = items.filter((i) => Number(i.order_id) === o.id).map((i) => ({ product_id: i.product_id, name: i.name, qty: Number(i.qty), price: Number(i.price) })); return o; });
}

const OFFICE = PERMS.filter((p) => p !== "courier" && !SITE.includes(p)); // ოფისის ნებისმიერი უფლება
async function couriersList() {
  return (await db.all("select * from users where active = true order by name")).filter((c) => can(c, "courier")).map((c) => ({ id: Number(c.id), name: c.name }));
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
  // ვისაც მხოლოდ ფინანსების ნახვა აქვს, სხვის შეკვეთაში მყიდველის კონტაქტს ვერ ხედავს
  const privacy = !can(u, "orders_all", "couriers_view");
  const orders = (await ordersFor(u)).map((o) => ({ ...o, courier: names[o.courier_id] || "", seller: names[o.created_by] || "", ...(privacy && o.created_by !== u.id ? { customer: "მყიდველი", phone: "", email: "", address: "", note: "", courier_note: "" } : {}) }));
  const thumbs = Object.fromEntries(shop.products.map((p) => [p.id, p.imgs[0] ? p.imgs[0][0] : ""]));
  products = products.map((p) => ({ ...p, img: thumbs[p.id] || "" }));
  if (!can(u, "stock_edit", "stock_receive")) products = products.map(({ id, name, price, left, hidden, img }) => ({ id, name, price, left, hidden, img }));
  else if (!can(u, "finance_view")) products = products.map(({ revenue, ...p }) => p);
  Object.assign(out, { products, couriers: await couriersList(), orders, sellers: Object.entries(names).map(([id, name]) => ({ id: Number(id), name })) });
  if (can(u, "stock_edit", "stock_receive")) {
    const pn = Object.fromEntries(products.map((p) => [p.id, p.name]));
    out.moves = (await db.all("select * from stock_moves order by id desc limit 150").catch(() => [])).map((m) => ({ id: Number(m.id), at: m.at, product: pn[m.product_id] || m.product_id, qty: Number(m.qty), kind: m.kind, note: m.note, by: names[m.user_id] || "" }));
  }
  if (can(u, "users")) out.users = (await db.all("select * from users order by active desc, role, name")).map((x) => ({ id: Number(x.id), name: x.name, email: x.email, role: x.role, title: x.title || "", active: !!x.active, last_login: x.last_login || null, perms: permsOf(x) }));
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
    const ses = auth.sessionFrom(req);
    if (!ses || !ses.uid) return null;
    const u = await db.one("select * from users where id = $1 and active = true", [ses.uid]);
    if (!u || (Number(u.session_ver) || 0) !== ses.v) return null; // „ყველგან გამოსვლის“ ან გათიშვის შემდეგ ძველი შესვლა აღარ მოქმედებს
    return num(u, "id");
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
    auth.login(res, u.id, Number(u.session_ver) || 0);
    await db.run("update users set last_login = $1 where id = $2", [iso(), u.id]);
    await logA(u, "შესვლა");
    res.json(await state(u));
  }));
  // პაროლის აღდგენა მეილით. პასუხი ყოველთვის ერთნაირია, რომ არავინ გაიგოს, რომელი მეილია სისტემაში.
  app.post("/api/forgot", h(async (req, res) => {
    const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket.remoteAddress || "?";
    if (auth.throttled(ip)) fail(429, "ძალიან ბევრი მცდელობა. სცადე 10 წუთში.");
    auth.failed(ip); // ერთი მისამართიდან 10 მოთხოვნა 10 წუთში
    if (!mailReady()) fail(503, "მეილის სერვისი ჯერ არ მუშაობს. პაროლის შესაცვლელად მიმართე ადმინს.");
    const u = await db.one("select * from users where email = $1 and active = true", [str(req.body.email, 160).toLowerCase()]);
    if (u) { num(u, "id"); staffSafe("pw_reset", u, { link: resetLink(u, 3600e3) }); await logA(u, "პაროლის აღდგენის მოთხოვნა"); }
    res.json({ ok: true });
  }));
  app.post("/api/reset", h(async (req, res) => {
    const t = auth.readReset(req.body.token), pw = str(req.body.password, 200);
    const u = t && (await db.one("select * from users where id = $1 and active = true", [t.uid]));
    if (!u || auth.passTag(u.pass) !== t.tag) fail(400, "ბმული აღარ მოქმედებს (ვადა გაუვიდა ან უკვე გამოყენებულია). მოითხოვე ახალი.");
    if (pw.length < 8) fail(400, "პაროლი მინიმუმ 8 სიმბოლო უნდა იყოს.");
    num(u, "id");
    const ver = (Number(u.session_ver) || 0) + 1, ph = auth.hash(pw);
    await db.run("update users set pass = $1, session_ver = $2, last_login = $3 where id = $4", [ph, ver, iso(), u.id]);
    auth.login(res, u.id, ver);
    await logA(u, "პაროლი აღდგა მეილით");
    staffSafe("pw_changed", u, { link: resetLink({ ...u, pass: ph }, 3600e3) });
    res.json(await state({ ...u, session_ver: ver }));
  }));
  app.post("/api/logout", h(async (req, res) => { auth.logout(res); res.json({}); }));
  app.get("/api/state", h(async (req, res) => res.json(await state(await need(req)))));
  app.post("/api/password", h(async (req, res) => {
    const u = await need(req);
    if (!auth.verify(str(req.body.old, 200), u.pass)) fail(400, "ძველი პაროლი არასწორია.");
    if (str(req.body.new, 200).length < 8) fail(400, "ახალი პაროლი მინიმუმ 8 სიმბოლო უნდა იყოს.");
    const ver = (Number(u.session_ver) || 0) + 1, ph = auth.hash(str(req.body.new, 200));
    await db.run("update users set pass = $1, session_ver = $2 where id = $3", [ph, ver, u.id]);
    auth.login(res, u.id, ver); // ეს მოწყობილობა რჩება შესული, დანარჩენები გამოდის
    await logA(u, "საკუთარი პაროლის შეცვლა");
    staffSafe("pw_changed", u, { link: resetLink({ ...u, pass: ph }, 3600e3) });
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
    // ფასის შეცვლის უფლების გარეშე ფასი და მიწოდება ყოველთვის საიტის ფასია
    const pricing = can(u, "order_price");
    const items = (Array.isArray(b.items) ? b.items : []).slice(0, 30).map((i) => { const p = stock[String(i.product_id)]; return { p, qty: int(i.qty, 1, 999), price: pricing ? int(i.price) : p ? p.price : 0 }; }).filter((i) => i.p);
    if (!items.length) fail(400, "დაამატე მინიმუმ ერთი სათამაშო.");
    const want = {}; items.forEach((i) => (want[i.p.id] = (want[i.p.id] || 0) + i.qty));
    for (const i of items) if (i.p.left < want[i.p.id]) fail(400, `„${i.p.name}“ მარაგში საკმარისი არ არის (დარჩა ${Math.max(0, i.p.left)}).`);
    const fee = !pricing || b.fee === undefined || b.fee === "" ? ZONES[zone][1] : int(b.fee, 0, 1000);
    const costs = await finance.costMap(); // გაყიდვის მომენტის თვითღირებულება (მოგება-ზარალისთვის)
    const id = await db.tx(async (t) => {
      const o = await t.one(
        "insert into orders (created, created_by, customer, phone, email, address, zone, fee, note, delivery_date, courier_id, status, courier_note) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'') returning id",
        [iso(), u.id, customer, phone, email, str(b.address), zone, fee, str(b.note, 500), date, courier ? courier.id : null, courier ? "assigned" : "new"]
      );
      for (const i of items) await t.run("insert into order_items (order_id, product_id, name, qty, price, cost) values ($1,$2,$3,$4,$5,$6)", [o.id, i.p.id, i.p.name, i.qty, i.price, costs[i.p.id]?.set ? costs[i.p.id].cost : null]);
      return Number(o.id);
    });
    await logA(u, "შეკვეთა გაფორმდა", `${customer} · ${items.map((i) => `${i.p.name} × ${i.qty} (${i.price} ₾)`).join(", ")} · მიწოდება ${fee} ₾${courier ? " · კურიერი: " + courier.name : ""}`, id);
    mailSafe("order_created", id, email);
    if (courier) { const c = await db.one("select email from users where id = $1", [courier.id]); mailSafe("courier_assigned", id, c && c.email); }
    res.json(await state(u));
  }));

  // შეკვეთის შესწორება: მყიდველი, მისამართი, დღე, სათამაშოები (სანამ კურიერს არ აუღია)
  app.post("/api/orders/:id/edit", h(async (req, res) => {
    const u = await need(req, "orders_edit"), b = req.body, shop = await getShop();
    const o = await db.one("select * from orders where id = $1", [int(req.params.id)]);
    if (!o) fail(404, "შეკვეთა ვერ მოიძებნა.");
    num(o, "id", "created_by", "courier_id", "fee");
    if (!can(u, "orders_all") && o.created_by !== u.id) fail(404, "შეკვეთა ვერ მოიძებნა.");
    if (!["new", "assigned"].includes(o.status)) fail(400, "შესწორება შეიძლება მხოლოდ მანამ, სანამ კურიერი შეკვეთას აიღებს.");
    const customer = str(b.customer, 120), phone = str(b.phone, 40), email = str(b.email, 160).toLowerCase(), zone = ZONES[b.zone] ? b.zone : o.zone;
    if (!customer || !phone) fail(400, "შეავსე სახელი და ტელეფონი.");
    if (email && !isEmail(email)) fail(400, "მეილის მისამართი არასწორია.");
    const date = /^\d{4}-\d\d-\d\d$/.test(b.delivery_date) ? b.delivery_date : o.delivery_date;
    const old = (await db.all("select product_id, name, qty, price, cost from order_items where order_id = $1", [o.id])).map((i) => ({ ...i, qty: Number(i.qty), price: Number(i.price) }));
    const costs = await finance.costMap(), oldCost = Object.fromEntries(old.filter((i) => i.cost !== null && i.cost !== undefined).map((i) => [i.product_id, Number(i.cost)]));
    const stock = Object.fromEntries((await stockView(shop)).map((p) => [p.id, p]));
    const pricing = can(u, "order_price"), oldPrice = Object.fromEntries(old.map((i) => [i.product_id, i.price]));
    const items = (Array.isArray(b.items) ? b.items : []).slice(0, 30).map((i) => { const p = stock[String(i.product_id)]; return { p, qty: int(i.qty, 1, 999), price: pricing ? int(i.price) : p ? (oldPrice[p.id] ?? p.price) : 0 }; }).filter((i) => i.p);
    if (!items.length) fail(400, "დაამატე მინიმუმ ერთი სათამაშო.");
    // მარაგი: ამ შეკვეთის ძველი რაოდენობა თავისუფლად ითვლება
    const mine = {}; old.forEach((i) => (mine[i.product_id] = (mine[i.product_id] || 0) + i.qty));
    const want = {}; items.forEach((i) => (want[i.p.id] = (want[i.p.id] || 0) + i.qty));
    for (const i of items) if (i.p.left + (mine[i.p.id] || 0) < want[i.p.id]) fail(400, `„${i.p.name}“ მარაგში საკმარისი არ არის (დარჩა ${Math.max(0, i.p.left + (mine[i.p.id] || 0))}).`);
    const fee = pricing && b.fee !== undefined && b.fee !== "" ? int(b.fee, 0, 1000) : zone === o.zone ? o.fee : ZONES[zone][1];
    await db.tx(async (t) => {
      await t.run("update orders set customer = $1, phone = $2, email = $3, address = $4, zone = $5, fee = $6, note = $7, delivery_date = $8 where id = $9", [customer, phone, email, str(b.address), zone, fee, str(b.note, 500), date, o.id]);
      await t.run("delete from order_items where order_id = $1", [o.id]);
      for (const i of items) await t.run("insert into order_items (order_id, product_id, name, qty, price, cost) values ($1,$2,$3,$4,$5,$6)", [o.id, i.p.id, i.p.name, i.qty, i.price, oldCost[i.p.id] ?? (costs[i.p.id]?.set ? costs[i.p.id].cost : null)]);
    });
    const ch = [];
    if (customer !== o.customer) ch.push(`სახელი: ${o.customer} → ${customer}`);
    if (phone !== o.phone) ch.push(`ტელეფონი: ${o.phone} → ${phone}`);
    if (email !== o.email) ch.push(`მეილი: ${o.email || "—"} → ${email || "—"}`);
    if (str(b.address) !== o.address) ch.push(`მისამართი: ${o.address || "—"} → ${str(b.address) || "—"}`);
    if (date !== o.delivery_date) ch.push(`მიტანის დღე: ${o.delivery_date} → ${date}`);
    if (fee !== o.fee) ch.push(`მიწოდება: ${o.fee} → ${fee} ₾`);
    if (str(b.note, 500) !== o.note) ch.push("შენიშვნა შეიცვალა");
    const fmt = (l) => l.map((i) => `${i.name} × ${i.qty} (${i.price} ₾)`).join(", ");
    const nw = items.map((i) => ({ name: i.p.name, qty: i.qty, price: i.price }));
    if (fmt(old) !== fmt(nw)) ch.push(`სათამაშოები: ${fmt(old)} → ${fmt(nw)}`);
    await logA(u, "შეკვეთა შესწორდა", ch.join(" · ") || "ცვლილება არ ყოფილა", o.id);
    res.json(await state(u));
  }));

  // შეკვეთის ისტორია (ჟურნალიდან)
  app.get("/api/orders/:id/history", h(async (req, res) => {
    const u = await need(req), id = int(req.params.id);
    const o = await db.one("select id, created_by, courier_id from orders where id = $1", [id]);
    if (!o || !(can(u, "orders_all") || Number(o.created_by) === u.id || (can(u, "courier") && Number(o.courier_id) === u.id))) fail(404, "შეკვეთა ვერ მოიძებნა.");
    res.json({ rows: (await db.all("select at, user_name, action, detail from audit where order_id = $1 order by id", [id])) });
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
      if (act === "pick" && o.status === "assigned") { await set("status = 'picked', picked_at = $1", [iso()]); await logA(u, "კურიერმა აიღო", "", o.id); mailSafe("picked", o.id, o.email); }
      else if (act === "deliver" && ["picked", "problem"].includes(o.status)) { await set("status = 'delivered', done_at = $1, courier_note = $2", [iso(), str(b.note, 300)]); await logA(u, "ჩაბარდა", str(b.note, 300), o.id); }
      else if (act === "problem" && ["assigned", "picked"].includes(o.status)) { if (!str(b.note)) fail(400, "დაწერე, რა მოხდა."); await set("status = 'problem', courier_note = $1", [str(b.note, 300)]); await logA(u, "ვერ ჩაბარდა", str(b.note, 300), o.id); }
      else fail(400, "ეს მოქმედება ამ სტატუსზე არ შეიძლება.");
      return res.json(await state(u));
    }
    if (!can(u, "orders_all") && o.created_by !== u.id) fail(404, "შეკვეთა ვერ მოიძებნა."); // სხვისი შეკვეთა "არ არსებობს"
    if (!can(u, act === "cancel" ? "orders_cancel" : "orders_assign")) fail(403, "უფლება არ გაქვს.");
    if (act === "assign" && ["new", "assigned", "problem"].includes(o.status)) {
      const c = (await couriersList()).find((x) => x.id === int(b.courier_id));
      if (!c) fail(400, "აირჩიე კურიერი.");
      const row = await db.one("select email from users where id = $1", [c.id]);
      await set("courier_id = $1, status = 'assigned', courier_note = ''", [c.id]);
      await logA(u, o.courier_id ? "კურიერი შეიცვალა" : "კურიერი დაინიშნა", c.name, o.id);
      mailSafe("courier_assigned", o.id, row && row.email);
    } else if (act === "cancel" && ["new", "assigned", "problem"].includes(o.status)) { await set("status = 'cancelled', done_at = $1", [iso()]); await logA(u, "შეკვეთა გაუქმდა", str(b.note, 300), o.id); }
    else if (act === "deliver" && OPEN.includes(o.status)) { await set("status = 'delivered', done_at = $1", [iso()]); await logA(u, "მონიშნა ჩაბარებულად", "", o.id); }
    else if (act === "return" && ["picked", "problem", "delivered"].includes(o.status)) { await set("status = 'returned', done_at = $1", [iso()]); await logA(u, "შეკვეთა დაბრუნდა", str(b.note, 300), o.id); }
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

  // მარაგი: ჯამში მიღებული (stock.stock_in) + მოძრაობის ისტორია (stock_moves)
  const pname = (shop, id) => { const p = shop.products.find((x) => x.id === id); return p ? p.ka[0] : id; };
  async function moveStock(t, u, pid, qty, kind, note) {
    await t.run("insert into stock (product_id, stock_in) values ($1, 0) on conflict (product_id) do nothing", [pid]);
    const row = await t.one("select stock_in from stock where product_id = $1", [pid]);
    const next = Number(row.stock_in) + qty;
    if (next < 0) fail(400, "მარაგი უარყოფითი ვერ გახდება.");
    await t.run("update stock set stock_in = $1 where product_id = $2", [next, pid]);
    await t.run("insert into stock_moves (at, product_id, qty, kind, note, user_id) values ($1,$2,$3,$4,$5,$6)", [iso(), pid, qty, kind, note, u.id]);
  }
  // ახალი პარტიის მიღება: რამდენიმე სათამაშო ერთად
  app.post("/api/stock/receive", h(async (req, res) => {
    const u = await need(req, "stock_receive", "stock_edit"), shop = await getShop(), note = str(req.body.note, 200);
    const rows = (Array.isArray(req.body.items) ? req.body.items : []).map((i) => ({ id: String(i.id), qty: int(i.qty, 0, 100000) })).filter((i) => i.qty > 0 && shop.products.some((p) => p.id === i.id));
    if (!rows.length) fail(400, "ჩაწერე, რომელი სათამაშოდან რამდენი ცალი მიიღე.");
    await db.tx(async (t) => { for (const r of rows) await moveStock(t, u, r.id, r.qty, "receive", note); });
    await logA(u, "პარტია მიღებულია", rows.map((r) => `${pname(shop, r.id)} +${r.qty}`).join(", ") + (note ? " · " + note : ""));
    res.json(await state(u));
  }));
  // კორექცია: დაზიანდა, დაიკარგა, დათვლის შესწორება (+ ან -)
  app.post("/api/stock/adjust", h(async (req, res) => {
    const u = await need(req, "stock_edit"), shop = await getShop(), b = req.body, pid = String(b.id || ""), qty = Math.round(Number(b.qty)), note = str(b.note, 200);
    if (!shop.products.some((p) => p.id === pid)) fail(404, "სათამაშო ვერ მოიძებნა.");
    if (!Number.isFinite(qty) || !qty || Math.abs(qty) > 100000) fail(400, "ჩაწერე რაოდენობა (მაგ. -1 ან 2).");
    if (!note) fail(400, "დაწერე მიზეზი (მაგ. დაზიანდა).");
    await db.tx((t) => moveStock(t, u, pid, qty, "adjust", note));
    await logA(u, "მარაგის კორექცია", `${pname(shop, pid)} ${qty > 0 ? "+" : ""}${qty} · ${note}`);
    res.json(await state(u));
  }));
  // ჯამის პირდაპირ ჩაწერა (ძველი გზა): სხვაობა მოძრაობად ჩაიწერება
  app.post("/api/stock/:pid", h(async (req, res) => {
    const u = await need(req, "stock_edit"), shop = await getShop(), pid = req.params.pid;
    if (!shop.products.some((p) => p.id === pid)) fail(404, "სათამაშო ვერ მოიძებნა.");
    const cur = Number((await db.one("select stock_in from stock where product_id = $1", [pid]))?.stock_in || 0), next = int(req.body.stock_in), diff = next - cur;
    await db.run("insert into stock (product_id, stock_in) values ($1, 0) on conflict (product_id) do nothing", [pid]); // 0-იც „ჩაწერილი მარაგია“
    if (diff) {
      await db.tx((t) => moveStock(t, u, pid, diff, "adjust", "ჯამის შესწორება"));
      await logA(u, "მარაგის კორექცია", `${pname(shop, pid)}: ${cur} → ${next}`);
    }
    res.json(await state(u));
  }));

  // თანამშრომლები. ვინც ადმინი არ არის, სხვას ვერ მისცემს იმაზე მეტს, რაც თავად აქვს, და ვერც თანამშრომლების მართვას.
  const limitPerms = (u, list) => { const mine = permsOf(u); return cleanPerms(list).split(",").filter((p) => p && (u.role === "admin" || (mine.includes(p) && p !== "users"))).join(","); };
  const permNames = (csv) => String(csv || "").split(",").filter(Boolean).length;
  app.post("/api/users", h(async (req, res) => {
    const u = await need(req, "users"), b = req.body, email = str(b.email, 160).toLowerCase(), pw = str(b.password, 200);
    const tpl = TEMPLATES[b.template] || null, role = tpl ? tpl.role : b.role;
    if (!str(b.name) || !isEmail(email)) fail(400, "შეავსე სახელი და სწორი მეილი.");
    if (pw.length < 8) fail(400, "პაროლი მინიმუმ 8 სიმბოლო უნდა იყოს.");
    if (!ROLES.includes(role)) fail(400, "აირჩიე შაბლონი.");
    if (role === "admin" && u.role !== "admin") fail(403, "ადმინის დამატება მხოლოდ ადმინს შეუძლია.");
    if (await db.one("select id from users where email = $1", [email])) fail(400, "ეს მეილი უკვე რეგისტრირებულია.");
    const perms = role === "admin" ? "" : limitPerms(u, Array.isArray(b.perms) ? b.perms : tpl ? tpl.perms : PRESET[role]);
    const title = str(b.title, 60) || (tpl ? tpl.title : "");
    const nu = await db.one("insert into users (name, email, pass, role, active, created, perms, title) values ($1,$2,$3,$4,true,$5,$6,$7) returning *", [str(b.name, 80), email, auth.hash(pw), role, iso(), perms, title]);
    num(nu, "id"); staffSafe("welcome", nu, { link: resetLink(nu, 864e5) });
    await logA(u, "თანამშრომელი დაემატა", `${str(b.name, 80)} (${email}) · ${title || role} · უფლებები: ${role === "admin" ? "ყველა" : permNames(perms)}`);
    res.json(await state(u));
  }));
  app.post("/api/users/:id", h(async (req, res) => {
    const u = await need(req, "users"), b = req.body, t = await db.one("select * from users where id = $1", [int(req.params.id)]);
    if (!t) fail(404, "ვერ მოიძებნა.");
    const tid = Number(t.id), self = tid === u.id, ch = [];
    if (t.role === "admin" && u.role !== "admin") fail(403, "ადმინის შეცვლა მხოლოდ ადმინს შეუძლია.");
    if (b.name !== undefined || b.email !== undefined || b.title !== undefined) {
      const name = str(b.name ?? t.name, 80), email = str(b.email ?? t.email, 160).toLowerCase(), title = str(b.title ?? t.title, 60);
      if (!name || !isEmail(email)) fail(400, "შეავსე სახელი და სწორი მეილი.");
      if (email !== t.email && (await db.one("select id from users where email = $1", [email]))) fail(400, "ეს მეილი უკვე რეგისტრირებულია.");
      await db.run("update users set name = $1, email = $2, title = $3 where id = $4", [name, email, title, tid]);
      if (email !== t.email) { const who = { ...t, name }; staffSafe("email_changed", who, { to: t.email, old: t.email, new: email, by: self ? "" : u.name }); staffSafe("email_changed", who, { to: email, old: t.email, new: email, by: self ? "" : u.name }); }
      if (name !== t.name) ch.push(`სახელი: ${t.name} → ${name}`); if (email !== t.email) ch.push(`მეილი: ${t.email} → ${email}`); if (title !== (t.title || "")) ch.push(`თანამდებობა: ${t.title || "—"} → ${title || "—"}`);
    }
    if (b.perms !== undefined) {
      // საკუთარ უფლებებს ვერ შეცვლი (რომ შემთხვევით არ ჩაიკეტო); ადმინს უფლებები როლითვე აქვს
      if (self) fail(400, "საკუთარ უფლებებს ვერ შეცვლი.");
      if (t.role !== "admin") {
        // როლი შაბლონის მიხედვით: კურიერის რეჟიმი = კურიერი, დანარჩენი = გაყიდვები/ოფისი
        const perms = limitPerms(u, b.perms), role = perms.split(",").includes("courier") && perms.split(",").length === 1 ? "courier" : "sales";
        await db.run("update users set perms = $1, role = $2 where id = $3", [perms, role, tid]);
        ch.push(`უფლებები: ${permNames(t.perms)} → ${permNames(perms)}`);
      }
    }
    if (b.active !== undefined) {
      if (self) fail(400, "საკუთარ თავს ვერ გათიშავ.");
      await db.run("update users set active = $1, session_ver = coalesce(session_ver, 0) + 1 where id = $2", [!!b.active, tid]);
      ch.push(b.active ? "ჩაირთო" : "გაითიშა");
    }
    if (b.password !== undefined) {
      if (str(b.password, 200).length < 8) fail(400, "პაროლი მინიმუმ 8 სიმბოლო უნდა იყოს.");
      await db.run("update users set pass = $1" + (self ? "" : ", session_ver = coalesce(session_ver, 0) + 1") + " where id = $2", [auth.hash(str(b.password, 200)), tid]);
      const fresh = await db.one("select * from users where id = $1", [tid]); num(fresh, "id");
      staffSafe("pw_changed", fresh, { by: self ? "" : u.name, link: resetLink(fresh, 3600e3) });
      ch.push("პაროლი შეიცვალა");
    }
    if (b.logoutAll) {
      await db.run("update users set session_ver = coalesce(session_ver, 0) + 1 where id = $1", [tid]);
      ch.push("ყველა მოწყობილობიდან გამოყვანა");
      if (self) { auth.logout(res); await logA(u, "თანამშრომელი: " + t.name, ch.join(" · ")); return res.json({ out: true }); }
    }
    if (ch.length) await logA(u, "თანამშრომელი: " + t.name, ch.join(" · "));
    res.json(await state(u));
  }));

  // ცვლილებების ჟურნალი
  app.get("/api/audit", h(async (req, res) => {
    await need(req, "audit_view");
    const uid = int(req.query.user), qq = str(req.query.q, 80).toLowerCase();
    let rows = await db.all("select id, at, user_id, user_name, action, detail, order_id from audit order by id desc limit 2000");
    if (uid) rows = rows.filter((r) => Number(r.user_id) === uid);
    if (qq) rows = rows.filter((r) => `${r.user_name} ${r.action} ${r.detail} ${r.order_id || ""}`.toLowerCase().includes(qq));
    res.json({ rows: rows.slice(0, 400).map((r) => num(r, "id", "user_id", "order_id")) });
  }));

  // ვერ გაგზავნილი წერილის ხელახლა გაგზავნა
  app.post("/api/emails/:id/retry", h(async (req, res) => {
    const u = await need(req, "emails"), e = await db.one("select * from emails where id = $1", [int(req.params.id)]);
    if (!e || !e.to_addr) fail(400, "ვერ გაიგზავნა.");
    if (!e.order_id) fail(400, "ეს წერილი (პაროლი, ანგარიში) ხელახლა არ იგზავნება უსაფრთხოების გამო. საჭიროების შემთხვევაში თანამშრომელმა თავიდან მოითხოვოს.");
    await db.run("delete from emails where id = $1", [e.id]);
    await mail(e.kind, Number(e.order_id), e.to_addr);
    res.json(await state(u));
  }));

  // მაღაზიის მონაცემები პანელისთვის (+ რომელი ნაწილის შეცვლა შეუძლია)
  app.get("/api/shop", h(async (req, res) => {
    const u = await need(req, ...SITE);
    res.json({ data: await getShop(), imgBase: storage.publicBase(), uploads: storage.ready(), perms: permsOf(u).filter((p) => SITE.includes(p)) });
  }));

  // ფოტოს ატვირთვა პანელიდან: ბრაუზერი უკვე შეამცირა, აქედან Supabase-ში მიდის
  app.post("/api/images/:file", express.raw({ type: ["image/webp", "image/jpeg", "image/png"], limit: "8mb" }), h(async (req, res) => {
    await need(req, "site_products");
    const file = req.params.file;
    if (!/^u-[a-z0-9]{8,30}-(480|960|1400)\.webp$|^u-[a-z0-9]{8,30}-1200\.jpg$/.test(file)) fail(400, "ფაილის სახელი არასწორია.");
    const type = String(req.headers["content-type"] || "").split(";")[0];
    if (!["image/webp", "image/jpeg", "image/png"].includes(type) || !Buffer.isBuffer(req.body) || !req.body.length) fail(400, "ფაილი არ არის სურათი.");
    try { await storage.upload(file, req.body, type); } catch (e) { fail(502, e.message); }
    res.json({ ok: true });
  }));

  // მაღაზიის შენახვა: თითო ნაწილი იცვლება მხოლოდ შესაბამისი უფლებით, დანარჩენი ძველი რჩება
  const PRICE_T = ["stockIn", "stockLow", "stockOut", "top", "deliveryV", "s3", "n3t", "n3", "pay", "payV", "ret", "retV"]; // ფასების/მიწოდების ჩანართის ტექსტები
  app.post("/api/shop", h(async (req, res) => {
    const u = await need(req, ...SITE), inc = req.body && req.body.data, cur = JSON.parse(JSON.stringify(await getShop()));
    if (!inc || typeof inc !== "object" || !inc.T || !Array.isArray(inc.products)) fail(400, "მონაცემები არასწორია");
    const P = (p) => can(u, p), out = JSON.parse(JSON.stringify(cur)), done = [];
    const ch = (a, b) => JSON.stringify(a) !== JSON.stringify(b);
    for (const L of ["ka", "en"]) for (const k of Object.keys(inc.T[L] || {})) {
      const ok = PRICE_T.includes(k) ? P("site_prices") : P("site_texts");
      if (ok && inc.T[L][k] !== cur.T[L][k]) { out.T[L][k] = String(inc.T[L][k] ?? ""); done.push(PRICE_T.includes(k) ? "მიწოდების ტექსტი" : "ტექსტები"); }
    }
    if (P("site_texts") && inc.room !== undefined && inc.room !== cur.room) { out.room = inc.room; done.push("ოთახის სექცია"); }
    if (P("site_contact")) {
      if (ch(inc.contacts, cur.contacts)) { out.contacts = inc.contacts; done.push("კონტაქტები"); }
      if (ch(inc.analytics, cur.analytics)) { out.analytics = inc.analytics; done.push("სტატისტიკის კოდები"); }
    }
    const prices = [];
    if (P("site_prices")) {
      if (Number(inc.discount) !== Number(cur.discount)) { out.discount = inc.discount; prices.push(`ფასდაკლება ${cur.discount}% → ${inc.discount}%`); }
      if ((inc.showStock !== false) !== (cur.showStock !== false)) { out.showStock = inc.showStock !== false; done.push("მარაგის წარწერა"); }
    }
    const curBy = Object.fromEntries(cur.products.map((p) => [p.id, p])), incBy = Object.fromEntries(inc.products.map((p) => [p && p.id, p]));
    if (P("site_products")) {
      const keepP = (p) => { const c = curBy[p && p.id]; return P("site_prices") ? {} : { old: c ? c.old : 0, price: c ? c.price : undefined }; };
      out.products = inc.products.map((p) => ({ ...p, ...keepP(p) }));
      if (ch(out.products.map(({ old, price, ...p }) => p), cur.products.map(({ old, price, ...p }) => p))) done.push("სათამაშოები");
    } else if (P("site_prices")) out.products = cur.products.map((p) => (incBy[p.id] ? { ...p, old: incBy[p.id].old, price: incBy[p.id].price } : p));
    for (const p of out.products) { const c = curBy[p.id]; if (c && (Number(c.old) !== Number(p.old) || nowPrice(cur, c) !== nowPrice({ ...cur, discount: out.discount }, p))) prices.push(`${c.ka[0]}: ${nowPrice(cur, c)} → ${nowPrice({ ...cur, discount: out.discount }, p)} ₾${Number(c.old) !== Number(p.old) ? ` (ძველი ${c.old} → ${p.old})` : ""}`); }
    if (!done.length && !prices.length) return res.json({ ok: true });
    const err = await saveShop(out);
    if (err) fail(400, err);
    await logA(u, "საიტი შეიცვალა", [...new Set(done), ...prices].join(" · "));
    res.json({ ok: true });
  }));

  // საიტისთვის: რამდენი ცალია თავისუფალი. მხოლოდ ის სათამაშოები, რომლის მარაგიც ჩაწერილია
  // და მხოლოდ მაშინ, თუ პანელში "მარაგის წარწერა" ჩართულია. სხვა შემთხვევაში არაფერს ვამბობთ.
  async function stockLeft(shop) {
    if (shop.showStock === false) return {};
    const has = new Set((await db.all("select product_id from stock")).map((r) => r.product_id));
    return Object.fromEntries((await stockView(shop)).filter((p) => has.has(p.id)).map((p) => [p.id, Math.max(0, p.left)]));
  }

  finance(app, { h, need, fail, logA, getShop, stockView, nowPrice });
  visits(app, { h, need, fail, getShop });

  return { me, ensureAdmin, stockLeft, can };
};
