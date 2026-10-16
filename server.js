// MOKU: მთავარი სერვერი
const express = require("express");
const path = require("path");
const fs = require("fs");
const db = require("./db");
const { getShop } = require("./lib/shop");
const render = require("./lib/render");
const { sendText, assetUrl, serveAsset } = require("./lib/send");
const registerApi = require("./routes/api");

const app = express();
const PORT = process.env.PORT || 3000;
const ASSETS = { css: assetUrl("shop.css"), js: assetUrl("shop.js"), panel: assetUrl("panel.js") };

app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("X-Frame-Options", "DENY");
  next();
});
app.get("/a/:file", serveAsset);
app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "public"), {
  maxAge: "30d",
  index: false,
  // მართვის სისტემის ფაილები ყოველთვის ახალი უნდა იყოს
  setHeaders: (res, file) => { if (file.includes(path.sep + "admin" + path.sep)) res.setHeader("Cache-Control", "no-cache"); },
}));

const { me, ensureAdmin, stockLeft, can } = registerApi(app);

// საიტის მისამართი (Google-ისთვის და გაზიარებისთვის): APP_URL, ან თუ არ არის, მოთხოვნიდან
const baseUrl = (req) => (process.env.APP_URL || `${req.headers["x-forwarded-proto"] || "http"}://${req.headers.host}`).replace(/\/$/, "");

async function page(req, res, L, id) {
  const status = await db.dbStatus();
  if (!status.ok) return sendText(req, res, `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>MOKU</title><body style="font-family:Arial,sans-serif;display:grid;place-content:center;min-height:90vh;text-align:center;background:#f2f0eb;color:#1d2729"><h1 style="letter-spacing:.4em;font-weight:400">MOKU</h1><p style="color:#b4533f">ბაზა: ${status.reason}</p></body>`, "text/html; charset=utf-8", "no-store", 503);
  try {
    const shop = await getShop(), base = baseUrl(req);
    const user = await me(req).catch(() => null), admin = !!(user && can(user, "site_edit")); // საიტის პანელი: "საიტის რედაქტირების" უფლებით
    const stock = await stockLeft(shop); // { toolbox: 12, ... }: მარაგის წარწერებისთვის
    if (id === undefined) return sendText(req, res, render.homePage({ shop, L, base, admin, stock, assets: ASSETS }), "text/html; charset=utf-8");
    const p = shop.products.find((x) => x.id === id && (!x.hidden || admin));
    if (!p) return sendText(req, res, render.notFound({ shop, L, base, assets: ASSETS }), "text/html; charset=utf-8", "no-cache", 404);
    sendText(req, res, render.toyPage({ shop, L, base, p, stock, admin, assets: ASSETS }), "text/html; charset=utf-8");
  } catch (err) {
    console.error(err);
    res.status(500).send("სერვერის შეცდომა");
  }
}
app.get("/", (req, res) => page(req, res, "ka"));
app.get("/en", (req, res) => page(req, res, "en"));
app.get("/toy/:id", (req, res) => page(req, res, "ka", req.params.id));
app.get("/en/toy/:id", (req, res) => page(req, res, "en", req.params.id));

// Google-ისთვის: გვერდების სია და რა დაათვალიეროს
app.get("/sitemap.xml", async (req, res) => {
  try { sendText(req, res, render.sitemap({ shop: await getShop(), base: baseUrl(req) }), "application/xml; charset=utf-8", "public, max-age=3600"); }
  catch (err) { console.error(err); res.status(503).send(""); }
});
app.get("/robots.txt", (req, res) => {
  sendText(req, res, `User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /api/\n\nSitemap: ${baseUrl(req)}/sitemap.xml\n`, "text/plain; charset=utf-8", "public, max-age=3600");
});
app.get("/site.webmanifest", (req, res) => {
  sendText(req, res, JSON.stringify({ name: "MOKU", short_name: "MOKU", start_url: "/", display: "browser", background_color: "#f2f0eb", theme_color: "#f2f0eb",
    icons: [{ src: "/icon-192.png", sizes: "192x192", type: "image/png" }, { src: "/icon-512.png", sizes: "512x512", type: "image/png" }] }), "application/manifest+json", "public, max-age=86400");
});

// მართვის სისტემა: ადმინი, გაყიდვები და კურიერი ერთი მისამართიდან შედიან, როლის მიხედვით სხვადასხვას ხედავენ
// სკრიპტის მისამართს ვერსია ემატება, რომ ბრაუზერმა ძველი, დამახსოვრებული ვერსია არ აჩვენოს
const ADMIN_VER = require("./package.json").version + "-" + Date.now().toString(36);
app.get(["/admin", "/admin/"], (req, res) => {
  const html = fs.readFileSync(path.join(__dirname, "public", "admin", "index.html"), "utf8").replace('src="/admin/app.js"', `src="/admin/app.js?v=${ADMIN_VER}"`);
  sendText(req, res, html, "text/html; charset=utf-8", "no-store");
});

app.get("/health", async (req, res) => {
  const s = await db.dbStatus();
  const users = s.ok ? await db.all("select * from users limit 1").catch(() => []) : [];
  res.json({ ok: true, version: require("./package.json").version, db: s.ok ? "connected" : s.reason, perms: users[0] ? ("perms" in users[0] ? "ok" : "SQL 008 ჯერ არ გაშვებულა") : "?", time: new Date().toISOString() });
});

app.use(async (req, res) => {
  try {
    const shop = await getShop();
    sendText(req, res, render.notFound({ shop, L: req.path.startsWith("/en") ? "en" : "ka", base: baseUrl(req), assets: ASSETS }), "text/html; charset=utf-8", "no-cache", 404);
  } catch { res.status(404).send("404"); }
});

app.listen(PORT, () => {
  console.log("MOKU მუშაობს პორტზე " + PORT);
  if (db.pool) ensureAdmin().catch((e) => console.error("ადმინის შექმნა:", e.message));
});
