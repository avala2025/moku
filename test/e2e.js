// სრული შემოწმება: ნამდვილი server.js, SQL ფაილები, ცრუ მეილ-სერვერი. გაშვება: node test/e2e.js
// აქ Express და Postgres ჩანაცვლებულია test/shims-ით (SQLite), რომ ინტერნეტის გარეშე იმუშაოს.
const net = require("net"), fs = require("fs"), os = require("os"), path = require("path"), assert = require("assert"), { spawn } = require("child_process");
const ROOT = path.join(__dirname, ".."), SHIMS = path.join(__dirname, "shims", "mods");
const dbFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "moku-")), "t.db");
process.env.TEST_SQLITE = dbFile;
const { Pool } = require(path.join(SHIMS, "pg"));

const mails = [];
let mailDown = false;
const smtp = net.createServer((s) => {
  let buf = "", data = false, msg = "", step = 0; const w = (x) => s.write(x + "\r\n"); w("220 fake");
  s.setEncoding("utf8");
  s.on("data", (d) => { buf += d; let i; while ((i = buf.indexOf("\r\n")) >= 0) { const l = buf.slice(0, i); buf = buf.slice(i + 2);
    if (data) { if (l === ".") { data = false; const [h, b] = msg.split("\r\n\r\n"); const to = /^To: <(.+)>/m.exec(h)[1], sub = /Subject: =\?UTF-8\?B\?(.+)\?=/.exec(h);
      mails.push({ to, subject: sub ? Buffer.from(sub[1], "base64").toString() : "", body: Buffer.from(b.replace(/\s/g, ""), "base64").toString() }); w("250 ok"); } else msg += l + "\r\n"; continue; }
    if (/^EHLO/.test(l)) w("250-fake\r\n250 AUTH LOGIN");
    else if (l === "AUTH LOGIN") { step = 1; w("334 x"); }
    else if (step === 1) { step = 2; w("334 x"); }
    else if (step === 2) { step = 0; w(mailDown ? "535 down" : "235 ok"); }
    else if (/^MAIL|^RCPT/.test(l)) w("250 ok"); else if (l === "DATA") { data = true; msg = ""; w("354 go"); } else if (l === "QUIT") { w("221 bye"); s.end(); } else w("500 ?"); } });
  s.on("error", () => {});
}).listen(2525);

const PORT = 4990, B = `http://localhost:${PORT}`, wait = (ms) => new Promise((r) => setTimeout(r, ms));
function client() {
  let ck = "";
  return async (p, d, raw) => {
    const r = await fetch(B + p, { method: d ? "POST" : "GET", headers: { "Content-Type": "application/json", ...(d && !raw ? { "X-Moku": "1" } : {}), cookie: ck }, body: d ? JSON.stringify(d) : undefined });
    const sc = r.headers.get("set-cookie"); if (sc) ck = sc.split(";")[0];
    const t = await r.text(); let j = {}; try { j = JSON.parse(t); } catch {}
    return { s: r.status, j, t };
  };
}

(async () => {
  let srv;
  try {
    const pool = new Pool();
    for (const f of fs.readdirSync(path.join(ROOT, "sql")).sort()) { const sql = fs.readFileSync(path.join(ROOT, "sql", f), "utf8"); await pool.query(sql); await pool.query(sql); } // twice: must be safe to re-run
    srv = spawn(process.execPath, ["server.js"], { cwd: ROOT, stdio: ["ignore", "ignore", "inherit"], env: { ...process.env, NODE_PATH: SHIMS, PORT, DATABASE_URL: "test", TEST_SQLITE: dbFile,
      ADMIN_EMAIL: "boss@moku.ge", ADMIN_PASSWORD: "bosspass123", SESSION_SECRET: "x".repeat(32), APP_URL: "https://moku.ge",
      SMTP_HOST: "localhost", SMTP_PORT: "2525", SMTP_USER: "moku.shop@gmail.com", SMTP_PASSWORD: "app-pass" } });
    await wait(900);
    const anon = client(), admin = client(), sales = client(), sales2 = client(), c1 = client(), c2 = client();

    let r = await anon("/");
    assert.equal(r.s, 200); assert.ok(r.t.includes('"toolbox"') && !r.t.includes("MOKU_ADMIN=true") && !r.t.includes("__SHOP_DATA__"), "shop page with data, no admin flag");
    assert.equal((await anon("/img/toolbox-1.jpg")).s, 200, "photos served");
    assert.equal((await anon("/admin")).s, 200, "admin login page");
    assert.equal((await anon("/api/state")).s, 401);
    assert.equal((await anon("/api/login", { email: "boss@moku.ge", password: "bosspass123" }, true)).s, 403, "missing header blocked");
    assert.equal((await anon("/api/login", { email: "boss@moku.ge", password: "nope" })).s, 401);
    r = await admin("/api/login", { email: "boss@moku.ge", password: "bosspass123" });
    assert.equal(r.s, 200); assert.equal(r.j.products.length, 10); assert.equal(r.j.products[0].price, 89, "127 −30% = 89"); assert.ok(r.j.mailReady);
    assert.ok((await admin("/")).t.includes("MOKU_ADMIN=true"), "admin sees the panel button on the shop");

    for (const [n, e, ro] of [["ნინო", "nino@moku.ge", "sales"], ["გიო", "gio@moku.ge", "sales"], ["ლევანი", "levan@moku.ge", "courier"], ["დათო", "dato@moku.ge", "courier"]])
      assert.equal((await admin("/api/users", { name: n, email: e, role: ro, password: "pass12345" })).s, 200);
    assert.equal((await admin("/api/users", { name: "x", email: "nino@moku.ge", role: "sales", password: "pass12345" })).s, 400, "duplicate e-mail");
    r = await admin("/api/stock/toolbox", { stock_in: 3 }); assert.equal(r.j.products.find((p) => p.id === "toolbox").left, 3);
    await admin("/api/stock/music", { stock_in: 5 });
    assert.equal((await admin("/api/stock/nothing", { stock_in: 5 })).s, 404);

    for (const [c, e] of [[sales, "nino"], [sales2, "gio"], [c1, "levan"], [c2, "dato"]]) assert.equal((await c("/api/login", { email: e + "@moku.ge", password: "pass12345" })).s, 200);
    r = await sales("/api/state");
    assert.ok(r.j.products[0].left === 3 && r.j.products[0].stock_in === undefined && !r.j.users && !r.j.emails, "sales sees free stock only");
    assert.ok(!(await sales("/")).t.includes("MOKU_ADMIN=true"), "sales gets no shop panel");
    const levan = r.j.couriers.find((c) => c.name === "ლევანი").id;

    assert.equal((await sales("/api/orders", { customer: "მარი", phone: "555", items: [{ product_id: "toolbox", qty: 4, price: 89 }] })).s, 400, "cannot oversell");
    assert.equal((await c1("/api/orders", { customer: "მარი", phone: "555", items: [{ product_id: "toolbox", qty: 1, price: 89 }] })).s, 403, "courier cannot create orders");
    r = await sales("/api/orders", { customer: "მარი", phone: "555 11 22 33", email: "mari@example.com", address: "ჭავჭავაძის 5", zone: "tbilisi", courier_id: levan,
      items: [{ product_id: "toolbox", qty: 2, price: 89 }, { product_id: "music", qty: 1, price: 109 }] });
    assert.equal(r.s, 200, r.t); const oid = r.j.orders[0].id; assert.equal(r.j.orders[0].status, "assigned"); assert.equal(r.j.products[0].left, 1);
    await wait(500);
    assert.deepEqual(mails.map((m) => m.to).sort(), ["levan@moku.ge", "mari@example.com"]);
    const cm = mails.find((m) => m.to === "mari@example.com"); assert.ok(cm.body.includes("294 ₾") && cm.subject.includes("გაფორმებულია"), "customer mail: total 2×89+109+7");
    assert.ok(mails.find((m) => m.to === "levan@moku.ge").body.includes("https://moku.ge/admin"), "courier mail links to the profile");

    assert.equal((await sales2("/api/state")).j.orders.length, 0, "other seller does not see it");
    assert.equal((await sales2(`/api/orders/${oid}/cancel`, {})).s, 404);
    r = await c2("/api/state"); assert.equal(r.j.orders.length, 0, "other courier sees nothing"); assert.ok(!r.j.products && !r.j.users);
    assert.equal((await c2(`/api/orders/${oid}/pick`, {})).s, 404, "other courier cannot act");
    r = await c1("/api/state"); assert.equal(r.j.orders.length, 1); assert.equal(r.j.orders[0].collect, 294);
    assert.ok(r.j.orders[0].items[0].price === undefined && r.j.orders[0].email === undefined, "courier sees no prices and no customer e-mail");
    assert.equal((await c1(`/api/orders/${oid}/deliver`, {})).s, 400, "cannot deliver before pick-up");
    assert.equal((await c1(`/api/orders/${oid}/pick`, {})).s, 200); await wait(400);
    assert.equal(mails.length, 3); assert.ok(mails[2].subject.includes("აიღო") && mails[2].to === "mari@example.com");
    assert.equal((await c1(`/api/orders/${oid}/deliver`, { note: "ჩაბარდა მეზობელს" })).s, 200);
    r = await c1("/api/state"); assert.equal(r.j.orders[0].status, "delivered", "delivered today stays visible to the courier");

    r = await admin("/api/state"); const p0 = r.j.products.find((p) => p.id === "toolbox");
    assert.equal(r.j.orders.find((x) => x.id === oid).status, "delivered"); assert.equal(p0.sold, 2); assert.equal(p0.revenue, 178); assert.equal(r.j.emails.filter((e) => e.status === "sent").length, 3);
    await admin(`/api/orders/${oid}/return`, {}); r = await admin("/api/state"); assert.equal(r.j.products.find((p) => p.id === "toolbox").left, 3, "a return puts stock back");

    mailDown = true;
    r = await sales("/api/orders", { customer: "გიგა", phone: "599", email: "giga@example.com", items: [{ product_id: "music", qty: 1, price: 109 }] });
    assert.equal(r.j.orders[0].status, "new"); await wait(500);
    r = await admin("/api/state"); const bad = r.j.emails.find((e) => e.status === "failed"); assert.ok(bad, "a failed mail is logged");
    mailDown = false; await admin(`/api/emails/${bad.id}/retry`, {}); assert.equal(mails.length, 4, "retry sends");

    // shop panel: admin changes discount and price; staff prices follow; others are refused
    const shop = JSON.parse(/<script id="data" type="application\/json">(.*?)<\/script>/s.exec((await admin("/")).t)[1]);
    shop.discount = 50; shop.products.find((p) => p.id === "music").old = 200;
    assert.equal((await sales("/api/shop", { data: shop })).s, 403, "sales cannot edit the shop");
    assert.equal((await anon("/api/shop", { data: shop })).s, 401);
    assert.equal((await admin("/api/shop", { data: { ...shop, discount: 500 } })).s, 400, "bad discount refused");
    assert.equal((await admin("/api/shop", { data: shop })).s, 200);
    assert.ok((await anon("/")).t.includes('"discount":50'), "shop shows the new discount");
    r = await sales("/api/state"); assert.equal(r.j.products.find((p) => p.id === "music").price, 100, "staff price = 200 −50%");

    assert.equal((await sales("/api/users", { name: "h", email: "h@h.ge", role: "admin", password: "12345678" })).s, 403);
    assert.equal((await sales("/api/stock/toolbox", { stock_in: 99 })).s, 403);
    r = await admin("/api/state"); await admin(`/api/users/${r.j.users.find((u) => u.email === "dato@moku.ge").id}`, { active: false });
    assert.equal((await c2("/api/state")).s, 401, "a disabled user is logged out");
    assert.equal((await sales("/api/password", { old: "pass12345", new: "newpass123" })).s, 200);
    assert.equal((await client()("/api/login", { email: "nino@moku.ge", password: "newpass123" })).s, 200, "new password works");
    console.log("ALL CHECKS PASSED");
  } catch (e) { console.error("FAILED:", e.message); process.exitCode = 1; }
  finally { srv && srv.kill(); smtp.close(); }
})();
