// წერილები: მყიდველს (შეკვეთა გაფორმდა, კურიერმა აიღო) და კურიერს (წასაღები შეკვეთა).
// იგივე ცვლადები, რაც Agroline-ზე: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD.
// MAIL_FROM (არასავალდებულო): ვისი სახელით წავიდეს, მაგ. orders@moku.ge. თუ არ არის, SMTP_USER გამოიყენება (Gmail-ის შემთხვევა).
const db = require("../db");
const { sendSmtp } = require("./smtp");
const storage = require("./storage");
const { getShop } = require("./shop");

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
const WD = ["კვირა", "ორშაბათი", "სამშაბათი", "ოთხშაბათი", "ხუთშაბათი", "პარასკევი", "შაბათი"];
const fmtDate = (d) => { const x = new Date(d + "T12:00:00Z"); return isNaN(x) ? d : `${x.getUTCDate()} ${MON[x.getUTCMonth()]}`; };
const fmtDay = (d) => { const x = new Date(d + "T12:00:00Z"); return isNaN(x) ? d : `${WD[x.getUTCDay()]}, ${x.getUTCDate()} ${MON[x.getUTCMonth()]}`; };
const ZONES = { tbilisi: ["თბილისი", 7], region: ["რეგიონი", 15], pickup: ["თვითგატანა", 0] };
const total = (o) => o.items.reduce((a, i) => a + i.qty * i.price, 0) + Number(o.fee);
const where = (o) => (o.zone === "pickup" ? "თვითგატანა" : esc(ZONES[o.zone]?.[0] || "") + (o.address ? ", " + esc(o.address) : ""));

// ---------- დიზაინი: საიტის ფერები (ხის, თბილი ფონი), ცხრილებით, რომ ყველა საფოსტო პროგრამაში ერთნაირად ჩანდეს ----------
const C = { bg: "#f2f0eb", card: "#fbfaf7", ink: "#1d2729", soft: "#5f6b6d", line: "#dcd8cf", tile: "#e9e4d8", accent: "#56758a", done: "#5c8a5e" };
const SERIF = "'Noto Serif Georgian','Sylfaen',Georgia,'Times New Roman',serif", SANS = "'Noto Sans Georgian','Helvetica Neue',Helvetica,Arial,sans-serif";
const site = () => APP_URL || "https://moku.ge";
const btn = (href, text, ghost) => `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px 0 4px"><tr><td style="border-radius:99px;background:${ghost ? C.card : C.ink};${ghost ? `border:1px solid ${C.line};` : ""}"><a href="${esc(href)}" style="display:inline-block;padding:13px 26px;font-family:${SANS};font-size:15px;color:${ghost ? C.ink : C.card};text-decoration:none;border-radius:99px">${esc(text)}</a></td></tr></table>`;
const h1 = (t) => `<h1 style="margin:0 0 12px;font-family:${SERIF};font-weight:400;font-size:27px;line-height:1.25;color:${C.ink}">${t}</h1>`;
const pp = (t, extra = "") => `<p style="margin:0 0 12px;font-family:${SANS};font-size:15.5px;line-height:1.6;color:${C.ink};${extra}">${t}</p>`;
const eyebrow = (t) => `<div style="font-family:${SANS};font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:${C.accent};margin:0 0 10px">${esc(t)}</div>`;
const info = (rows) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.tile};border-radius:16px;margin:18px 0 6px"><tr><td style="padding:16px 18px">${rows.map(([k, v]) => `<div style="font-family:${SANS};font-size:12.5px;color:${C.soft};margin-top:8px">${esc(k)}</div><div style="font-family:${SANS};font-size:15.5px;color:${C.ink};line-height:1.45">${v}</div>`).join("")}</td></tr></table>`;
// შეკვეთის გზა: გაფორმდა → კურიერთან → ჩაბარდა
function steps(at) {
  const L = ["გაფორმდა", "კურიერთან", "ჩაბარდა"];
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:6px 0 20px"><tr>${L.map((l, i) => { const on = i <= at;
    return `<td width="33%" style="padding:0 3px;vertical-align:top"><div style="height:4px;border-radius:4px;background:${on ? C.ink : C.line}"></div><div style="font-family:${SANS};font-size:12.5px;margin-top:7px;color:${on ? C.ink : C.soft};${i === at ? "font-weight:bold;" : ""}">${i < at ? "✓ " : ""}${l}</div></td>`; }).join("")}</tr></table>`;
}
const gel = (n) => `${Math.round(Number(n) * 100) / 100} ₾`;
function itemsTable(o, showPrices = true) {
  const rows = o.items.map((i) => `<tr><td width="72" style="padding:12px 12px 12px 0;border-top:1px solid ${C.line};vertical-align:middle">${i.img ? `<img src="${esc(i.img)}" width="64" height="64" alt="" style="display:block;width:64px;height:64px;object-fit:cover;border-radius:12px;background:${C.tile}">` : `<div style="width:64px;height:64px;border-radius:12px;background:${C.tile}"></div>`}</td>
    <td style="padding:12px 0;border-top:1px solid ${C.line};vertical-align:middle;font-family:${SANS}"><div style="font-size:15.5px;color:${C.ink}">${esc(i.title || i.name)}</div>${i.sub ? `<div style="font-size:13px;color:${C.soft};line-height:1.4">${esc(i.sub)}</div>` : ""}<div style="font-size:13px;color:${C.soft}">${i.qty} ც.${showPrices ? ` × ${gel(i.price)}` : ""}</div></td>
    ${showPrices ? `<td align="right" style="padding:12px 0 12px 10px;border-top:1px solid ${C.line};vertical-align:middle;font-family:${SANS};font-size:15.5px;color:${C.ink};white-space:nowrap">${gel(i.qty * i.price)}</td>` : ""}</tr>`).join("");
  const tot = showPrices ? `<tr><td colspan="2" style="padding:12px 0 4px;border-top:1px solid ${C.line};font-family:${SANS};font-size:14.5px;color:${C.soft}">მიწოდება</td><td align="right" style="padding:12px 0 4px;border-top:1px solid ${C.line};font-family:${SANS};font-size:14.5px;color:${C.soft};white-space:nowrap">${Number(o.fee) ? gel(o.fee) : "უფასო"}</td></tr>
    <tr><td colspan="2" style="padding:6px 0 0;font-family:${SANS};font-size:16px;color:${C.ink}"><b>სულ გადასახდელი</b></td><td align="right" style="padding:6px 0 0;font-family:${SERIF};font-size:24px;color:${C.ink};white-space:nowrap">${gel(total(o))}</td></tr>` : "";
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:4px 0 6px">${rows}${tot}</table>`;
}
// კონტაქტები საიტის პანელიდან (თუ ჩაწერილია)
function contactLine(c = {}) {
  const wa = String(c.wa || "").replace(/\D/g, ""), ph = String(c.phone || "").trim(), ig = String(c.ig || "").trim().replace(/^@/, "");
  const a = (href, t) => `<a href="${esc(href)}" style="color:${C.accent};text-decoration:underline">${esc(t)}</a>`;
  const parts = [wa ? a("https://wa.me/" + wa, "WhatsApp") : "", ph ? a("tel:" + ph.replace(/[^\d+]/g, ""), ph) : "", ig ? a("https://instagram.com/" + ig, "Instagram") : ""].filter(Boolean);
  return `კითხვა გაქვთ? უბრალოდ უპასუხეთ ამ წერილს${parts.length ? " ან მოგვწერეთ: " + parts.join(" · ") : ""}.`;
}
// ჩარჩო: ლოგო, ბარათი, ქვედა ზოლი. preheader = ტექსტი, რომელსაც ფოსტა თემის გვერდით აჩვენებს.
const shell = (inner, preheader = "", foot = "") => `<!doctype html><html lang="ka"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light"><title>MOKU</title></head>
<body style="margin:0;padding:0;background:${C.bg}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${esc(preheader)}&#8199;&#65279;&#847;&#8199;&#65279;&#847;&#8199;&#65279;&#847;&#8199;&#65279;&#847;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.bg}"><tr><td align="center" style="padding:28px 14px 36px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px">
<tr><td align="center" style="padding:0 0 20px"><a href="${esc(site())}" style="text-decoration:none;color:${C.ink}"><img src="${esc(site())}/icon-192.png" width="40" height="40" alt="" style="display:inline-block;vertical-align:middle;border-radius:50%;border:0"><span style="display:inline-block;vertical-align:middle;margin-left:10px;font-family:${SANS};font-size:19px;letter-spacing:.42em;color:${C.ink}">MOKU</span></a></td></tr>
<tr><td style="background:${C.card};border:1px solid ${C.line};border-radius:22px;padding:30px 28px 26px">${inner}</td></tr>
<tr><td align="center" style="padding:20px 10px 0;font-family:${SANS};font-size:12.5px;line-height:1.6;color:${C.soft}">${foot ? foot + "<br>" : ""}MOKU · ხის სათამაშოები<br><a href="${esc(site())}" style="color:${C.soft}">${esc(site().replace(/^https?:\/\//, ""))}</a></td></tr>
</table></td></tr></table></body></html>`;

const TPL = {
  order_created: (o, shop) => [
    `MOKU: შეკვეთა № ${o.id} გაფორმებულია`,
    shell(`${eyebrow("შეკვეთა № " + o.id)}${h1(`მადლობა, ${esc(o.customer)}!`)}${pp("თქვენი შეკვეთა მიღებულია და უკვე ვამზადებთ. როცა კურიერი წამოიღებს, კიდევ ერთ წერილს მიიღებთ.")}
${steps(0)}${itemsTable(o)}
${info([["მიწოდების დღე", esc(fmtDay(o.delivery_date))], [o.zone === "pickup" ? "მიღება" : "მისამართი", where(o)], ...(o.note ? [["შენიშვნა", esc(o.note)]] : [])])}
${pp(contactLine(shop.contacts), `font-size:14px;color:${C.soft};margin-top:18px`)}`, `${o.items.length} სათამაშო · ${total(o)} ₾ · მიწოდება ${fmtDate(o.delivery_date)}`),
  ],
  picked: (o, shop) => [
    `MOKU: შეკვეთა № ${o.id} გზაშია`,
    shell(`${eyebrow("შეკვეთა № " + o.id)}${h1("თქვენი შეკვეთა გზაშია")}${pp(`${esc(o.customer)}, კურიერმა შეკვეთა წამოიღო და მალე მოგიტანთ.`)}
${steps(1)}${info([["გადასახდელი თანხა", `<span style="font-family:${SERIF};font-size:22px">${gel(total(o))}</span>`], ["მისამართი", where(o)], ["მიწოდების დღე", esc(fmtDay(o.delivery_date))]])}
${itemsTable(o, false)}
${pp(contactLine(shop.contacts), `font-size:14px;color:${C.soft};margin-top:18px`)}`, `კურიერი მალე მოვა · გადასახდელი ${total(o)} ₾`),
  ],
  courier_assigned: (o) => [
    `MOKU: წასაღები შეკვეთა № ${o.id}, ${fmtDate(o.delivery_date)}`,
    shell(`${eyebrow("კურიერისთვის")}${h1(`ახალი შეკვეთა № ${o.id}`)}${pp("დაგენიშნათ მისატანი შეკვეთა.")}
${info([["მიტანის დღე", esc(fmtDay(o.delivery_date))], ["რაიონი", esc(ZONES[o.zone]?.[0] || "")], ["სათამაშოები", o.items.map((i) => `${esc(i.name)} × ${i.qty}`).join("<br>")]])}
${pp("მყიდველის ტელეფონი, ზუსტი მისამართი და ასაღები თანხა თქვენს პროფილშია.", `font-size:14px;color:${C.soft}`)}${btn(site() + "/admin", "პროფილის გახსნა")}`, `მიტანა ${fmtDate(o.delivery_date)} · ${o.items.length} სათამაშო`),
  ],
};

// სათამაშოს სურათი და სახელი წერილისთვის (JPG, რომ ძველ საფოსტო პროგრამებშიც ჩანდეს)
function decorate(items, shop) {
  const base = site();
  return items.map((i) => {
    const p = shop.products.find((x) => x.id === i.product_id), n = p && p.imgs[0] ? String(p.imgs[0][0]) : "";
    const img = !n ? "" : n.startsWith("u-") ? (storage.publicBase() ? `${storage.publicBase()}/${n}-1200.jpg` : "") : `${base}/img/${n}.jpg`;
    const sub = p && p.ka[4] ? String(p.ka[4]).split(":")[0].trim().slice(0, 60) : "";
    return { ...i, img, title: p ? p.ka[0] : i.name, sub };
  });
}
async function orderWithItems(id, shop) {
  const o = await db.one("select * from orders where id = $1", [id]);
  if (!o) return null;
  o.items = decorate((await db.all("select product_id, name, qty, price from order_items where order_id = $1 order by id", [id])).map((i) => ({ ...i, qty: Number(i.qty), price: Number(i.price) })), shop);
  o.fee = Number(o.fee);
  return o;
}

// წერილს ვაგზავნით ფონზე და შედეგს ვინახავთ emails ცხრილში; მოთხოვნას არ აყოვნებს
async function mail(kind, orderId, to) {
  const shop = await getShop();
  const o = await orderWithItems(orderId, shop);
  if (!o || !TPL[kind]) return;
  const [subject, html] = TPL[kind](o, shop);
  const now = new Date().toISOString();
  if (!to) {
    await db.run("insert into emails (order_id, kind, to_addr, subject, status, error, created) values ($1,$2,'',$3,'skipped','მისამართი არ არის მითითებული',$4)", [orderId, kind, subject, now]);
    return;
  }
  const row = await db.one("insert into emails (order_id, kind, to_addr, subject, status, error, created) values ($1,$2,$3,$4,'sending','',$5) returning id", [orderId, kind, to, subject, now]);
  try {
    if (!ready()) throw new Error("მეილის სერვისი არ არის დაყენებული (SMTP_ ცვლადები)");
    await sendSmtp({ ...SMTP, fromName: "MOKU", fromAddr: (process.env.MAIL_FROM || "").trim() || SMTP.user, to, subject, html });
    await db.run("update emails set status = 'sent' where id = $1", [row.id]);
  } catch (err) {
    await db.run("update emails set status = 'failed', error = $1 where id = $2", [String(err.message || err).slice(0, 300), row.id]);
  }
}
const mailSafe = (kind, orderId, to) => mail(kind, orderId, to).catch((e) => console.error("mail:", e.message));

// თანამშრომლის წერილები: პაროლის აღდგენა, პაროლი შეიცვალა, მეილი შეიცვალა, ახალი ანგარიში.
// ბმული (link) ბაზაში არ ინახება, მხოლოდ თემა და სტატუსი.
const tbTime = () => { const d = new Date(Date.now() + 4 * 36e5); return `${d.getUTCDate()} ${MON[d.getUTCMonth()]}, ${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`; };
const small = (t) => pp(t, `font-size:13.5px;color:${C.soft};margin-top:16px`);
const STAFF = {
  pw_reset: (u, x) => ["MOKU: პაროლის აღდგენა", shell(`${eyebrow("მართვის სისტემა")}${h1("პაროლის აღდგენა")}${pp(`${esc(u.name)}, მოთხოვნილია თქვენი პაროლის აღდგენა. ახალი პაროლის დასაყენებლად დააჭირეთ ღილაკს.`)}${btn(x.link, "ახალი პაროლის დაყენება")}${small("ბმული მოქმედებს 1 საათი და მხოლოდ ერთხელ. თუ ეს თქვენ არ მოგითხოვიათ, უბრალოდ წაშალეთ წერილი. პაროლი არ შეიცვლება.")}`, "ბმული მოქმედებს 1 საათი")],
  pw_changed: (u, x) => ["MOKU: თქვენი პაროლი შეიცვალა", shell(`${eyebrow("უსაფრთხოება")}${h1("პაროლი შეიცვალა")}${pp(`${esc(u.name)}, თქვენი MOKU-ს სისტემის პაროლი შეიცვალა.`)}${info([["როდის", esc(tbTime())], ...(x.by ? [["ვინ შეცვალა", esc(x.by)]] : [])])}${pp("ყველა სხვა მოწყობილობიდან გამოსული ხართ.", `font-size:14px;color:${C.soft}`)}${pp("<b>თუ ეს თქვენ არ გაგიკეთებიათ</b>, მაშინვე აღადგინეთ პაროლი და შეატყობინეთ ადმინს.")}${x.link ? btn(x.link, "პაროლის აღდგენა", true) : ""}`, "თუ ეს თქვენ არ ყოფილხართ, მაშინვე აღადგინეთ")],
  email_changed: (u, x) => ["MOKU: სისტემაში შესვლის მეილი შეიცვალა", shell(`${eyebrow("უსაფრთხოება")}${h1("შესვლის მეილი შეიცვალა")}${pp(`${esc(u.name)}, თქვენი MOKU-ს ანგარიშის მეილი შეიცვალა. ამიერიდან სისტემაში ახალი მეილით შედიხართ.`)}${info([["ძველი", esc(x.old)], ["ახალი", esc(x.new)], ["როდის", esc(tbTime())], ...(x.by ? [["ვინ შეცვალა", esc(x.by)]] : [])])}${small("თუ ეს მოულოდნელია, შეატყობინეთ ადმინს.")}`, `${x.old} → ${x.new}`)],
  welcome: (u, x) => ["MOKU: თქვენთვის შეიქმნა ანგარიში", shell(`${eyebrow("კეთილი იყოს თქვენი მობრძანება")}${h1(`გამარჯობა, ${esc(u.name)}!`)}${pp(`MOKU-ს მართვის სისტემაში თქვენთვის შეიქმნა ანგარიში${u.title ? " (" + esc(u.title) + ")" : ""}.`)}${info([["შესვლის მეილი", esc(u.email)], ["შესვლის მისამართი", `<a href="${esc(site())}/admin" style="color:${C.accent}">${esc(site().replace(/^https?:\/\//, ""))}/admin</a>`]])}${pp("საკუთარი პაროლის დასაყენებლად დააჭირეთ ღილაკს:")}${btn(x.link, "პაროლის დაყენება")}${small("ბმული მოქმედებს 24 საათი. თუ ადმინმა დროებითი პაროლი უკვე მოგცათ, შეგიძლიათ ისიც გამოიყენოთ.")}`, "დააყენეთ საკუთარი პაროლი")],
};
async function staffMail(kind, u, x = {}) {
  const to = x.to || u.email;
  if (!STAFF[kind] || !to) return;
  const [subject, html] = STAFF[kind](u, x);
  const row = await db.one("insert into emails (order_id, kind, to_addr, subject, status, error, created) values (null,$1,$2,$3,'sending','',$4) returning id", [kind, to, subject, new Date().toISOString()]);
  try {
    if (!ready()) throw new Error("მეილის სერვისი არ არის დაყენებული (SMTP_ ცვლადები)");
    await sendSmtp({ ...SMTP, fromName: "MOKU", fromAddr: (process.env.MAIL_FROM || "").trim() || SMTP.user, to, subject, html });
    await db.run("update emails set status = 'sent' where id = $1", [row.id]);
  } catch (err) {
    await db.run("update emails set status = 'failed', error = $1 where id = $2", [String(err.message || err).slice(0, 300), row.id]);
  }
}
const staffSafe = (kind, u, x) => staffMail(kind, u, x).catch((e) => console.error("mail:", e.message));

module.exports = { mail, mailSafe, staffMail, staffSafe, ready, ZONES, TPL, STAFF, APP_URL, decorate };
