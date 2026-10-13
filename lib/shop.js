// მაღაზიის მონაცემები (ტექსტები, სათამაშოები, ფასები, ფასდაკლება, კონტაქტები) ინახება settings ცხრილში, გასაღებით "shop".
const fs = require("fs");
const path = require("path");
const db = require("../db");

const DEFAULT = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "shop-default.json"), "utf8"));
let cache = null;

async function getShop() {
  if (cache) return cache;
  const row = await db.one("select value from settings where key = 'shop'");
  if (row) {
    cache = typeof row.value === "string" ? JSON.parse(row.value) : row.value;
  } else {
    // პირველი გაშვება: ვწერთ საწყის მონაცემებს
    await db.run(
      "insert into settings (key, value, updated_at) values ('shop', $1, $2) on conflict (key) do nothing",
      [JSON.stringify(DEFAULT), new Date().toISOString()]
    );
    cache = DEFAULT;
  }
  return cache;
}

// შემოწმება, რომ პანელიდან მოსული მონაცემები სწორი ფორმისაა
function validate(d) {
  if (!d || typeof d !== "object") return "მონაცემები არასწორია";
  if (!d.T || !d.T.ka || !d.T.en) return "ტექსტები აკლია";
  if (!Array.isArray(d.products) || d.products.length > 300) return "სათამაშოების სია არასწორია";
  const d0 = Number(d.discount);
  if (!Number.isFinite(d0) || d0 < 0 || d0 > 90) return "ფასდაკლება უნდა იყოს 0-დან 90-მდე";
  const ids = new Set();
  for (const p of d.products) {
    if (!p || typeof p.id !== "string" || !/^[a-z0-9_-]{1,40}$/i.test(p.id) || ids.has(p.id)) return "სათამაშოს კოდი არასწორია";
    ids.add(p.id);
    if (!Array.isArray(p.ka) || !Array.isArray(p.en) || !Array.isArray(p.imgs)) return "სათამაშოს მონაცემები არასწორია";
    if (!Number.isFinite(Number(p.old)) || Number(p.old) < 0) return "ფასი არასწორია";
    if (p.imgs.some((x) => !Array.isArray(x) || !/^[a-z0-9_-]{1,60}$/i.test(String(x[0])))) return "ფოტოს სახელი არასწორია";
  }
  return null;
}

async function saveShop(d) {
  const err = validate(d);
  if (err) return err;
  d.discount = Math.round(Number(d.discount));
  d.products.forEach((p) => (p.old = Math.round(Number(p.old))));
  await db.run(
    "insert into settings (key, value, updated_at) values ('shop', $1, $2) on conflict (key) do update set value = excluded.value, updated_at = excluded.updated_at",
    [JSON.stringify(d), new Date().toISOString()]
  );
  cache = d;
  return null;
}

// მიმდინარე ფასი ფასდაკლების შემდეგ (ისევე, როგორც საიტზე ჩანს)
const nowPrice = (shop, p) => Math.round(Number(p.old) * (1 - Number(shop.discount || 0) / 100));

module.exports = { getShop, saveShop, nowPrice };
