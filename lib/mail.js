// წერილები: მყიდველს (შეკვეთა გაფორმდა, კურიერმა აიღო) და კურიერს (წასაღები შეკვეთა).
// იგივე ცვლადები, რაც Agroline-ზე: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD.
const db = require("../db");
const { sendSmtp } = require("./smtp");

const SMTP = {
  host: process.env.SMTP_HOST || "",
  port: process.env.SMTP_PORT || "465",
  user: process.env.SMTP_USER || "",
  pass: process.env.SMTP_PASSWORD || "",
};
const APP_URL = (process.env.APP_URL || "").replace(/\/$/, "");
const ready = () => !!(SMTP.host && SMTP.user && SMTP.pass);

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const MON = ["იანვარი", "თებერვალი", "მარტი", "აპრილი", "მაისი", "ივნისი", "ივლისი", "აგვისტო", "სექტემბერი", "ოქტომბერი", "ნოემბერი", "დეკემბერი"];
const fmtDate = (d) => { const x = new Date(d + "T12:00:00Z"); return isNaN(x) ? d : `${x.getUTCDate()} ${MON[x.getUTCMonth()]}`; };
const ZONES = { tbilisi: ["თბილისი", 7], region: ["რეგიონი", 15], pickup: ["თვითგატანა", 0] };
const total = (o) => o.items.reduce((a, i) => a + i.qty * i.price, 0) + Number(o.fee);
const where = (o) => esc(ZONES[o.zone]?.[0] || "") + (o.address ? ", " + esc(o.address) : "");

const shell = (inner) => `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.6;color:#1d2729;max-width:520px;margin:auto;padding:24px">
<div style="letter-spacing:.4em;font-size:20px;margin-bottom:18px">MOKU</div>${inner}<p style="color:#5f6b6d;font-size:13px;margin-top:28px">MOKU · ხის სათამაშოები</p></div>`;
const rows = (o) => o.items.map((i) => `<tr><td style="padding:4px 0">${esc(i.name)} × ${i.qty}</td><td style="padding:4px 0;text-align:right">${i.qty * i.price} ₾</td></tr>`).join("");

const TPL = {
  order_created: (o) => [
    `MOKU: თქვენი შეკვეთა № ${o.id} გაფორმებულია`,
    shell(`<p>გამარჯობა, ${esc(o.customer)}!</p><p>თქვენი შეკვეთა გაფორმებულია.</p>
<table style="width:100%;border-collapse:collapse;border-top:1px solid #dcd8cf;border-bottom:1px solid #dcd8cf;margin:12px 0">${rows(o)}
<tr><td style="padding:4px 0">მიწოდება</td><td style="padding:4px 0;text-align:right">${o.fee} ₾</td></tr>
<tr><td style="padding:6px 0"><b>სულ გადასახდელი</b></td><td style="padding:6px 0;text-align:right"><b>${total(o)} ₾</b></td></tr></table>
<p><b>მიწოდების დღე:</b> ${esc(fmtDate(o.delivery_date))}<br><b>მისამართი:</b> ${where(o)}</p>
<p>როცა კურიერი შეკვეთას აიღებს, კიდევ ერთ წერილს მიიღებთ.</p>`),
  ],
  courier_assigned: (o) => [
    `MOKU: წასაღები შეკვეთა № ${o.id}, ${fmtDate(o.delivery_date)}`,
    shell(`<p>გამარჯობა!</p><p>დაგენიშნათ შეკვეთა № ${o.id}. მიტანის დღე: <b>${esc(fmtDate(o.delivery_date))}</b>.</p>
<p>მისამართი და დეტალები იხილეთ თქვენს პროფილში:</p>
${APP_URL ? `<p><a href="${APP_URL}/admin" style="display:inline-block;background:#1d2729;color:#fbfaf7;padding:12px 22px;border-radius:99px;text-decoration:none">პროფილის გახსნა</a></p>` : ""}`),
  ],
  picked: (o) => [
    `MOKU: კურიერმა თქვენი შეკვეთა № ${o.id} აიღო`,
    shell(`<p>გამარჯობა, ${esc(o.customer)}!</p><p>კურიერმა თქვენი შეკვეთა აიღო და მალე მოგიტანთ.</p>
<p><b>გადასახდელი თანხა:</b> ${total(o)} ₾<br><b>მისამართი:</b> ${where(o)}</p>`),
  ],
};

async function orderWithItems(id) {
  const o = await db.one("select * from orders where id = $1", [id]);
  if (!o) return null;
  o.items = (await db.all("select name, qty, price from order_items where order_id = $1 order by id", [id])).map((i) => ({ ...i, qty: Number(i.qty), price: Number(i.price) }));
  return o;
}

// წერილს ვაგზავნით ფონზე და შედეგს ვინახავთ emails ცხრილში; მოთხოვნას არ აყოვნებს
async function mail(kind, orderId, to) {
  const o = await orderWithItems(orderId);
  if (!o || !TPL[kind]) return;
  const [subject, html] = TPL[kind](o);
  const now = new Date().toISOString();
  if (!to) {
    await db.run("insert into emails (order_id, kind, to_addr, subject, status, error, created) values ($1,$2,'',$3,'skipped','მისამართი არ არის მითითებული',$4)", [orderId, kind, subject, now]);
    return;
  }
  const row = await db.one("insert into emails (order_id, kind, to_addr, subject, status, error, created) values ($1,$2,$3,$4,'sending','',$5) returning id", [orderId, kind, to, subject, now]);
  try {
    if (!ready()) throw new Error("მეილის სერვისი არ არის დაყენებული (SMTP_ ცვლადები)");
    await sendSmtp({ ...SMTP, fromName: "MOKU", fromAddr: SMTP.user, to, subject, html });
    await db.run("update emails set status = 'sent' where id = $1", [row.id]);
  } catch (err) {
    await db.run("update emails set status = 'failed', error = $1 where id = $2", [String(err.message || err).slice(0, 300), row.id]);
  }
}
const mailSafe = (kind, orderId, to) => mail(kind, orderId, to).catch((e) => console.error("mail:", e.message));

module.exports = { mail, mailSafe, ready, ZONES, TPL };
