// სრული შემოწმება: ნამდვილი server.js, SQL ფაილები, ცრუ მეილ-სერვერი. გაშვება: node test/e2e.js
// აქ Express და Postgres ჩანაცვლებულია test/shims-ით (SQLite), რომ ინტერნეტის გარეშე იმუშაოს.
const net = require("net"), fs = require("fs"), os = require("os"), path = require("path"), assert = require("assert"), { spawn } = require("child_process");
const ROOT = path.join(__dirname, ".."), SHIMS = path.join(__dirname, "shims", "mods");
const dbFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "moku-")), "t.db");
process.env.TEST_SQLITE = dbFile;
const { Pool } = require(path.join(SHIMS, "pg"));

const mails = [];
const om = () => mails.filter((m) => !/ანგარიში|პაროლ|მეილი შეიცვალა/.test(m.subject)); // მხოლოდ შეკვეთის წერილები
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
    assert.ok(r.t.includes("ოსტატი") && r.t.includes("ხის ხელსაწყოების ყუთი ბურღით") && r.t.includes('href="/toy/toolbox"'), "home page lists toys with name and subtitle");
    assert.ok(r.t.includes('rel="canonical"') && r.t.includes('hreflang="en"') && r.t.includes('"@type":"Organization"'), "home SEO tags");
    assert.ok(!r.t.includes("/a/panel.js"), "no admin panel for visitors");
    r = await anon("/en"); assert.ok(r.t.includes('lang="en"') && r.t.includes("Little Builder") && r.t.includes('href="/en/toy/toolbox"'), "English home");
    r = await anon("/toy/toolbox"); assert.equal(r.s, 200);
    assert.ok(r.t.includes("<h1>ოსტატი</h1>") && r.t.includes("ოსტატი · ხის ხელსაწყოების ყუთი ბურღით · MOKU") && r.t.includes("3+ წელი") && r.t.includes("<li>✋ წვრილი მოტორიკა</li>") && r.t.includes('"@type":"Product"') && r.t.includes('"price":"89"') && r.t.includes('"priceCurrency":"GEL"'), "toy page with product data, name, subtitle, age, skills");
    assert.ok(r.t.includes('og:image" content="') && r.t.includes("/img/toolbox-1.jpg"), "share image");
    assert.equal((await anon("/toy/nothing")).s, 404); assert.equal((await anon("/nowhere")).s, 404);
    r = await fetch(B + "/", { headers: { "accept-encoding": "gzip" } }); assert.equal(r.headers.get("content-encoding"), "gzip", "pages are compressed");
    r = await fetch(B + "/a/shop.css?v=1"); assert.ok(/immutable/.test(r.headers.get("cache-control")), "styles cached long");
    r = await anon("/sitemap.xml"); assert.ok(r.t.includes("/en/toy/toolbox") && r.t.includes('hreflang="ka"'), "sitemap");
    const hostGet = (host, p) => new Promise((ok) => require("http").get({ host: "localhost", port: PORT, path: p, headers: { host } }, (x) => { x.resume(); ok([x.statusCode, x.headers.location]); }));
    assert.deepEqual(await hostGet("www.moku.ge", "/toy/radio?a=1"), [301, "https://moku.ge/toy/radio?a=1"], "www redirects to main domain");
    assert.deepEqual(await hostGet("moku-production.up.railway.app", "/en"), [301, "https://moku.ge/en"], "old railway address redirects");
    assert.equal((await hostGet("moku-production.up.railway.app", "/health"))[0] === 301, false, "health never redirects");
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

    // ნინო: თავისი შეკვეთები + კურიერის დანიშვნა; გიო: მხოლოდ გაფორმება (მზა ნაკრების გარეშე); კურიერები: მზა ნაკრები
    for (const [n, e, ro, perms] of [["ნინო", "nino@moku.ge", "sales", ["order_create", "orders_assign", "stock_view"]], ["გიო", "gio@moku.ge", "sales", ["order_create", "stock_view"]], ["ლევანი", "levan@moku.ge", "courier"], ["დათო", "dato@moku.ge", "courier"]])
      assert.equal((await admin("/api/users", { name: n, email: e, role: ro, password: "pass12345", perms })).s, 200);
    r = await admin("/api/state"); assert.deepEqual(r.j.users.find((u) => u.name === "გიო").perms, ["order_create", "stock_view"], "perms saved as given");
    assert.deepEqual(r.j.users.find((u) => u.name === "დათო").perms, ["courier"], "courier preset");
    assert.ok(r.j.me.perms.includes("users") && r.j.me.perms.includes("site_texts") && r.j.me.perms.includes("audit_view") && !r.j.me.perms.includes("courier"), "admin has every permission except courier mode");
    assert.ok(!r.j.couriers.some((c) => c.name === "ადმინი"), "admin is not in the courier list");
    assert.equal((await admin("/api/users", { name: "x", email: "nino@moku.ge", role: "sales", password: "pass12345" })).s, 400, "duplicate e-mail");
    r = await admin("/api/stock/toolbox", { stock_in: 3 }); assert.equal(r.j.products.find((p) => p.id === "toolbox").left, 3);
    await admin("/api/stock/music", { stock_in: 5 });
    assert.equal((await admin("/api/stock/nothing", { stock_in: 5 })).s, 404);

    for (const [c, e] of [[sales, "nino"], [sales2, "gio"], [c1, "levan"], [c2, "dato"]]) assert.equal((await c("/api/login", { email: e + "@moku.ge", password: "pass12345" })).s, 200);
    r = await sales("/api/state");
    assert.ok(r.j.products[0].left === 3 && r.j.products[0].stock_in === undefined && !r.j.users && !r.j.emails, "sales sees free stock only");
    assert.ok(!(await sales("/")).t.includes("/a/panel.js"), "sales gets no shop panel");
    const tb = await anon("/toy/toolbox"); assert.ok(tb.t.includes("schema.org/InStock") && tb.t.includes('class="stk low">დარჩა 3 ცალი'), "stock entered: toy shows in stock, 3 left");
    assert.ok(!(await anon("/toy/radio")).t.includes('class="stk'), "no stock entered: no label");
    assert.ok((await anon("/en/toy/music")).t.includes('class="stk in">In stock'), "5 in stock: English label");
    const levan = r.j.couriers.find((c) => c.name === "ლევანი").id;

    assert.equal((await sales("/api/orders", { customer: "მარი", phone: "555", items: [{ product_id: "toolbox", qty: 4, price: 89 }] })).s, 400, "cannot oversell");
    assert.equal((await c1("/api/orders", { customer: "მარი", phone: "555", items: [{ product_id: "toolbox", qty: 1, price: 89 }] })).s, 403, "courier cannot create orders");
    r = await sales("/api/orders", { customer: "მარი", phone: "555 11 22 33", email: "mari@example.com", address: "ჭავჭავაძის 5", zone: "tbilisi", courier_id: levan,
      items: [{ product_id: "toolbox", qty: 2, price: 89 }, { product_id: "music", qty: 1, price: 109 }] });
    assert.equal(r.s, 200, r.t); const oid = r.j.orders[0].id; assert.equal(r.j.orders[0].status, "assigned"); assert.equal(r.j.products[0].left, 1);
    await wait(500);
    assert.deepEqual(om().map((m) => m.to).sort(), ["levan@moku.ge", "mari@example.com"]);
    const cm = om().find((m) => m.to === "mari@example.com"); assert.ok(cm.body.includes("294 ₾") && cm.subject.includes("გაფორმებულია"), "customer mail: total 2×89+109+7");
    assert.ok(om().find((m) => m.to === "levan@moku.ge").body.includes("https://moku.ge/admin"), "courier mail links to the profile");

    assert.equal((await sales2("/api/state")).j.orders.length, 0, "other seller does not see it");
    assert.equal((await sales2(`/api/orders/${oid}/cancel`, {})).s, 404, "not his order");
    assert.equal((await sales(`/api/orders/${oid}/return`, {})).s, 400, "own order, has assign permission, but wrong status");
    
    r = await c2("/api/state"); assert.equal(r.j.deliveries.length, 0, "other courier sees nothing"); assert.ok(!r.j.products && !r.j.users && !r.j.orders);
    assert.equal((await c2(`/api/orders/${oid}/pick`, {})).s, 404, "other courier cannot act");
    r = await c1("/api/state"); assert.equal(r.j.deliveries.length, 1); assert.equal(r.j.deliveries[0].collect, 294);
    assert.ok(r.j.deliveries[0].items[0].price === undefined && r.j.deliveries[0].email === undefined, "courier sees no prices and no customer e-mail");
    assert.equal((await c1(`/api/orders/${oid}/deliver`, {})).s, 400, "cannot deliver before pick-up");
    assert.equal((await c1(`/api/orders/${oid}/pick`, {})).s, 200); await wait(400);
    assert.equal(om().length, 3); assert.ok(om()[2].subject.includes("გზაშია") && om()[2].to === "mari@example.com");
    assert.equal((await c1(`/api/orders/${oid}/deliver`, { note: "ჩაბარდა მეზობელს" })).s, 200);
    r = await c1("/api/state"); assert.equal(r.j.deliveries[0].status, "delivered", "delivered today stays visible to the courier");
    // უფლებების გადაცემა: გიოს ვაძლევთ "ყველა შეკვეთის ნახვას" და მაშინვე ხედავს; საკუთარს ვერ ცვლის; ადმინისას ვერ ცვლის
    const gioId = (await admin("/api/state")).j.users.find((u) => u.name === "გიო").id;
    assert.equal((await admin(`/api/users/${gioId}`, { perms: ["order_create", "orders_all", "nonsense"] })).s, 200);
    r = await sales2("/api/state"); assert.deepEqual(r.j.me.perms, ["order_create", "orders_all"]); assert.equal(r.j.orders.length, 1, "with orders_all the other seller now sees every order");
    assert.equal((await admin(`/api/users/${gioId}`, { perms: ["order_create", "stock_view"] })).s, 200);
    assert.equal((await sales2(`/api/users/${gioId}`, { perms: [] })).s, 403, "no users permission");
    assert.equal((await admin(`/api/users/${(await admin("/api/state")).j.me.id}`, { perms: [] })).s, 400, "cannot change own permissions");
    assert.equal((await admin("/api/users", { name: "ლუკა", email: "luka@moku.ge", role: "sales", password: "pass12345", perms: ["courier", "order_create"] })).s, 200, "mixed: seller who also delivers");
    r = await admin("/api/state"); assert.ok(r.j.couriers.some((c) => c.name === "ლუკა"), "a user with the courier permission appears in the courier list");

    r = await admin("/api/state"); const p0 = r.j.products.find((p) => p.id === "toolbox");
    assert.equal(r.j.orders.find((x) => x.id === oid).status, "delivered"); assert.equal(p0.sold, 2); assert.equal(p0.revenue, 178); assert.equal(r.j.emails.filter((e) => e.status === "sent" && e.order_id).length, 3);
    await admin("/api/stock/vet", { stock_in: 0 });
    r = await anon("/"); assert.ok(r.t.includes('card sold') && r.t.includes('soldb">ამოიწურა'), "sold-out card on the home page");
    assert.ok((await anon("/toy/vet")).t.includes("schema.org/OutOfStock"), "sold out for Google too");
    await admin(`/api/orders/${oid}/return`, {}); r = await admin("/api/state"); assert.equal(r.j.products.find((p) => p.id === "toolbox").left, 3, "a return puts stock back");

    mailDown = true;
    r = await sales("/api/orders", { customer: "გიგა", phone: "599", email: "giga@example.com", items: [{ product_id: "music", qty: 1, price: 109 }] });
    assert.equal(r.j.orders[0].status, "new"); await wait(500);
    r = await admin("/api/state"); const bad = r.j.emails.find((e) => e.status === "failed" && e.order_id); assert.ok(bad, "a failed mail is logged");
    mailDown = false; await admin(`/api/emails/${bad.id}/retry`, {}); assert.equal(om().length, 4, "retry sends");

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
    assert.equal((await admin("/api/shop", { data: { ...shop, showStock: false } })).s, 200);
    assert.ok(!(await anon("/toy/toolbox")).t.includes('class="stk'), "stock labels switched off in the panel");
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
    assert.ok(csv.includes("მარი") && csv.includes("ოსტატი · ხის ხელსაწყოების ყუთი ბურღით × 2") && r.headers.get("content-disposition").includes("moku-orders"), "csv export");
    assert.equal((await sales("/api/orders.csv")).s, 403, "sales cannot export");
    r = await sales("/api/state"); assert.ok(r.j.today && r.j.products[0].img === "toolbox-1", "sales gets thumbs and today");
    assert.equal((await sales("/api/users", { name: "h", email: "h@h.ge", role: "admin", password: "12345678" })).s, 403);
    assert.equal((await sales("/api/stock/toolbox", { stock_in: 99 })).s, 403);
    r = await admin("/api/state"); await admin(`/api/users/${r.j.users.find((u) => u.email === "dato@moku.ge").id}`, { active: false });
    assert.equal((await c2("/api/state")).s, 401, "a disabled user is logged out");
    assert.equal((await sales("/api/password", { old: "pass12345", new: "newpass123" })).s, 200);
    assert.equal((await client()("/api/login", { email: "nino@moku.ge", password: "newpass123" })).s, 200, "new password works");
    // ---- ადმინი v2: დეტალური უფლებები, ჟურნალი, მარაგის პარტია, შეკვეთის შესწორება ----
    const st = await admin("/api/state"), ninoId = st.j.users.find((u) => u.email === "nino@moku.ge").id;
    // საიტის მენეჯერი: მხოლოდ ტექსტები. ფასს ვერ ცვლის, ტექსტს ცვლის.
    assert.equal((await admin("/api/users", { name: "სოფო", email: "sofo@moku.ge", template: "site", password: "pass12345" })).s, 200);
    const sofo = client(); assert.equal((await sofo("/api/login", { email: "sofo@moku.ge", password: "pass12345" })).s, 200);
    let sd = (await sofo("/api/shop")).j; assert.deepEqual(sd.perms, ["site_texts", "site_products", "site_contact"], "site template perms");
    sd.data.discount = 10; sd.data.T.ka.heroCta = "ნახე კოლექცია"; sd.data.products.find((p) => p.id === "music").old = 1;
    assert.equal((await sofo("/api/shop", { data: sd.data })).s, 200);
    sd = (await admin("/api/shop")).j.data; assert.equal(sd.discount, 50, "no price permission: discount unchanged"); assert.equal(sd.products.find((p) => p.id === "music").old, 200, "price unchanged"); assert.equal(sd.T.ka.heroCta, "ნახე კოლექცია", "text changed");
    assert.ok((await sofo("/")).t.includes("/a/panel.js"), "site manager gets the panel");
    assert.equal((await sofo("/api/state")).j.orders, undefined, "site manager sees no orders");
    // გამყიდველი ფასის უფლების გარეშე: ფასი ყოველთვის საიტის ფასია
    await admin("/api/stock/receive", { items: [{ id: "radio", qty: 20 }, { id: "tap", qty: 5 }], note: "პარტია 1" });
    r = await sales2("/api/orders", { customer: "ანა", phone: "577000111", items: [{ product_id: "radio", qty: 1, price: 1 }], fee: 0 });
    let ord = r.j.orders[0]; assert.equal(ord.items[0].price, 45, "price forced to site price (90 −50%)"); assert.equal(ord.fee, 7, "fee forced to zone fee");
    // შესწორება: გიოს არ აქვს orders_edit
    assert.equal((await sales2(`/api/orders/${ord.id}/edit`, { customer: "ანა", phone: "577000111", items: [{ product_id: "radio", qty: 2 }] })).s, 403);
    await admin(`/api/users/${gioId}`, { perms: ["order_create", "orders_edit", "stock_view"] });
    r = await sales2(`/api/orders/${ord.id}/edit`, { customer: "ანა ბ.", phone: "577000111", address: "ვაკე", zone: "tbilisi", items: [{ product_id: "radio", qty: 2, price: 5 }, { product_id: "tap", qty: 1 }] });
    assert.equal(r.s, 200, r.t); ord = r.j.orders.find((o) => o.id === ord.id); assert.equal(ord.customer, "ანა ბ."); assert.equal(ord.items.length, 2); assert.equal(ord.items[0].price, 45, "edit keeps price without permission");
    assert.equal((await sales2(`/api/orders/${ord.id}/cancel`, {})).s, 403, "no cancel permission");
    let hh = (await sales2(`/api/orders/${ord.id}/history`)).j.rows; assert.ok(hh.some((x) => x.action === "შეკვეთა გაფორმდა") && hh.some((x) => x.action === "შეკვეთა შესწორდა" && x.detail.includes("ანა → ანა ბ.")), "order history");
    // მარაგის კორექცია და მოძრაობის ისტორია
    assert.equal((await admin("/api/stock/adjust", { id: "radio", qty: -1, note: "" })).s, 400, "reason required");
    r = await admin("/api/stock/adjust", { id: "radio", qty: -1, note: "დაზიანდა" }); assert.equal(r.s, 200);
    assert.ok(r.j.moves.some((m) => m.kind === "receive" && m.qty === 20) && r.j.moves.some((m) => m.kind === "adjust" && m.qty === -1), "stock moves recorded");
    assert.equal(r.j.products.find((p) => p.id === "radio").left, 20 - 1 - 2, "left = received − damaged − reserved");
    assert.equal((await sales("/api/stock/receive", { items: [{ id: "radio", qty: 1 }] })).s, 403, "no stock receive permission");
    // ფინანსები: შემოსავალი მხოლოდ finance_view-ით
    const wh = client(); await admin("/api/users", { name: "საწყობი", email: "wh@moku.ge", template: "warehouse", password: "pass12345" });
    await wh("/api/login", { email: "wh@moku.ge", password: "pass12345" }); r = await wh("/api/state");
    assert.ok(r.j.products[0].stock_in !== undefined && r.j.products[0].revenue === undefined, "warehouse sees stock but not revenue");
    // თანამშრომელი ვერ მისცემს სხვას იმაზე მეტს, რაც თავად აქვს
    await admin(`/api/users/${ninoId}`, { perms: ["users", "order_create", "stock_view"] });
    const nino2 = client(); await nino2("/api/login", { email: "nino@moku.ge", password: "newpass123" });
    await nino2(`/api/users/${gioId}`, { perms: ["order_create", "finance_view", "users"] });
    assert.deepEqual((await admin("/api/state")).j.users.find((u) => u.id === gioId).perms, ["order_create"], "cannot grant more than you have");
    // „ყველგან გამოსვლა“ და ჟურნალი
    assert.equal((await admin(`/api/users/${gioId}`, { logoutAll: true })).s, 200);
    assert.equal((await sales2("/api/state")).s, 401, "logout everywhere ends old sessions");
    const au = (await admin("/api/audit")).j.rows; assert.ok(au.some((x) => x.action === "პარტია მიღებულია") && au.some((x) => x.action === "საიტი შეიცვალა" && x.user_name === "სოფო") && au.some((x) => x.action.startsWith("თანამშრომელი:")), "audit log");
    assert.equal((await sofo("/api/audit")).s, 403, "no audit permission");

    // ---- მხოლოდ ფინანსები: სტატისტიკა ყველა შეკვეთით, მყიდველის კონტაქტის გარეშე ----
    await admin("/api/users", { name: "ფინ", email: "fin@moku.ge", template: "sales", perms: ["finance_view"], password: "pass12345" });
    const fin = client(); await fin("/api/login", { email: "fin@moku.ge", password: "pass12345" }); r = await fin("/api/state");
    assert.ok(r.j.orders.length > 2 && r.j.orders.every((o) => !o.phone && o.customer === "მყიდველი"), "finance-only sees all orders without customer contacts");
    await admin("/api/users", { name: "სტოკი", email: "stk@moku.ge", template: "sales", perms: ["stock_receive"], password: "pass12345" });
    const stk = client(); await stk("/api/login", { email: "stk@moku.ge", password: "pass12345" }); r = await stk("/api/state");
    assert.ok(r.j.products && r.j.products[0].stock_in !== undefined && r.j.orders.length === 0, "stock-receive-only user gets stock but no orders");

    // ---- პაროლის აღდგენა მეილით, შეტყობინებები ----
    assert.ok(mails.some((m) => m.to === "sofo@moku.ge" && m.subject.includes("ანგარიში") && m.body.includes("https://moku.ge/admin?reset=")), "welcome mail with set-password link");
    const nm = mails.length; r = await anon("/api/forgot", { email: "sofo@moku.ge" }); assert.equal(r.s, 200); await wait(300);
    const rm = mails.slice(nm).find((m) => m.to === "sofo@moku.ge" && m.subject.includes("აღდგენა")); assert.ok(rm, "reset mail sent");
    assert.equal((await anon("/api/forgot", { email: "nobody@moku.ge" })).s, 200, "unknown email: same answer");
    const tok = decodeURIComponent(/reset=([^"&<]+)/.exec(rm.body)[1]);
    assert.equal((await anon("/api/reset", { token: tok, password: "short" })).s, 400);
    const sofo2 = client(); r = await sofo2("/api/reset", { token: tok, password: "brandnew99" }); assert.equal(r.s, 200, r.t); assert.equal(r.j.me.email, "sofo@moku.ge", "reset logs in");
    assert.equal((await anon("/api/reset", { token: tok, password: "another999" })).s, 400, "reset link works only once");
    assert.equal((await sofo("/api/state")).s, 401, "reset logs out other devices");
    assert.equal((await client()("/api/login", { email: "sofo@moku.ge", password: "brandnew99" })).s, 200, "new password works");
    await wait(300); assert.ok(mails.some((m) => m.to === "sofo@moku.ge" && m.subject.includes("შეიცვალა")), "password changed notice");
    const sofoId = (await admin("/api/state")).j.users.find((u) => u.email === "sofo@moku.ge").id;
    await admin(`/api/users/${sofoId}`, { name: "სოფო", email: "sofo2@moku.ge", title: "" }); await wait(300);
    assert.ok(mails.some((m) => m.to === "sofo@moku.ge" && m.subject.includes("მეილი შეიცვალა")) && mails.some((m) => m.to === "sofo2@moku.ge" && m.subject.includes("მეილი შეიცვალა")), "email change: both addresses notified");
    r = await admin("/api/state"); const sm = r.j.emails.find((e) => !e.order_id && e.status === "sent"); assert.ok(sm, "staff mails in the log");

    // ---- მოგება-ზარალი (მხოლოდ ადმინი) ----
    assert.equal((await wh("/api/pnl")).s, 403, "pnl is admin only"); assert.equal((await sofo2("/api/pnl")).s, 403);
    assert.equal((await admin("/api/state")).j.products[0].cost, undefined, "no cost in state");
    r = await admin("/api/pnl"); assert.equal(r.s, 200, r.t); assert.equal(r.j.months.length, 12);
    r = await admin("/api/orders", { customer: "ლია", phone: "599000666", items: [{ product_id: "toolbox", qty: 2, price: 89 }], fee: 7 }); await admin(`/api/orders/${r.j.orders[0].id}/deliver`, {});
    r = await admin("/api/pnl"); assert.equal(r.j.detail.revenue, 185, "revenue = delivered items + fee"); assert.equal(r.j.detail.noCost, 2, "missing cost flagged");
    r = await admin("/api/pnl/costs", { items: [{ id: "toolbox", buy: "30.5", ship: 4, pack: 1.5 }, { id: "radio", buy: 20, ship: 0, pack: 0 }] });
    assert.equal(r.j.products.find((p) => p.id === "toolbox").cost, 36, "unit cost = 30.5+4+1.5");
    const dt = r.j.detail; assert.equal(dt.products.find((p) => p.id === "toolbox").cogs, 72, "2 sold × 36");
    // ახალი შეკვეთა ინახავს თვითღირებულებას; მერე ფასი იცვლება, შეკვეთას ძველი რჩება
    const levId = (await admin("/api/state")).j.users.find((u) => u.email === "levan@moku.ge").id;
    r = await admin("/api/orders", { customer: "ზურა", phone: "599000777", items: [{ product_id: "radio", qty: 1, price: 50 }], fee: 0, courier_id: levId }); const zo = r.j.orders[0].id;
    await admin(`/api/orders/${zo}/deliver`, {});
    await admin("/api/pnl/costs", { items: [{ id: "radio", buy: 25, ship: 0, pack: 0 }] });
    r = await admin("/api/pnl"); assert.equal(r.j.detail.products.find((p) => p.id === "radio").cogs, 20, "cost frozen at sale time");
    // ხელფასი: კურიერი თითო მიტანაზე, გამყიდველი ფიქსირებული + %
    const ids = Object.fromEntries((await admin("/api/state")).j.users.map((u) => [u.email, u.id])), mon = r.j.now;
    assert.equal((await admin("/api/pnl/pay", { user_id: ids["levan@moku.ge"], per_delivery: 5, from_month: mon })).s, 200);
    assert.equal((await admin("/api/pnl/pay", { user_id: ids["boss@moku.ge"], fixed: 1000, commission: 10, from_month: mon })).s, 200);
    assert.equal((await admin("/api/pnl/pay", { name: "ბუღალტერი", fixed: 300, from_month: mon })).s, 200);
    assert.equal((await admin("/api/pnl/pay", { name: "", fixed: 1 })).s, 400);
    r = await admin("/api/pnl/expense", { kind: "monthly", day: mon, category: "ქირა", amount: 500 }); assert.equal(r.s, 200);
    r = await admin("/api/pnl/expense", { kind: "once", day: (await admin("/api/state")).j.today, category: "რეკლამა", amount: "120.50", note: "FB" });
    let d2 = r.j.detail; const lev = d2.salaries.find((s) => s.user_id === ids["levan@moku.ge"]);
    assert.ok(lev && lev.deliveries === 1 && lev.total === 5, "courier paid per delivery");
    const boss = d2.salaries.find((s) => s.user_id === ids["boss@moku.ge"]); assert.equal(boss.total, Math.round((1000 + boss.sales * 0.1) * 100) / 100, "fixed + commission");
    assert.equal(d2.exp["ქირა"], 500); assert.equal(d2.exp["რეკლამა"], 120.5);
    assert.equal(d2.net, Math.round((d2.revenue - d2.cogs - d2.sal - d2.other) * 100) / 100, "net = revenue − cost − salaries − expenses");
    // ხელფასის შეცვლა იმავე თვეში ანაცვლებს, შემდეგ თვეში ისტორიას ტოვებს
    await admin("/api/pnl/pay", { name: "ბუღალტერი", fixed: 350, from_month: mon });
    const nextM = (([y, m]) => (m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`))(mon.split("-").map(Number));
    r = await admin("/api/pnl/pay", { name: "ბუღალტერი", fixed: 400, from_month: nextM });
    const bh = r.j.pay.filter((p) => p.name === "ბუღალტერი"); assert.equal(bh.length, 2); assert.ok(bh.some((p) => p.fixed === 350 && p.to_month === mon) && bh.some((p) => p.fixed === 400 && p.from_month === nextM), "salary history kept");
    const exId = r.j.detail.expList.find((e) => e.category === "რეკლამა").id;
    r = await admin(`/api/pnl/expense/${exId}/delete`, {}); assert.equal(r.j.detail.exp["რეკლამა"], undefined, "expense deleted");
    assert.ok((await admin("/api/audit")).j.rows.some((x) => x.action === "თვითღირებულება შეიცვალა"), "pnl changes audited");

    // ---- საიტის სტატისტიკა ----
    const beacon = (body, ua = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile", cookie = "") => fetch(B + "/t", { method: "POST", headers: { "Content-Type": "text/plain", "user-agent": ua, cookie }, body: JSON.stringify(body) });
    assert.equal((await beacon({ sid: "abc12345xyz", lang: "ka", ret: 0, src: { r: "l.facebook.com", u: "", c: "", f: 1, g: 0 }, ev: [{ k: "view", p: "/" }, { k: "click", p: "/", l: "toy_card", pid: "toolbox" }, { k: "view", p: "/toy/toolbox" }, { k: "click", p: "/toy/toolbox", l: "gallery" }, { k: "click", p: "/toy/toolbox", l: "order_wa" }, { k: "leave", p: "/toy/toolbox", s: 95, d: 80 }] })).status, 204);
    await beacon({ sid: "def67890uvw", lang: "en", ret: 1, src: { r: "", u: "", c: "" }, ev: [{ k: "view", p: "/en" }, { k: "click", p: "/en", l: "cat:music" }, { k: "leave", p: "/en", s: 20, d: 30 }] }, "Mozilla/5.0 (Windows NT 10.0) Chrome/120");
    await beacon({ sid: "bot0000000", ev: [{ k: "view", p: "/" }] }, "Googlebot/2.1");
    await beacon({ sid: "staff00000", ev: [{ k: "view", p: "/" }] }, "Mozilla/5.0", adminCookie);
    await beacon({ sid: "x", ev: [{ k: "view", p: "/" }] }); await fetch(B + "/t", { method: "POST", body: "not json{" });
    await wait(200);
    assert.equal((await sales("/api/visits")).s, 403, "visits are admin only");
    r = await admin("/api/visits"); assert.equal(r.s, 200, r.t); const v = r.j;
    assert.equal(v.tot.v, 2, "two real visitors (bot, staff and bad sid ignored)"); assert.equal(v.tot.pv, 3); assert.equal(v.tot.orderc, 1); assert.equal(v.tot.mob, 1); assert.equal(v.tot.ret, 1); assert.equal(v.tot.secs, Math.round((95 + 20) / 2));
    assert.ok(v.srcs.some((s) => s.src === "Facebook" && s.intent === 1) && v.srcs.some((s) => s.src === "direct"), "sources classified");
    const pt = v.prods.find((p) => p.pid === "toolbox"); assert.ok(pt && pt.views === 1 && pt.orderc === 1 && pt.cards === 1 && pt.gal === 1, "product funnel");
    assert.ok(v.clicks.some((c) => c.label === "cat:music") && v.cats.music, "clicks and category names");
    assert.ok(v.live >= 2 && v.dev.some((x) => x.k === "mobile") && v.os.some((x) => x.k === "iOS"), "live, device, os");
    assert.ok((await anon("/robots.txt")).t.includes("Disallow: /t"), "robots skip tracker");
    assert.ok(fs.readFileSync(path.join(ROOT, "assets", "shop.js"), "utf8").includes('"/t"'), "site sends visits");
    console.log("ALL CHECKS PASSED");
  } catch (e) { console.error("FAILED:", e.message, e.stack); process.exitCode = 1; }
  finally { srv && srv.kill(); smtp.close(); storageSrv.close(); }
})();
