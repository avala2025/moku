// მოგება-ზარალი: თვითღირებულება, ხელფასები, ხარჯები. მხოლოდ ადმინისთვის.
// შემოსავალი ითვლება ჩაბარებული შეკვეთებიდან, ჩაბარების თვის მიხედვით (თბილისის დროით).
const db = require("../db");

const CATS = ["რეკლამა", "ქირა", "შეფუთვა", "მიწოდება / ტრანსპორტი", "კომუნალური და ინტერნეტი", "გადასახადი", "ბანკის საკომისიო", "ფოტო და კონტენტი", "სხვა"];
const N = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const r2 = (v) => Math.round(N(v) * 100) / 100;
const money = (v, max = 1e7) => Math.min(max, Math.max(0, r2(String(v ?? "").replace(",", "."))));
const tbMonth = (d) => new Date(new Date(d).getTime() + 4 * 36e5).toISOString().slice(0, 7);
const isMonth = (s) => /^\d{4}-(0[1-9]|1[0-2])$/.test(String(s || ""));
const isDay = (s) => /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(String(s || ""));
const prevMonth = (m) => { const [y, mo] = m.split("-").map(Number); return mo === 1 ? `${y - 1}-12` : `${y}-${String(mo - 1).padStart(2, "0")}`; };
const lastMonths = (end, n) => { const out = [end]; while (out.length < n) out.unshift(prevMonth(out[0])); return out; };
const active = (from, to, m) => from <= m && (!to || to >= m);

// ერთი ცალის თვითღირებულება ახლა: { toolbox: { buy, ship, pack, cost, set } }
async function costMap() {
  const rows = await db.all("select * from costs").catch(() => []);
  return Object.fromEntries(rows.map((r) => { const buy = N(r.buy), ship = N(r.ship), pack = N(r.pack); return [r.product_id, { buy, ship, pack, cost: r2(buy + ship + pack), set: buy + ship + pack > 0, updated: r.updated || null }]; }));
}

module.exports = function finance(app, { h, need, fail, logA, getShop, stockView, nowPrice }) {
  const admin = async (req) => { const u = await need(req); if (u.role !== "admin") fail(403, "ეს მხოლოდ ადმინისთვისაა."); return u; };
  const pname = (shop, id) => { const p = shop.products.find((x) => x.id === id); return p ? p.ka[0] : id; };

  async function report(month) {
    const shop = await getShop(), costs = await costMap(), now = tbMonth(Date.now());
    const users = Object.fromEntries((await db.all("select id, name from users")).map((u) => [Number(u.id), u.name]));
    const orders = await db.all("select id, created_by, courier_id, fee, done_at from orders where status = 'delivered'");
    const items = await db.all("select i.order_id, i.product_id, i.name, i.qty, i.price, i.cost from order_items i join orders o on o.id = i.order_id where o.status = 'delivered'");
    const pay = (await db.all("select * from pay order by from_month, id")).map((p) => ({ id: Number(p.id), user_id: p.user_id === null ? null : Number(p.user_id), name: p.user_id ? users[Number(p.user_id)] || p.name : p.name, fixed: N(p.fixed), per_delivery: N(p.per_delivery), commission: N(p.commission), from_month: p.from_month, to_month: p.to_month || "" }));
    const exps = (await db.all("select * from expenses order by day desc, id desc")).map((e) => ({ id: Number(e.id), kind: e.kind, day: e.day, to_month: e.to_month || "", category: e.category, amount: N(e.amount), note: e.note }));

    // შეკვეთები თვეების მიხედვით
    const byOrder = {};
    items.forEach((i) => (byOrder[Number(i.order_id)] ||= []).push(i));
    const om = {};
    for (const o of orders) {
      const m = tbMonth(o.done_at), list = byOrder[Number(o.id)] || [];
      (om[m] ||= []).push({ seller: Number(o.created_by), courier: o.courier_id === null ? null : Number(o.courier_id), fee: N(o.fee), items: list.map((i) => {
        const c = i.cost !== null && i.cost !== undefined ? N(i.cost) : costs[i.product_id]?.set ? costs[i.product_id].cost : null;
        return { pid: i.product_id, name: i.name, qty: N(i.qty), price: N(i.price), cost: c };
      }) });
    }

    function calc(m) {
      const list = om[m] || [], products = {};
      let goods = 0, fee = 0, cogs = 0, units = 0, noCost = 0;
      for (const o of list) {
        fee += o.fee;
        for (const i of o.items) {
          const rev = i.qty * i.price, c = i.cost === null ? 0 : i.qty * i.cost;
          goods += rev; cogs += c; units += i.qty; if (i.cost === null) noCost += i.qty;
          const p = (products[i.pid] ||= { id: i.pid, name: pname(shop, i.pid), qty: 0, rev: 0, cogs: 0, noCost: 0 });
          p.qty += i.qty; p.rev += rev; p.cogs += c; if (i.cost === null) p.noCost += i.qty;
        }
      }
      const salaries = pay.filter((p) => active(p.from_month, p.to_month, m)).map((p) => {
        const dels = p.user_id === null ? 0 : list.filter((o) => o.courier === p.user_id).length;
        const sales = p.user_id === null ? 0 : list.filter((o) => o.seller === p.user_id).reduce((a, o) => a + o.items.reduce((b, i) => b + i.qty * i.price, 0), 0);
        const parts = { fixed: p.fixed, deliveries: dels, byDel: r2(dels * p.per_delivery), sales: r2(sales), byComm: r2((sales * p.commission) / 100) };
        return { id: p.id, user_id: p.user_id, name: p.name, ...parts, total: r2(parts.fixed + parts.byDel + parts.byComm) };
      });
      const exp = {}, expList = exps.filter((e) => (e.kind === "monthly" ? active(e.day, e.to_month, m) : e.day.slice(0, 7) === m));
      expList.forEach((e) => (exp[e.category] = r2((exp[e.category] || 0) + e.amount)));
      const sal = r2(salaries.reduce((a, s) => a + s.total, 0)), other = r2(Object.values(exp).reduce((a, v) => a + v, 0));
      const revenue = r2(goods + fee), gross = r2(revenue - cogs), net = r2(gross - sal - other);
      return { month: m, orders: list.length, units, goods: r2(goods), fee: r2(fee), revenue, cogs: r2(cogs), gross, sal, other, net, noCost,
        salaries, exp, expList, products: Object.values(products).map((p) => ({ ...p, rev: r2(p.rev), cogs: r2(p.cogs), profit: r2(p.rev - p.cogs) })).sort((a, b) => b.rev - a.rev) };
    }

    const months = lastMonths(now, 12).map((m) => { const { salaries, exp, expList, products, ...s } = calc(m); return s; });
    const stock = await stockView(shop);
    const prod = shop.products.map((p) => { const c = costs[p.id] || { buy: 0, ship: 0, pack: 0, cost: 0, set: false }, s = stock.find((x) => x.id === p.id) || { left: 0 }, price = nowPrice(shop, p);
      return { id: p.id, name: pname(shop, p.id), hidden: !!p.hidden, price, buy: c.buy, ship: c.ship, pack: c.pack, cost: c.cost, set: c.set, left: Math.max(0, s.left), unitProfit: r2(price - c.cost), margin: price ? Math.round(((price - c.cost) / price) * 100) : 0 }; });
    return {
      month, now, months, detail: calc(month), products: prod, cats: CATS,
      stockValue: r2(prod.reduce((a, p) => a + p.left * p.cost, 0)), stockRetail: r2(prod.reduce((a, p) => a + p.left * p.price, 0)),
      pay: pay.map((p) => ({ ...p, active: !p.to_month || p.to_month >= now })),
      monthly: exps.filter((e) => e.kind === "monthly"),
      staff: (await db.all("select id, name, title, active from users order by active desc, name")).map((u) => ({ id: Number(u.id), name: u.name, title: u.title || "", active: !!Number(u.active === true ? 1 : u.active) })),
    };
  }

  app.get("/api/pnl", h(async (req, res) => {
    await admin(req);
    const m = isMonth(req.query.m) ? req.query.m : tbMonth(Date.now());
    res.json(await report(m));
  }));

  // თვითღირებულების შენახვა (რამდენიმე სათამაშო ერთად)
  app.post("/api/pnl/costs", h(async (req, res) => {
    const u = await admin(req), shop = await getShop(), old = await costMap(), ch = [];
    const rows = (Array.isArray(req.body.items) ? req.body.items : []).filter((i) => i && shop.products.some((p) => p.id === String(i.id)));
    for (const i of rows) {
      const id = String(i.id), buy = money(i.buy), ship = money(i.ship), pack = money(i.pack), o = old[id] || { buy: 0, ship: 0, pack: 0, cost: 0 };
      if (buy === o.buy && ship === o.ship && pack === o.pack) continue;
      await db.run("insert into costs (product_id, buy, ship, pack, updated) values ($1,$2,$3,$4,$5) on conflict (product_id) do update set buy = excluded.buy, ship = excluded.ship, pack = excluded.pack, updated = excluded.updated", [id, buy, ship, pack, new Date().toISOString()]);
      ch.push(`${pname(shop, id)}: ${o.cost} → ${r2(buy + ship + pack)} ₾`);
    }
    if (ch.length) await logA(u, "თვითღირებულება შეიცვალა", ch.join(" · "));
    res.json(await report(isMonth(req.body.m) ? req.body.m : tbMonth(Date.now())));
  }));

  // ხელფასის პირობები: ახალი თვიდან ახალი პირობა, ძველი იხურება წინა თვეზე (ისტორია რჩება)
  app.post("/api/pnl/pay", h(async (req, res) => {
    const u = await admin(req), b = req.body, from = isMonth(b.from_month) ? b.from_month : tbMonth(Date.now());
    const uid = b.user_id ? Number(b.user_id) : null, name = String(b.name ?? "").trim().slice(0, 80);
    let who = name;
    if (uid) { const t = await db.one("select id, name from users where id = $1", [uid]); if (!t) fail(404, "თანამშრომელი ვერ მოიძებნა."); who = t.name; }
    else if (!name) fail(400, "ჩაწერე თანამშრომლის სახელი.");
    const fixed = money(b.fixed), per = money(b.per_delivery, 1e5), comm = Math.min(100, money(b.commission));
    if (!fixed && !per && !comm) fail(400, "ჩაწერე ხელფასი, თითო მიტანის ანაზღაურება ან პროცენტი.");
    const cur = (await db.all("select * from pay where " + (uid ? "user_id = $1" : "user_id is null and name = $1") + " and to_month = '' order by id desc", [uid || name]))[0];
    if (cur && cur.from_month >= from) await db.run("update pay set fixed = $1, per_delivery = $2, commission = $3, from_month = $4 where id = $5", [fixed, per, comm, from, Number(cur.id)]);
    else {
      if (cur) await db.run("update pay set to_month = $1 where id = $2", [prevMonth(from), Number(cur.id)]);
      await db.run("insert into pay (user_id, name, fixed, per_delivery, commission, from_month, to_month, created) values ($1,$2,$3,$4,$5,$6,'',$7)", [uid, uid ? "" : name, fixed, per, comm, from, new Date().toISOString()]);
    }
    await logA(u, "ხელფასი: " + who, `${from}-დან · თვეში ${fixed} ₾${per ? ` · თითო მიტანა ${per} ₾` : ""}${comm ? ` · ${comm}% გაყიდვებიდან` : ""}`);
    res.json(await report(isMonth(b.m) ? b.m : tbMonth(Date.now())));
  }));
  app.post("/api/pnl/pay/:id/:act", h(async (req, res) => {
    const u = await admin(req), p = await db.one("select * from pay where id = $1", [Number(req.params.id) || 0]);
    if (!p) fail(404, "ვერ მოიძებნა.");
    const who = p.user_id ? (await db.one("select name from users where id = $1", [Number(p.user_id)]))?.name || "" : p.name;
    if (req.params.act === "stop") {
      const to = isMonth(req.body.to_month) ? req.body.to_month : tbMonth(Date.now());
      if (to < p.from_month) { await db.run("delete from pay where id = $1", [Number(p.id)]); await logA(u, "ხელფასი: " + who, "პირობა წაიშალა"); }
      else { await db.run("update pay set to_month = $1 where id = $2", [to, Number(p.id)]); await logA(u, "ხელფასი: " + who, `ხელფასი წყდება ${to}-ის შემდეგ`); }
    } else if (req.params.act === "delete") { await db.run("delete from pay where id = $1", [Number(p.id)]); await logA(u, "ხელფასი: " + who, `პირობა წაიშალა (${p.from_month}-დან)`); }
    else fail(400, "უცნობი მოქმედება.");
    res.json(await report(isMonth(req.body.m) ? req.body.m : tbMonth(Date.now())));
  }));

  // ხარჯები
  app.post("/api/pnl/expense", h(async (req, res) => {
    const u = await admin(req), b = req.body, kind = b.kind === "monthly" ? "monthly" : "once";
    const category = CATS.includes(b.category) ? b.category : "სხვა", amount = money(b.amount), note = String(b.note ?? "").trim().slice(0, 200);
    if (!amount) fail(400, "ჩაწერე თანხა.");
    let day = String(b.day || "");
    if (kind === "monthly") { day = isMonth(day.slice(0, 7)) ? day.slice(0, 7) : tbMonth(Date.now()); }
    else if (!isDay(day)) fail(400, "აირჩიე თარიღი.");
    await db.run("insert into expenses (kind, day, to_month, category, amount, note, user_id, created) values ($1,$2,'',$3,$4,$5,$6,$7)", [kind, day, category, amount, note, u.id, new Date().toISOString()]);
    await logA(u, "ხარჯი დაემატა", `${category} · ${amount} ₾${kind === "monthly" ? " ყოველთვე " + day + "-დან" : " · " + day}${note ? " · " + note : ""}`);
    res.json(await report(isMonth(b.m) ? b.m : tbMonth(Date.now())));
  }));
  app.post("/api/pnl/expense/:id/:act", h(async (req, res) => {
    const u = await admin(req), e = await db.one("select * from expenses where id = $1", [Number(req.params.id) || 0]);
    if (!e) fail(404, "ვერ მოიძებნა.");
    const what = `${e.category} · ${N(e.amount)} ₾${e.note ? " · " + e.note : ""}`;
    if (req.params.act === "delete") { await db.run("delete from expenses where id = $1", [Number(e.id)]); await logA(u, "ხარჯი წაიშალა", what + (e.kind === "monthly" ? " (ყოველთვიური)" : " · " + e.day)); }
    else if (req.params.act === "stop" && e.kind === "monthly") {
      const to = isMonth(req.body.to_month) ? req.body.to_month : tbMonth(Date.now());
      if (to < e.day) { await db.run("delete from expenses where id = $1", [Number(e.id)]); await logA(u, "ხარჯი წაიშალა", what); }
      else { await db.run("update expenses set to_month = $1 where id = $2", [to, Number(e.id)]); await logA(u, "ყოველთვიური ხარჯი შეწყდა", `${what} · ბოლო თვე ${to}`); }
    } else fail(400, "უცნობი მოქმედება.");
    res.json(await report(isMonth(req.body.m) ? req.body.m : tbMonth(Date.now())));
  }));
};
module.exports.costMap = costMap;
