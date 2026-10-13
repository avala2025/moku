// MOKU: მთავარი სერვერი
const express = require("express");
const path = require("path");
const fs = require("fs");
const db = require("./db");
const { getShop } = require("./lib/shop");
const registerApi = require("./routes/api");

const app = express();
const PORT = process.env.PORT || 3000;
const SHOP_HTML = fs.readFileSync(path.join(__dirname, "views", "shop.html"), "utf8");

app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "same-origin");
  res.setHeader("X-Frame-Options", "DENY");
  next();
});
app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "public"), { maxAge: "7d", index: false }));

const { me, ensureAdmin } = registerApi(app);

// მაღაზია: მონაცემები ბაზიდან ჩაისმება გვერდში. ადმინს ქვემოთ „ადმინი“ ღილაკი უჩნდება.
app.get("/", async (req, res) => {
  const status = await db.dbStatus();
  if (!status.ok) return res.status(503).send(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>MOKU</title><body style="font-family:Arial,sans-serif;display:grid;place-content:center;min-height:90vh;text-align:center;background:#f2f0eb;color:#1d2729"><h1 style="letter-spacing:.4em;font-weight:400">MOKU</h1><p style="color:#b4533f">ბაზა: ${status.reason}</p></body>`);
  try {
    const shop = await getShop();
    const user = await me(req).catch(() => null);
    const html = SHOP_HTML
      .replace("__SHOP_DATA__", () => JSON.stringify(shop).replace(/</g, "\\u003c"))
      .replace("__ADMIN_FLAG__", () => (user && user.role === "admin" ? "<script>window.MOKU_ADMIN=true</script>" : ""));
    res.setHeader("Cache-Control", "no-cache");
    res.send(html);
  } catch (err) {
    console.error(err);
    res.status(500).send("სერვერის შეცდომა");
  }
});

// მართვის სისტემა: ადმინი, გაყიდვები და კურიერი ერთი მისამართიდან შედიან, როლის მიხედვით სხვადასხვას ხედავენ
app.get(["/admin", "/admin/"], (req, res) => {
  res.setHeader("Cache-Control", "no-cache");
  res.sendFile(path.join(__dirname, "public", "admin", "index.html"));
});

app.get("/health", async (req, res) => {
  const s = await db.dbStatus();
  res.json({ ok: true, db: s.ok ? "connected" : s.reason, time: new Date().toISOString() });
});

app.use((req, res) => res.status(404).send("404"));

app.listen(PORT, () => {
  console.log("MOKU მუშაობს პორტზე " + PORT);
  if (db.pool) ensureAdmin().catch((e) => console.error("ადმინის შექმნა:", e.message));
});
