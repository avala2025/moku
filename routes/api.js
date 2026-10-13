// მართვის სისტემის API: შესვლა, მარაგი, შეკვეთები, კურიერი, თანამშრომლები, წერილები, მაღაზიის შენახვა.
const db = require("../db");
const auth = require("../lib/auth");
const { getShop, saveShop, nowPrice } = require("../lib/shop");
const { mailSafe, mail, ready: mailReady, ZONES } = require("../lib/mail");

const ROLES = ["admin", "sales", "courier"];
const OPEN = ["new", "assigned", "picked", "problem"];
const HOLD = [...OPEN, "delivered"]; // ეს სტატუსები მარაგს იკავებს

const str = (v, max = 300) => String(v ?? "").trim().slice(0, max);
const int = (v, min = 0, max = 1e6) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : min; };
const isEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
const iso = () => new Date().toISOString();
const tbilisiDay = (plusDays = 0) => new Date(Date.now() + 4 * 36e5 + plusDays * 864e5).toISOString().slice(0, 10); // UTC+4
const todayStartIso = () => new Date(Date.parse(tbilisiDay() + "T00:00:00Z") - 4 * 36e5).toISOString();
const pub = (u) => ({ id: u.id, name: u.name, email: u.email, role: u.role });
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

async function ordersFor(u) {
  let orders;
  if (u.role === "admin") orders = await db.all("select * from orders order by id desc limit 500");
  else if (u.role === "sales") orders = await db.all("select * from orders where created_by = $1 order by id desc limit 200", [u.id]);
  else orders = await db.all("select * from orders where courier_id = $1 and (status in ('assigned','picked','problem') or (status = 'delivered' and done_at >= $2)) order by delivery_date, id", [u.id, todayStartIso()]);
  if (!orders.length) return [];
  const ids = new Set(orders.map((o) => Number(o.id))), min = Math.min(...ids);
  const items = (await db.all("select order_id, product_id, name, qty, price from order_items where order_id >= $1 order by id", [min])).filter((i) => ids.has(Number(i.order_id)));
  return orders.map((o) => { num(o, "id", "created_by", "courier_id", "fee"); o.items = items.filter((i) => Number(i.order_id) === o.id).map((i) => ({ product_id: i.product_id, name: i.name, qty: Number(i.qty), price: Number(i.price) })); return o; });
}

async function state(u) {
  if (u.role === "courier") {
    const orders = (await ordersFor(u)).map((o) => ({
      id: o.id, customer: o.customer, phone: o.phone, address: o.address, zone: o.zone, note: o.note, delivery_date: o.delivery_date, status: o.status, courier_note: o.courier_note,
      collect: o.items.reduce((a, i) => a + i.qty * i.price, 0) + o.fee, items: o.items.map((i) => ({ name: i.name, qty: i.qty })),
    }));
    return { me: pub(u), orders };
  }
  const shop = await getShop();
  let products = await stockView(shop);
  const couriers = (await db.all("select id, name from users where role = 'courier' and active = true order by name")).map((c) => num(c, "id"));
  const names = Object.fromEntries((await db.all("select id, name from users")).map((x) => [Number(x.id), x.name]));
  const orders = (await ordersFor(u)).map((o) => ({ ...o, courier: names[o.courier_id] || "", seller: names[o.created_by] || "" }));
  if (u.role === "sales") products = products.map(({ id, name, price, left, hidden }) => ({ id, name, price, left, hidden }));
  const out = { me: pub(u), products, couriers, orders, tomorrow: tbilisiDay(1) };
  if (u.role === "admin") {
    out.users = (await db.all("select id, name, email, role, active from users order by role, name")).map((x) => num(x, "id"));
    out.emails = (await db.all("select * from emails order by id desc limit 60")).map((x) => num(x, "id", "order_id"));
    out.mailReady = mailReady();
  }
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
  const need = async (req, ...roles) => { const u = await me(req); if (!u) fail(401, "შედი სისტემაში."); if (roles.length && !roles.includes(u.role)) fail(403, "უფლება არ გაქვს."); return u; };

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
    const u = await need(req, "admin", "sales"), b = req.body, shop = await getShop();
    const customer = str(b.customer, 120), phone = str(b.phone, 40), email = str(b.email, 160).toLowerCase(), zone = ZONES[b.zone] ? b.zone : "tbilisi";
    if (!customer || !phone) fail(400, "შეავსე სახელი და ტელეფონი.");
    if (email && !isEmail(email)) fail(400, "მეილის მისამართი არასწორია.");
    const date = /^\d{4}-\d\d-\d\d$/.test(b.delivery_date) ? b.delivery_date : tbilisiDay(1);
    let courier = null;
    if (b.courier_id) { courier = await db.one("select id from users where id = $1 and role = 'courier' and active = true", [int(b.courier_id)]); if (!courier) fail(400, "კურიერი ვერ მოიძებნა."); num(courier, "id"); }
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
    if (u.role === "courier") {
      if (o.courier_id !== u.id) fail(404, "შეკვეთა ვერ მოიძებნა."); // სხვისი შეკვეთა "არ არსებობს"
      if (act === "pick" && o.status === "assigned") { await set("status = 'picked', picked_at = $1", [iso()]); mailSafe("picked", o.id, o.email); }
      else if (act === "deliver" && ["picked", "problem"].includes(o.status)) await set("status = 'delivered', done_at = $1, courier_note = $2", [iso(), str(b.note, 300)]);
      else if (act === "problem" && ["assigned", "picked"].includes(o.status)) { if (!str(b.note)) fail(400, "დაწერე, რა მოხდა."); await set("status = 'problem', courier_note = $1", [str(b.note, 300)]); }
      else fail(400, "ეს მოქმედება ამ სტატუსზე არ შეიძლება.");
      return res.json(await state(u));
    }
    if (u.role === "sales" && o.created_by !== u.id) fail(404, "შეკვეთა ვერ მოიძებნა.");
    if (act === "assign" && ["new", "assigned", "problem"].includes(o.status)) {
      const c = await db.one("select id, email from users where id = $1 and role = 'courier' and active = true", [int(b.courier_id)]);
      if (!c) fail(400, "აირჩიე კურიერი.");
      await set("courier_id = $1, status = 'assigned', courier_note = ''", [Number(c.id)]);
      mailSafe("courier_assigned", o.id, c.email);
    } else if (act === "cancel" && ["new", "assigned", "problem"].includes(o.status)) await set("status = 'cancelled', done_at = $1", [iso()]);
    else if (u.role === "admin" && act === "deliver" && OPEN.includes(o.status)) await set("status = 'delivered', done_at = $1", [iso()]);
    else if (u.role === "admin" && act === "return" && ["picked", "problem", "delivered"].includes(o.status)) await set("status = 'returned', done_at = $1", [iso()]);
    else fail(400, "ეს მოქმედება ამ სტატუსზე არ შეიძლება.");
    res.json(await state(u));
  }));

  // მარაგი: მხოლოდ ადმინი წერს, რამდენი ცალი მიიღო
  app.post("/api/stock/:pid", h(async (req, res) => {
    const u = await need(req, "admin"), shop = await getShop();
    if (!shop.products.some((p) => p.id === req.params.pid)) fail(404, "სათამაშო ვერ მოიძებნა.");
    await db.run("insert into stock (product_id, stock_in) values ($1,$2) on conflict (product_id) do update set stock_in = excluded.stock_in", [req.params.pid, int(req.body.stock_in)]);
    res.json(await state(u));
  }));

  // თანამშრომლები
  app.post("/api/users", h(async (req, res) => {
    const u = await need(req, "admin"), b = req.body, email = str(b.email, 160).toLowerCase(), pw = str(b.password, 200);
    if (!str(b.name) || !isEmail(email)) fail(400, "შეავსე სახელი და სწორი მეილი.");
    if (pw.length < 8) fail(400, "პაროლი მინიმუმ 8 სიმბოლო უნდა იყოს.");
    if (!ROLES.includes(b.role)) fail(400, "აირჩიე როლი.");
    if (await db.one("select id from users where email = $1", [email])) fail(400, "ეს მეილი უკვე რეგისტრირებულია.");
    await db.run("insert into users (name, email, pass, role, active, created) values ($1,$2,$3,$4,true,$5)", [str(b.name, 80), email, auth.hash(pw), b.role, iso()]);
    res.json(await state(u));
  }));
  app.post("/api/users/:id", h(async (req, res) => {
    const u = await need(req, "admin"), b = req.body, t = await db.one("select id from users where id = $1", [int(req.params.id)]);
    if (!t) fail(404, "ვერ მოიძებნა.");
    const tid = Number(t.id);
    if (b.active !== undefined) { if (tid === u.id) fail(400, "საკუთარ თავს ვერ გათიშავ."); await db.run("update users set active = $1 where id = $2", [!!b.active, tid]); }
    if (b.password !== undefined) { if (str(b.password, 200).length < 8) fail(400, "პაროლი მინიმუმ 8 სიმბოლო უნდა იყოს."); await db.run("update users set pass = $1 where id = $2", [auth.hash(str(b.password, 200)), tid]); }
    res.json(await state(u));
  }));

  // ვერ გაგზავნილი წერილის ხელახლა გაგზავნა
  app.post("/api/emails/:id/retry", h(async (req, res) => {
    const u = await need(req, "admin"), e = await db.one("select * from emails where id = $1", [int(req.params.id)]);
    if (!e || !e.to_addr) fail(400, "ვერ გაიგზავნა.");
    await db.run("delete from emails where id = $1", [e.id]);
    await mail(e.kind, Number(e.order_id), e.to_addr);
    res.json(await state(u));
  }));

  // მაღაზიის ტექსტები, სათამაშოები, ფასები (საიტზე ჩაშენებული პანელიდან)
  app.post("/api/shop", h(async (req, res) => {
    await need(req, "admin");
    const err = await saveShop(req.body && req.body.data);
    if (err) fail(400, err);
    res.json({ ok: true });
  }));

  return { me, ensureAdmin };
};
