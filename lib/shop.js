// მაღაზიის მონაცემები (ტექსტები, სათამაშოები, ფასები, ფასდაკლება, კონტაქტები, სტატისტიკა) ინახება settings ცხრილში, გასაღებით "shop".
const fs = require("fs");
const path = require("path");
const db = require("../db");

const DEFAULT = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "shop-default.json"), "utf8"));
const TTL = 60 * 1000; // რამდენ ხანს ვიმახსოვრებთ მეხსიერებაში (SQL-ით ხელით შეცვლის შემთხვევისთვის)
let cache = null, cachedAt = 0;

// ახალი ტექსტები, რომლებიც ძველ ბაზაში ჯერ არ არის, საწყისი ფაილიდან ემატება
function withDefaults(d) {
  d.T = d.T || {};
  for (const l of ["ka", "en"]) d.T[l] = { ...DEFAULT.T[l], ...(d.T[l] || {}) };
  d.contacts = { wa: "", ig: "", phone: "", ...(d.contacts || {}) };
  d.analytics = { ga: "", pixel: "", ...(d.analytics || {}) };
  d.products = Array.isArray(d.products) ? d.products : [];
  d.discount = Number(d.discount) || 0;
  d.room = typeof d.room === "string" ? d.room : "walker";
  return d;
}

async function getShop() {
  if (cache && Date.now() - cachedAt < TTL) return cache;
  const row = await db.one("select value, updated_at from settings where key = 'shop'");
  if (row) {
    cache = withDefaults(typeof row.value === "string" ? JSON.parse(row.value) : row.value);
    cache.updatedAt = row.updated_at ? new Date(row.updated_at).toISOString() : null;
  } else {
    // პირველი გაშვება: ვწერთ საწყის მონაცემებს
    await db.run(
      "insert into settings (key, value, updated_at) values ('shop', $1, $2) on conflict (key) do nothing",
      [JSON.stringify(DEFAULT), new Date().toISOString()]
    );
    cache = withDefaults(JSON.parse(JSON.stringify(DEFAULT)));
    cache.updatedAt = new Date().toISOString();
  }
  cachedAt = Date.now();
  return cache;
}

// შემოწმება, რომ პანელიდან მოსული მონაცემები სწორი ფორმისაა
function validate(d) {
  if (!d || typeof d !== "object") return "მონაცემები არასწორია";
  if (!d.T || !d.T.ka || !d.T.en) return "ტექსტები აკლია";
  if (!Array.isArray(d.products) || d.products.length > 300) return "სათამაშოების სია არასწორია";
  const d0 = Number(d.discount);
  if (!Number.isFinite(d0) || d0 < 0 || d0 > 90) return "ფასდაკლება უნდა იყოს 0-დან 90-მდე";
  const a = d.analytics || {};
  if (a.ga && !/^G-[A-Z0-9]{4,20}$/.test(String(a.ga).trim())) return "Google Analytics-ის კოდი ასე უნდა გამოიყურებოდეს: G-XXXXXXXXXX";
  if (a.pixel && !/^\d{6,20}$/.test(String(a.pixel).trim())) return "Meta Pixel-ის კოდი მხოლოდ ციფრებია";
  const ids = new Set();
  for (const p of d.products) {
    if (!p || typeof p.id !== "string" || !/^[a-z0-9_-]{1,40}$/i.test(p.id) || ids.has(p.id)) return "სათამაშოს კოდი არასწორია";
    ids.add(p.id);
    if (!Array.isArray(p.ka) || !Array.isArray(p.en) || !Array.isArray(p.imgs)) return "სათამაშოს მონაცემები არასწორია";
    if (!String(p.ka[0] || "").trim()) return "სათამაშოს ქართული სახელი ცარიელია";
    if (!Number.isFinite(Number(p.old)) || Number(p.old) < 0) return "ფასი არასწორია";
    if (p.imgs.some((x) => !Array.isArray(x) || !/^[a-z0-9_-]{1,60}$/i.test(String(x[0])))) return "ფოტოს სახელი არასწორია";
  }
  return null;
}

async function saveShop(d) {
  const err = validate(d);
  if (err) return err;
  d.discount = Math.round(Number(d.discount));
  d.room = d.products.some((p) => p.id === d.room) ? d.room : "";
  d.analytics = { ga: String((d.analytics || {}).ga || "").trim(), pixel: String((d.analytics || {}).pixel || "").trim() };
  d.products.forEach((p) => { p.old = Math.round(Number(p.old)); p.imgs = p.imgs.map((x) => [String(x[0]), x[1] ? 1 : 0]); });
  delete d.updatedAt;
  const now = new Date().toISOString();
  await db.run(
    "insert into settings (key, value, updated_at) values ('shop', $1, $2) on conflict (key) do update set value = excluded.value, updated_at = excluded.updated_at",
    [JSON.stringify(d), now]
  );
  cache = withDefaults(d);
  cache.updatedAt = now;
  cachedAt = Date.now();
  return null;
}

// მიმდინარე ფასი ფასდაკლების შემდეგ (ისევე, როგორც საიტზე ჩანს)
const nowPrice = (shop, p) => Math.round(Number(p.old) * (1 - Number(shop.discount || 0) / 100));

module.exports = { getShop, saveShop, nowPrice };
