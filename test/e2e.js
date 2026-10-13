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

const stored = [];
const storageSrv = require("http").createServer((q, s2) => { const parts = []; q.on("data", (c) => parts.push(c)); q.on("end", () => {
  if (q.headers.authorization !== "Bearer svc-key") { s2.statusCode = 401; return s2.end("{}"); }
  if (q.url === "/storage/v1/bucket") { s2.statusCode = stored.bucket ? 400 : 200; stored.bucket = true; return s2.end(stored.bucket ? '{"message":"The resource already exists"}' : "{}"); }
  const m = /^\/storage\/v1\/object\/products\/(.+)$/.exec(q.url); if (m) { stored.push({ file: decodeURIComponent(m[1]), type: q.headers["content-type"], size: Buffer.concat(parts).length }); return s2.end("{}"); }
  s2.statusCode = 404; s2.end("{}"); }); }).listen(4991);

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
    for (const f of fs.readdirSync(path.join(ROOT, "sql")).sort()) { const sql = fs.readFileSync(path.join(ROOT, "sql", f), "utf8"); if (/jsonb_/.test(sql)) continue; /* Postgres-only data fix, nothing to change in a fresh test database */ await pool.query(sql); await pool.query(sql); } // twice: must be safe to re-run
    srv = spawn(process.execPath, ["server.js"], { cwd: ROOT, stdio: ["ignore", "ignore", "inherit"], env: { ...process.env, NODE_PATH: SHIMS, PORT, DATABASE_URL: "test", TEST_SQLITE: dbFile,
      ADMIN_EMAIL: "boss@moku.ge", ADMIN_PASSWORD: "bosspass123", SESSION_SECRET: "x".repeat(32), APP_URL: "https://moku.ge",
      SMTP_HOST: "localhost", SMTP_PORT: "2525", SMTP_USER: "moku.shop@gmail.com", SMTP_PASSWORD: "app-pass",
      SUPABASE_URL: "http://localhost:4991", SUPABASE_SERVICE_ROLE_KEY: "svc-key" } });
    await wait(900);
    const anon = client(), admin = client(), sales = client(), sales2 = client(), c1 = client(), c2 = client();

    let r = await anon("/");
    assert.equal(r.s, 200);
    assert.ok(r.t.includes("ხელსაწყოების ყუთი") && r.t.includes('href="/toy/toolbox"'), "home page lists toys with links, price-list names");
    assert.ok(r.t.includes('rel="canonical"') && r.t.includes('hreflang="en"') && r.t.includes('"@type":"Organization"'), "home SEO tags");
    assert.ok(!r.t.includes("/a/panel.js"), "no admin panel for visitors");
    r = await anon("/en"); assert.ok(r.t.includes('lang="en"') && r.t.includes("Wooden Tool Box") && r.t.includes('href="/en/toy/toolbox"'), "English home");
    r = await anon("/toy/toolbox"); assert.equal(r.s, 200);
    assert.ok(r.t.includes("<h1>ხელსაწყოების ყუთი</h1>") && r.t.includes('"@type":"Product"') && r.t.includes('"price":"89"') && r.t.includes('"priceCurrency":"GEL"') && !r.t.includes("availability"), "toy page with product data, no stock claim yet");
    assert.ok(r.t.includes('og:image" content="') && r.t.includes("/img/toolbox-1.jpg"), "share image");
    assert.equal((await anon("/toy/nothing")).s, 404); assert.equal((await anon("/nowhere")).s, 404);
    r = await fetch(B + "/", { headers: { "accept-encoding": "gzip" } }); assert.equal(r.headers.get("content-encoding"), "gzip", "pages are compressed");
    r = await fetch(B + "/a/shop.css?v=1"); assert.ok(/immutable/.test(r.headers.get("cache-control")), "styles cached long");
    r = await anon("/sitemap.xml"); assert.ok(r.t.includes("/en/toy/toolbox") && r.t.includes('hreflang="ka"'), "sitemap");
    r = await anon("/robots.txt"); assert.ok(r.t.includes("Disallow: /admin") && r.t.includes("sitemap.xml"), "robots");
    assert.equal((await anon("/img/toolbox-1-480.webp")).s, 200, "webp photos served");
    assert.equal((await anon("/favicon.svg")).s, 200, "icon");
    assert.equal((await anon("/admin")).s, 200, "admin login page");
    assert.equal((await anon("/api/state")).s, 401);
    assert.equal((await anon("/api/login", { email: "boss@moku.ge", password: "bosspass123" }, true)).s, 403, "missing header blocked");
    assert.equal((await anon("/api/login", { email: "boss@moku.ge", password: "nope" })).s, 401);
    r = await admin("/api/login", { email: "boss@moku.ge", password: "bosspass123" });
    assert.equal(r.s, 200); assert.equal(r.j.products.length, 10); assert.equal(r.j.products[0].price, 89, "127 −30% = 89"); assert.ok(r.j.mailReady);
    assert.ok((await admin("/")).t.includes("/a/panel.js"), "admin gets the panel on the shop");

    for (const [n, e, ro] of [["ნინო", "nino@moku.ge", "sales"], ["გიო", "gio@moku.ge", "sales"], ["ლევანი", "levan@moku.ge", "courier"], ["დათო", "dato@moku.ge", "courier"]])
      assert.equal((await admin("/api/users", { name: n, email: e, role: ro, password: "pass12345" })).s, 200);
    assert.equal((await admin("/api/users", { name: "x", email: "nino@moku.ge", role: "sales", password: "pass12345" })).s, 400, "duplicate e-mail");
    r = await admin("/api/stock/toolbox", { stock_in: 3 }); assert.equal(r.j.products.find((p) => p.id === "toolbox").left, 3);
    await admin("/api/stock/music", { stock_in: 5 });
    assert.equal((await admin("/api/stock/nothing", { stock_in: 5 })).s, 404);

    for (const [c, e] of [[sales, "nino"], [sales2, "gio"], [c1, "levan"], [c2, "dato"]]) assert.equal((await c("/api/login", { email: e + "@moku.ge", password: "pass12345" })).s, 200);
    r = await sales("/api/state");
    assert.ok(r.j.products[0].left === 3 && r.j.products[0].stock_in === undefined && !r.j.users && !r.j.emails, "sales sees free stock only");
    assert.ok(!(await sales("/")).t.includes("/a/panel.js"), "sales gets no shop panel");
    assert.ok((await anon("/toy/toolbox")).t.includes("schema.org/InStock"), "stock entered: toy shows in stock");
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
    assert.equal((await sales("/api/shop")).s, 403, "sales cannot read the panel data");
    r = await admin("/api/shop"); assert.ok(r.j.uploads && r.j.imgBase.includes("/storage/v1/object/public/products"));
    const shop = r.j.data;
    // photo upload through the server to storage
    const png = Buffer.from("fake-image-bytes");
    const up = (who, name, type = "image/webp") => fetch(B + "/api/images/" + name, { method: "POST", headers: { "X-Moku": "1", "Content-Type": type, cookie: who }, body: png });
    const adminCookie = (await (async () => { const rr = await fetch(B + "/api/login", { method: "POST", headers: { "Content-Type": "application/json", "X-Moku": "1" }, body: JSON.stringify({ email: "boss@moku.ge", password: "bosspass123" }) }); return rr.headers.get("set-cookie").split(";")[0]; })());
    for (const f of ["u-abcdefgh12-480.webp", "u-abcdefgh12-960.webp", "u-abcdefgh12-1400.webp", "u-abcdefgh12-1200.jpg"]) assert.equal((await up(adminCookie, f, f.endsWith("jpg") ? "image/jpeg" : "image/webp")).status, 200, "upload " + f);
    assert.equal(stored.length, 4); assert.ok(stored.every((x) => x.size === png.length));
    assert.equal((await up(adminCookie, "../evil.webp")).status, 404, "path tricks refused");
    assert.equal((await up(adminCookie, "u-abc.exe")).status, 400, "bad file name refused");
    assert.equal((await up("", "u-abcdefgh12-480.webp")).status, 401, "visitors cannot upload");
    shop.products.find((p) => p.id === "toolbox").imgs.push(["u-abcdefgh12", 0]);
    assert.equal((await admin("/api/shop", { data: { ...shop, analytics: { ga: "bad", pixel: "" } } })).s, 400, "bad analytics code refused");
    shop.analytics = { ga: "G-ABC123XYZ", pixel: "123456789" };
    shop.discount = 50; shop.products.find((p) => p.id === "music").old = 200;
    assert.equal((await sales("/api/shop", { data: shop })).s, 403, "sales cannot edit the shop");
    assert.equal((await anon("/api/shop", { data: shop })).s, 401);
    assert.equal((await admin("/api/shop", { data: { ...shop, discount: 500 } })).s, 400, "bad discount refused");
    assert.equal((await admin("/api/shop", { data: shop })).s, 200);
    r = await anon("/"); assert.ok(r.t.includes("−50%") && r.t.includes('data-ga="G-ABC123XYZ"') && r.t.includes('data-px="123456789"'), "shop shows new discount and analytics codes");
    assert.ok((await anon("/toy/toolbox")).t.includes("http://localhost:4991/storage/v1/object/public/products/u-abcdefgh12-960.webp"), "uploaded photo appears on the toy page");
    shop.products.find((p) => p.id === "train").hidden = true; await admin("/api/shop", { data: shop });
    assert.equal((await anon("/toy/train")).s, 404, "hidden toy is not public"); assert.equal((await admin("/toy/train")).s, 200, "admin can still preview it");
    assert.ok(!(await anon("/sitemap.xml")).t.includes("/toy/train"), "hidden toy not in sitemap");
    r = await sales("/api/state"); assert.equal(r.j.products.find((p) => p.id === "music").price, 100, "staff price = 200 −50%");

    r = await sales("/api/customer?phone=555112233"); assert.equal(r.j.customer, "მარი", "customer lookup by phone");
    assert.equal((await sales("/api/customer?phone=123")).j.customer, undefined, "short phone: nothing");
    r = await fetch(B + "/api/orders.csv", { headers: { cookie: adminCookie } }); assert.equal(r.status, 200); const csv = await r.text();
    assert.ok(csv.includes("მარი") && csv.includes("ხელსაწყოების ყუთი × 2") && r.headers.get("content-disposition").includes("moku-orders"), "csv export");
    assert.equal((await sales("/api/orders.csv")).s, 403, "sales cannot export");
    r = await sales("/api/state"); assert.ok(r.j.today && r.j.products[0].img === "toolbox-1", "sales gets thumbs and today");
    assert.equal((await sales("/api/users", { name: "h", email: "h@h.ge", role: "admin", password: "12345678" })).s, 403);
    assert.equal((await sales("/api/stock/toolbox", { stock_in: 99 })).s, 403);
    r = await admin("/api/state"); await admin(`/api/users/${r.j.users.find((u) => u.email === "dato@moku.ge").id}`, { active: false });
    assert.equal((await c2("/api/state")).s, 401, "a disabled user is logged out");
    assert.equal((await sales("/api/password", { old: "pass12345", new: "newpass123" })).s, 200);
    assert.equal((await client()("/api/login", { email: "nino@moku.ge", password: "newpass123" })).s, 200, "new password works");
    console.log("ALL CHECKS PASSED");
  } catch (e) { console.error("FAILED:", e.message); process.exitCode = 1; }
  finally { srv && srv.kill(); smtp.close(); storageSrv.close(); }
})();
