"use strict";
const $ = s => document.querySelector(s), app = $("#app");
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const gel = n => (Math.round(n) || 0) + " ₾";
const two = n => String(n).padStart(2, "0");
const when = s => { const x = new Date(s); return isNaN(x) ? "" : `${two(x.getDate())}.${two(x.getMonth() + 1)} ${two(x.getHours())}:${two(x.getMinutes())}`; };
const ago = s => { if (!s) return "არასდროს"; const m = Math.round((Date.now() - new Date(s)) / 6e4); return m < 2 ? "ახლახან" : m < 60 ? m + " წთ წინ" : m < 1440 ? Math.round(m / 60) + " სთ წინ" : when(s); };
const MON = ["იანვარი", "თებერვალი", "მარტი", "აპრილი", "მაისი", "ივნისი", "ივლისი", "აგვისტო", "სექტემბერი", "ოქტომბერი", "ნოემბერი", "დეკემბერი"], WD = ["კვირა", "ორშაბათი", "სამშაბათი", "ოთხშაბათი", "ხუთშაბათი", "პარასკევი", "შაბათი"];
const day = d => { const x = new Date(d + "T12:00:00"); return isNaN(x) ? d : `${WD[x.getDay()]}, ${x.getDate()} ${MON[x.getMonth()]}`; };
const ST = { new: "კურიერი არ არის დანიშნული", assigned: "კურიერი დანიშნულია", picked: "კურიერმა აიღო", problem: "ვერ ჩაბარდა", delivered: "ჩაბარებული", returned: "დაბრუნდა", cancelled: "გაუქმდა" };
const ROLE = { admin: "ადმინი", sales: "გაყიდვები", courier: "კურიერი" };
const ZONE = { tbilisi: ["თბილისი", 7], region: ["რეგიონი", 15], pickup: ["თვითგატანა", 0] };
const KIND = { order_created: "მყიდველს: შეკვეთა გაფორმდა", courier_assigned: "კურიერს: წასაღები შეკვეთა", picked: "მყიდველს: კურიერმა აიღო",
  pw_reset: "თანამშრომელს: პაროლის აღდგენის ბმული", pw_changed: "თანამშრომელს: პაროლი შეიცვალა", email_changed: "თანამშრომელს: მეილი შეიცვალა", welcome: "თანამშრომელს: ახალი ანგარიში" };
const MST = { sent: "გაიგზავნა", failed: "ვერ გაიგზავნა", skipped: "გამოტოვებულია", sending: "იგზავნება" };

// უფლებები ჯგუფებად: [კოდი, სახელი, ახსნა]
const GROUPS = [
  ["შეკვეთები", [["order_create", "ახალი შეკვეთის გაფორმება", "ხედავს „ახალ შეკვეთას“ და საკუთარ შეკვეთებს"], ["orders_all", "ყველა შეკვეთის ნახვა", "სხვების გაფორმებულიც"],
    ["orders_edit", "შეკვეთის შესწორება", "მისამართი, ტელეფონი, სათამაშოები (სანამ კურიერი აიღებს)"], ["orders_cancel", "შეკვეთის გაუქმება", ""],
    ["order_price", "ფასის და მიწოდების ფასის შეცვლა", "თორემ ყოველთვის საიტის ფასი იწერება"], ["csv", "შეკვეთების გადმოწერა Excel-ში", ""]]],
  ["მიწოდება", [["orders_assign", "კურიერის დანიშვნა, ჩაბარება, დაბრუნება", ""], ["couriers_view", "კურიერების დღის ფურცელი", ""], ["courier", "კურიერის რეჟიმი (თვითონ ატარებს)", "ჩნდება კურიერების სიაში"]]],
  ["მარაგი", [["stock_view", "მარაგის ნახვა", "რამდენი ცალია თავისუფალი"], ["stock_receive", "ახალი პარტიის მიღება", ""], ["stock_edit", "მარაგის კორექცია", "დაზიანდა, დაიკარგა, დათვლა"]]],
  ["ფინანსები", [["finance_view", "შემოსავლები და სტატისტიკა", "ფულის ჯამები, ყველაზე გაყიდვადი, გამყიდველების შედეგები"]]],
  ["საიტი", [["site_texts", "საიტის ტექსტები", ""], ["site_products", "სათამაშოები და ფოტოები", "სახელები, აღწერები, ფოტოები, დამალვა"], ["site_prices", "ფასები და ფასდაკლება", "და მიწოდების პირობები"], ["site_contact", "კონტაქტები და სტატისტიკის კოდები", ""]]],
  ["სისტემა", [["users", "თანამშრომლების მართვა", "მხოლოდ ადმინს შეუძლია ამის მიცემა"], ["emails", "წერილების ნახვა და ხელახლა გაგზავნა", ""], ["audit_view", "ცვლილებების ჟურნალი", "ვინ, როდის, რა შეცვალა"]]],
];
const ALL = GROUPS.flatMap(g => g[1].map(p => p[0]));
const PNAME = Object.fromEntries(GROUPS.flatMap(g => g[1].map(p => [p[0], p[1]])));
const TEMPLATES = {
  sales: ["გამყიდველი", ["order_create", "stock_view"]],
  senior: ["უფროსი გამყიდველი", ["order_create", "orders_all", "orders_edit", "orders_cancel", "order_price", "orders_assign", "couriers_view", "stock_view", "csv"]],
  courier: ["კურიერი", ["courier"]],
  warehouse: ["საწყობი", ["stock_view", "stock_receive", "stock_edit", "orders_all", "orders_assign", "couriers_view"]],
  site: ["საიტის მენეჯერი", ["site_texts", "site_products", "site_contact"]],
  admin: ["ადმინი (ყველა უფლება)", []],
};
const SITE = ["site_texts", "site_products", "site_prices", "site_contact"];
const has = (...ps) => ps.some(p => (S?.me?.perms || []).includes(p));
const isAdmin = () => S?.me?.role === "admin";

function tabsFor() {
  const t = [];
  if (has("courier")) t.push(["deliver", "მიტანა"]);
  if (has("orders_all") || has("finance_view")) t.push(["home", "მთავარი"]);
  if (has("orders_all", "order_create")) t.push(["orders", has("orders_all") ? "შეკვეთები" : "ჩემი შეკვეთები"]);
  if (has("order_create")) t.push(["neworder", "ახალი შეკვეთა"]);
  if (has("couriers_view")) t.push(["couriers", "კურიერები"]);
  if (has("stock_view", "stock_receive", "stock_edit")) t.push(["stock", "მარაგი"]);
  if (has("finance_view")) t.push(["stats", "სტატისტიკა"]);
  if (has("users")) t.push(["users", "თანამშრომლები"]);
  if (has("audit_view")) t.push(["audit", "ჟურნალი"]);
  if (has("emails")) t.push(["emails", "მეილები"]);
  if (isAdmin()) t.push(["pnl", "მოგება-ზარალი"], ["visits", "ვიზიტორები"]);
  return t;
}
let RESET = new URLSearchParams(location.search).get("reset") || "", authMode = "";
let S = null, tab = "", filter = "open", F = null, editId = null, busy = false, pending = false, force = false, pw = false, q = "", found = "", reason = {};
let OF = { from: "", to: "", seller: "", courier: "" }, period = "month", AUD = { user: "", q: "", rows: null }, hist = {}, editUser = null, newTpl = "sales";
const img = n => n ? (String(n).startsWith("u-") ? `${S.imgBase}/${n}-480.webp` : `/img/${n}-480.webp`) : "";
const PH = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3"><path d="M3 2h3l1.5 3.5L6 7a9 9 0 0 0 3 3l1.5-1.5L14 10v3a1 1 0 0 1-1 1A11 11 0 0 1 2 3a1 1 0 0 1 1-1Z"/></svg>';
const MAP = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3"><path d="M8 14s4.5-4 4.5-7.5a4.5 4.5 0 0 0-9 0C3.5 10 8 14 8 14Z"/><circle cx="8" cy="6.5" r="1.5"/></svg>';
const REASONS = ["არ პასუხობს", "არასწორი მისამართი", "უარი თქვა", "სხვა"];
const total = o => o.items.reduce((a, i) => a + i.qty * i.price, 0) + o.fee;
const sumOf = list => list.reduce((a, o) => a + total(o), 0);
const place = o => { const z = ZONE[o.zone]?.[0] || "", a = o.address || ""; if (!a) return z; return o.zone === "tbilisi" && /^(თბილისი|tbilisi)/i.test(a.trim()) ? a : z + ", " + a; };
const matches = o => !q || [o.customer, o.phone, o.address, String(o.id), ...o.items.map(i => i.name)].join(" ").toLowerCase().includes(q.toLowerCase());
const say = (m, ok) => { const e = $("#err"); e.textContent = m || ""; e.classList.toggle("ok", !!ok); };
const money = () => has("finance_view");

async function api(path, data) {
  const r = await fetch("/api/" + path, { method: data ? "POST" : "GET", headers: data ? { "Content-Type": "application/json", "X-Moku": "1" } : {}, body: data ? JSON.stringify(data) : undefined, credentials: "same-origin" });
  const j = await r.json().catch(() => ({}));
  if (r.status === 401 && path !== "login") { S = null; draw(); }
  if (!r.ok) throw new Error(j.error || "ვერ შესრულდა. სცადეთ ხელახლა.");
  return j;
}
async function act(path, data, okMsg) {
  if (busy) return; busy = true; say("");
  try { const j = await api(path, data || {}); if (j.out) { S = null; draw(); return true; } if (j.me) S = j; say(okMsg || "", true); force = true; draw(); return true; }
  catch (e) { say(e.message); return false; } finally { busy = false; }
}
const blank = () => { const p = S.products.find(p => p.left > 0) || S.products[0]; return { customer: "", phone: "", email: "", address: "", zone: "tbilisi", fee: 7, note: "", delivery_date: S.tomorrow, courier_id: S.couriers[0]?.id || "", items: [{ product_id: p?.id || "", qty: 1, price: p?.price || 0 }] }; };

function draw() {
  const a = document.activeElement;
  if (S && a && app.contains(a) && /INPUT|TEXTAREA|SELECT/.test(a.tagName) && !force) { pending = true; return; }
  force = false; pending = false;
  if (!S || RESET) { $("#tabs").hidden = $("#me").hidden = true; app.innerHTML = RESET ? resetForm() : authMode === "forgot" ? forgotForm() : login(); return; }
  const tabs = tabsFor();
  if (tab === "edit" && editId) { /* შესწორების ფორმა */ } else if (!tabs.some(t => t[0] === tab)) tab = tabs[0]?.[0] || "";
  $("#me").hidden = false;
  $("#me").innerHTML = `<span>${esc(S.me.name)}${S.me.title && S.me.title !== S.me.name ? " · " + esc(S.me.title) : S.me.name === ROLE[S.me.role] ? "" : " · " + ROLE[S.me.role]}</span>${has(...SITE) ? `<a class="link" href="/">საიტის ნახვა</a>` : ""}<button class="link" data-op="pw">პაროლის შეცვლა</button><button class="link" data-op="logout">გასვლა</button>`;
  $("#tabs").hidden = tabs.length < 2 && !has(...SITE);
  $("#tabs").innerHTML = tabs.map(([k, l]) => `<button type="button" data-tab="${k}" aria-pressed="${k === tab}">${l}</button>`).join("") +
    (has(...SITE) ? `<a class="sitebtn" href="/?edit=${["site_products", "site_prices", "site_contact", "site_texts"].map((p, i) => has(p) ? ["products", "prices", "contact", "texts"][i] : "").find(Boolean)}">✎ საიტის რედაქტირება</a>` : "");
  if (!F && has("order_create")) F = blank();
  const V = { deliver: courier, home, orders, neworder: newOrder, edit: newOrder, couriers: couriersTab, stock: stockTab, stats, users, audit, emails, pnl, visits };
  app.innerHTML = (pw ? pwForm() : "") + (!tab ? (has(...SITE) ? `<div class="msg">შენ საიტის რედაქტირება შეგიძლია. დააჭირე ზემოთ ღილაკს „✎ საიტის რედაქტირება“.</div>` : `<div class="msg">უფლებები ჯერ არ გაქვს. მიმართე ადმინს.</div>`) : (V[tab] || home)());
  if (tab === "audit" && !AUD.rows) loadAudit();
  if (tab === "pnl" && !PN.d && !PN.loading && !PN.fail) loadPnl();
  if (tab === "visits" && !VS.d && !VS.loading && !VS.fail) loadVisits();
  const on = $("#tabs [aria-pressed=true]"), tb = $("#tabs"); if (on && tb.scrollWidth > tb.clientWidth) tb.scrollLeft = on.offsetLeft - tb.clientWidth / 2 + on.offsetWidth / 2; // ტელეფონზე აქტიური ჩანართი ჩანდეს
}
app.addEventListener("focusout", () => setTimeout(() => { if (pending) draw(); }, 0));

const login = () => `<form class="login card" id="login"><h1>შესვლა</h1>
  <label for="l-email">მეილი<input id="l-email" type="email" autocomplete="username" required></label>
  <label for="l-pass">პაროლი<input id="l-pass" type="password" autocomplete="current-password" required></label>
  <button class="btn big" type="submit">შესვლა</button><button class="link" type="button" data-op="forgot" style="justify-self:start">დაგავიწყდა პაროლი?</button></form>`;
const forgotForm = () => `<form class="login card" id="fg"><h1>პაროლის აღდგენა</h1><p class="hint" style="margin:0">ჩაწერე სისტემაში შესვლის მეილი. მოგივა ბმული, რომლითაც ახალ პაროლს დააყენებ (მოქმედებს 1 საათი).</p>
  <label for="fg-email">მეილი<input id="fg-email" type="email" autocomplete="username" required></label>
  <button class="btn big" type="submit">ბმულის გაგზავნა</button><button class="link" type="button" data-op="tologin" style="justify-self:start">← შესვლაზე დაბრუნება</button></form>`;
const resetForm = () => `<form class="login card" id="rs"><h1>ახალი პაროლი</h1>
  <label for="rs-1">ახალი პაროლი (მინ. 8 სიმბოლო)<input id="rs-1" type="password" autocomplete="new-password" minlength="8" required></label>
  <label for="rs-2">გაიმეორე<input id="rs-2" type="password" autocomplete="new-password" minlength="8" required></label>
  <button class="btn big" type="submit">შენახვა და შესვლა</button><button class="link" type="button" data-op="tologin" style="justify-self:start">გაუქმება</button></form>`;
const pwForm = () => `<form class="card" id="pwf" style="margin-bottom:16px"><div class="g2">
  <label for="p-old">ძველი პაროლი<input id="p-old" type="password" autocomplete="current-password" required></label>
  <label for="p-new">ახალი პაროლი (მინ. 8 სიმბოლო)<input id="p-new" type="password" autocomplete="new-password" minlength="8" required></label></div>
  <div class="acts"><button class="btn" type="submit">შენახვა</button><button class="btn ghost" type="button" data-op="pw">დახურვა</button></div></form>`;

// ---------- შეკვეთის ბარათი ----------
function card(o) {
  const s = o.status, assign = has("orders_assign"), cs = `<select id="c-${o.id}" aria-label="კურიერი">${S.couriers.map(c => `<option value="${c.id}" ${c.id === o.courier_id ? "selected" : ""}>${esc(c.name)}</option>`).join("")}</select>`;
  const canAssign = ["new", "assigned", "problem"].includes(s) && S.couriers.length, h = hist[o.id];
  return `<div class="card strip s-${s}"><div class="top"><b>№ ${o.id}</b><span class="pill ${s}">${ST[s]}</span><time>${when(o.created)}</time>${has("orders_all") ? `<small>გააფორმა: ${esc(o.seller)}</small>` : ""}</div>
    <div class="who"><span>${esc(o.customer)} · <a href="tel:${esc(String(o.phone).replace(/[^\d+]/g, ""))}">${esc(o.phone)}</a>${o.email ? " · " + esc(o.email) : ""}</span><span>${esc(place(o))}</span>
    <span>მიტანის დღე: ${esc(day(o.delivery_date))}${o.courier ? " · კურიერი: " + esc(o.courier) : ""}</span></div>
    <ul class="items">${o.items.map(i => `<li><span>${esc(i.name)} × ${i.qty}</span><span>${gel(i.qty * i.price)}</span></li>`).join("")}<li><span>მიწოდება</span><span>${gel(o.fee)}</span></li></ul>
    <div class="sum"><span>სულ</span><span>${gel(total(o))}</span></div>
    ${o.note ? `<div class="note">შენიშვნა: ${esc(o.note)}</div>` : ""}${o.courier_note ? `<div class="note">კურიერი: ${esc(o.courier_note)}</div>` : ""}
    <div class="acts">${assign && canAssign ? `${cs}<button class="btn ghost" data-op="assign" data-id="${o.id}">${s === "new" ? "კურიერის დანიშვნა" : "კურიერის შეცვლა"}</button>` : ""}
      ${has("orders_edit") && ["new", "assigned"].includes(s) ? `<button class="btn ghost" data-op="edit" data-id="${o.id}">შესწორება</button>` : ""}
      ${assign && OPEN.includes(s) ? `<button class="btn ghost" data-op="deliver" data-id="${o.id}">ჩაბარებულია</button>` : ""}
      ${assign && ["picked", "problem", "delivered"].includes(s) ? `<button class="btn bad" data-op="return" data-id="${o.id}">დაბრუნდა</button>` : ""}
      ${has("orders_cancel") && ["new", "assigned", "problem"].includes(s) ? `<button class="btn bad" data-op="cancel" data-id="${o.id}">გაუქმება</button>` : ""}
      <button class="link" data-op="hist" data-id="${o.id}">${h ? "ისტორიის დამალვა" : "ისტორია"}</button></div>
    ${h ? `<ol class="hist">${h.length ? h.map(r => `<li><time>${when(r.at)}</time><b>${esc(r.action)}</b>${r.user_name ? ` · ${esc(r.user_name)}` : ""}${r.detail ? `<small>${esc(r.detail)}</small>` : ""}</li>`).join("") : `<li class="note">ჩანაწერი ჯერ არ არის (ჟურნალი 17.11.2026-დან იწერება).</li>`}</ol>` : ""}</div>`;
}
const OPEN = ["new", "assigned", "picked", "problem"];

// ---------- მთავარი ----------
function home() {
  const n = s => S.orders.filter(o => o.status === s).length, sum = s => sumOf(S.orders.filter(o => o.status === s));
  const full = has("stock_edit", "stock_receive"), m = money();
  const low = full ? S.products.filter(p => !p.hidden && p.left <= 2 && (p.stock_in > 0 || p.sold > 0 || p.reserved > 0 || p.onway > 0)) : [], open = S.orders.filter(o => OPEN.includes(o.status));
  const live = o => !["cancelled", "returned"].includes(o.status);
  const today = S.orders.filter(o => live(o) && String(o.created).slice(0, 10) === S.today), month = S.orders.filter(o => live(o) && String(o.created).slice(0, 7) === S.today.slice(0, 7));
  const delivered = month.filter(o => o.status === "delivered");
  const units = S.products.reduce((a, p) => a + Math.max(0, p.left), 0);
  return `${S.mailReady ? "" : `<div class="msg" style="margin-bottom:14px">მეილის სერვისი ჯერ არ არის დაყენებული, ამიტომ წერილები არ იგზავნება. ისინი ჩანს „მეილები“ განყოფილებაში, როგორც გაუგზავნელი.</div>`}
  <div class="tiles"><div class="tile"><span>დღეს</span><b>${today.length}</b><small>შეკვეთა${m ? " · " + gel(sumOf(today)) : ""}</small></div>
    <div class="tile"><span>ამ თვეში</span><b>${month.length}</b><small>შეკვეთა${m ? " · " + gel(sumOf(month)) : ""} · ჩაბარდა ${delivered.length}</small></div>
    <div class="tile"><span>ჯერ კურიერს არ აუღია</span><b>${n("new") + n("assigned")}</b><small>შეკვეთა${n("new") ? ` · ${n("new")} კურიერის გარეშე` : ""}</small></div>
    <div class="tile"><span>კურიერთანაა</span><b>${n("picked") + n("problem")}</b><small>${m ? "ასაღები " + gel(sum("picked") + sum("problem")) : "შეკვეთა"}${n("problem") ? ` · ${n("problem")} პრობლემა` : ""}</small></div></div>
  ${low.length ? `<h2>მარაგი იწურება</h2><div class="card">${low.map(p => `<div class="crow"><span>${esc(p.name)}</span><span class="pill ${p.left <= 0 ? "problem" : "new"}">${p.left <= 0 ? "გათავდა" : "დარჩა " + p.left}</span><span></span></div>`).join("")}</div>` : ""}
  ${has("orders_all") ? `<h2>გაყიდულია, მაგრამ ჯერ არ ჩაბარებულა <small>${open.length}${m ? " · " + gel(sumOf(open)) : ""}</small></h2><div class="list">${open.map(card).join("") || `<div class="msg">ყველაფერი ჩაბარებულია.</div>`}</div>` : ""}
  ${full ? `<h2>მარაგი</h2><div class="tiles"><div class="tile"><span>მარაგში დარჩა</span><b>${units}</b><small>ცალი, ${S.products.length} სახეობა</small></div><div class="tile"><span>გაიყიდა და ჩაბარდა</span><b>${S.products.reduce((a, p) => a + (p.sold || 0), 0)}</b><small>ცალი${m ? " · " + gel(S.products.reduce((a, p) => a + (p.revenue || 0), 0)) : ""}</small></div></div>` : ""}`;
}

// ---------- შეკვეთები: ძებნა და ფილტრები ----------
function orders() {
  const groups = { open: o => OPEN.includes(o.status), delivered: o => o.status === "delivered", closed: o => ["returned", "cancelled"].includes(o.status), all: () => true };
  const fx = o => (!OF.from || String(o.created).slice(0, 10) >= OF.from) && (!OF.to || String(o.created).slice(0, 10) <= OF.to) && (!OF.seller || o.created_by == OF.seller) && (!OF.courier || o.courier_id == OF.courier) && matches(o);
  const base = S.orders.filter(fx), shown = base.filter(groups[filter]);
  const sellers = [...new Map(S.orders.map(o => [o.created_by, o.seller])).entries()];
  const any = OF.from || OF.to || OF.seller || OF.courier;
  return `<div class="search"><input id="q" type="search" placeholder="ძებნა: სახელი, ტელეფონი, მისამართი, №, სათამაშო" value="${esc(q)}" aria-label="ძებნა">${has("csv") ? `<a class="btn ghost" href="/api/orders.csv">Excel</a>` : ""}</div>
  ${has("orders_all") ? `<div class="filters"><label for="of-from">თარიღიდან<input id="of-from" type="date" data-of="from" value="${esc(OF.from)}"></label><label for="of-to">თარიღამდე<input id="of-to" type="date" data-of="to" value="${esc(OF.to)}"></label>
    <label for="of-seller">გამყიდველი<select id="of-seller" data-of="seller"><option value="">ყველა</option>${sellers.map(([id, n]) => `<option value="${id}" ${id == OF.seller ? "selected" : ""}>${esc(n || "—")}</option>`).join("")}</select></label>
    <label for="of-courier">კურიერი<select id="of-courier" data-of="courier"><option value="">ყველა</option>${S.couriers.map(c => `<option value="${c.id}" ${c.id == OF.courier ? "selected" : ""}>${esc(c.name)}</option>`).join("")}</select></label>
    ${any ? `<button class="link" data-op="ofclear">ფილტრის მოხსნა</button>` : ""}</div>` : ""}
  <div class="chips" role="group" aria-label="სტატუსი">${[["open", "მიმდინარე"], ["delivered", "ჩაბარებული"], ["closed", "დაბრუნებული / გაუქმებული"], ["all", "ყველა"]].map(([k, l]) => `<button type="button" data-filter="${k}" aria-pressed="${k === filter}">${l} · ${base.filter(groups[k]).length}</button>`).join("")}</div>
  ${shown.length && money() ? `<p class="hint">ნაჩვენებია ${shown.length} შეკვეთა · ${gel(sumOf(shown))}</p>` : ""}
  <div class="list">${shown.slice(0, 200).map(card).join("") || `<div class="msg">${q || any ? "ვერაფერი მოიძებნა." : "აქ შეკვეთა არ არის."}</div>`}</div>${shown.length > 200 ? `<p class="hint">ნაჩვენებია პირველი 200. დააზუსტე ძებნა ან თარიღი.</p>` : ""}`;
}

// ---------- ახალი შეკვეთა / შესწორება ----------
const stockList = () => `<ul class="stocklist">${S.products.filter(p => !p.hidden).map(p => `<li>${p.img ? `<img src="${img(p.img)}" alt="">` : "<span></span>"}<span>${esc(p.name)}<br><small class="note">${gel(p.price)}</small></span><span class="${p.left <= 2 ? "low" : ""}">${p.left} ც.</span></li>`).join("")}</ul>`;
function newOrder() {
  const ed = tab === "edit", pr = has("order_price"), lock = pr ? "" : "readonly title=\"ფასის შეცვლის უფლება არ გაქვს\"";
  const sum = F.items.reduce((a, i) => a + (+i.qty || 0) * (+i.price || 0), 0) + (+F.fee || 0);
  const mine = S.orders.filter(o => String(o.created).slice(0, 10) === S.today && !["cancelled", "returned"].includes(o.status) && (has("orders_all") ? o.created_by === S.me.id : true));
  return `${ed ? `<div class="daybar"><span>შეკვეთის <b>№ ${editId}</b> შესწორება</span><button class="link" data-op="editcancel">გაუქმება და დაბრუნება</button></div>` : `<div class="daybar"><span>დღეს გაფორმებული: <b>${mine.length}</b> შეკვეთა</span><span>სულ <b>${gel(sumOf(mine))}</b></span></div>`}
  <div class="split" style="margin-top:12px"><form class="card" id="f" autocomplete="off" style="gap:12px"><div class="g2">
    <label for="f-phone">ტელეფონი${ed ? "" : " (თუ ადრე შეუკვეთავს, დანარჩენი თავად შეივსება)"}<input id="f-phone" data-f="phone" value="${esc(F.phone)}" inputmode="tel" required>${found ? `<span class="found">${esc(found)}</span>` : ""}</label>
    <label for="f-customer">მყიდველის სახელი<input id="f-customer" data-f="customer" value="${esc(F.customer)}" required></label>
    <label for="f-email">მყიდველის მეილი (წერილებისთვის)<input id="f-email" data-f="email" type="email" value="${esc(F.email)}"></label>
    <label for="f-date">მიტანის დღე<input id="f-date" data-f="delivery_date" type="date" value="${esc(F.delivery_date)}" required></label>
    <label for="f-zone">მიწოდება<select id="f-zone" data-f="zone">${Object.entries(ZONE).map(([k, v]) => `<option value="${k}" ${k === F.zone ? "selected" : ""}>${v[0]} · ${v[1]} ₾</option>`).join("")}</select></label>
    <label for="f-fee">მიწოდების ფასი, ₾<input id="f-fee" data-f="fee" type="number" min="0" value="${esc(F.fee)}" ${lock}></label></div>
    <label for="f-address">მისამართი<input id="f-address" data-f="address" value="${esc(F.address)}"></label>
    ${F.items.map((it, k) => `<div class="irow"><span class="th">${(S.products.find(p => p.id == it.product_id) || {}).img ? `<img src="${img(S.products.find(p => p.id == it.product_id).img)}" alt="">` : ""}</span>
      <label for="f-p${k}">სათამაშო<select id="f-p${k}" data-fi="${k}" data-k="product_id">${S.products.map(p => `<option value="${p.id}" ${p.id == it.product_id ? "selected" : ""} ${p.left <= 0 && p.id != it.product_id ? "disabled" : ""}>${esc(p.name)} · ${p.price} ₾ · დარჩა ${p.left}</option>`).join("")}</select></label>
      <label for="f-q${k}">ცალი<input id="f-q${k}" data-fi="${k}" data-k="qty" type="number" min="1" value="${esc(it.qty)}"></label>
      <label for="f-r${k}">ფასი, ₾<input id="f-r${k}" data-fi="${k}" data-k="price" type="number" min="0" value="${esc(it.price)}" ${lock}></label>
      <button type="button" data-op="rmitem" data-k="${k}" aria-label="სტრიქონის წაშლა" ${F.items.length > 1 ? "" : "disabled"}>×</button></div>`).join("")}
    <div class="acts"><button type="button" class="btn ghost" data-op="additem">+ კიდევ ერთი სათამაშო</button></div>
    ${ed ? "" : `<label for="f-courier">კურიერი<select id="f-courier" data-f="courier_id"><option value="">ჯერ არ დავნიშნო</option>${S.couriers.map(c => `<option value="${c.id}" ${c.id == F.courier_id ? "selected" : ""}>${esc(c.name)}</option>`).join("")}</select></label>`}
    <label for="f-note">შენიშვნა<textarea id="f-note" data-f="note" rows="2">${esc(F.note)}</textarea></label>
    <div class="sum"><span>სულ გადასახდელი</span><span id="f-total">${gel(sum)}</span></div>
    ${pr ? "" : `<p class="hint" style="margin:0">ფასი და მიწოდება საიტის ფასით იწერება.</p>`}
    ${ed ? "" : `<p class="hint" style="margin:0">შენახვისას მყიდველს და კურიერს წერილი ავტომატურად გაეგზავნება.</p>`}
    <div class="acts"><button class="btn big" type="submit">${ed ? "შესწორების შენახვა" : "შეკვეთის გაფორმება"}</button></div></form>
    <div class="card"><b>მარაგი ახლა</b>${stockList()}</div></div>`;
}

// ---------- მარაგი ----------
const MK = { receive: "პარტია", adjust: "კორექცია" };
function stockTab() {
  if (!has("stock_receive", "stock_edit")) return `<p class="hint">რამდენი ცალია ახლა თავისუფალი გასაყიდად.</p><div class="card">${stockList()}</div>`;
  const t = k => S.products.reduce((a, p) => a + (p[k] || 0), 0), m = money(), ed = has("stock_edit");
  return `<p class="hint">„მიღებული“ არის სულ რამდენი ცალი შემოვიდა. დარჩენილს სისტემა თავად ითვლის: დაბრუნებული და გაუქმებული შეკვეთები მარაგს უბრუნდება.</p>
  <div class="tw"><table><thead><tr><th>სათამაშო</th><th>დარჩა</th><th>მიღებული</th><th>ფასი, ₾</th><th>გაფორმებული</th><th>კურიერთან</th><th>ჩაბარებული</th>${m ? "<th>შემოსავალი</th>" : ""}</tr></thead>
  <tbody>${S.products.map(p => `<tr><td>${esc(p.name)}${p.hidden ? ` <small class="note">(საიტზე დამალულია)</small>` : ""}</td>
    <td class="${p.left <= 2 ? "low" : ""}">${p.left}</td><td>${p.stock_in}</td>
    <td>${p.price}</td><td>${p.reserved}</td><td>${p.onway}</td><td>${p.sold}</td>${m ? `<td>${gel(p.revenue)}</td>` : ""}</tr>`).join("")}</tbody>
  <tfoot><tr><td>სულ</td><td>${t("left")}</td><td>${t("stock_in")}</td><td></td><td>${t("reserved")}</td><td>${t("onway")}</td><td>${t("sold")}</td>${m ? `<td>${gel(t("revenue"))}</td>` : ""}</tr></tfoot></table></div>
  <div class="split" style="margin-top:16px"><form class="card" id="rcv"><b>ახალი პარტიის მიღება</b><p class="hint" style="margin:0">ჩაწერე, რომელი სათამაშოდან რამდენი ცალი შემოვიდა. დანარჩენი დატოვე ცარიელი.</p>
    <div class="rcv">${S.products.map(p => `<label for="rc-${p.id}"><span>${esc(p.name)}</span><input id="rc-${p.id}" data-rc="${p.id}" type="number" min="0" inputmode="numeric" placeholder="0"></label>`).join("")}</div>
    <label for="rc-note">შენიშვნა (მაგ. ზედნადები, მომწოდებელი)<input id="rc-note"></label>
    <div class="acts"><button class="btn" type="submit">მიღება</button></div></form>
    ${ed ? `<form class="card" id="adj"><b>კორექცია</b><p class="hint" style="margin:0">დაზიანდა ან დაიკარგა: ჩაწერე მინუსით (მაგ. -1). აღმოჩნდა მეტი: პლუსით.</p>
      <label for="aj-p">სათამაშო<select id="aj-p">${S.products.map(p => `<option value="${p.id}">${esc(p.name)} · დარჩა ${p.left}</option>`).join("")}</select></label>
      <div class="g2"><label for="aj-q">რაოდენობა<input id="aj-q" type="number" inputmode="numeric" placeholder="-1"></label><label for="aj-n">მიზეზი<input id="aj-n" list="aj-r" placeholder="დაზიანდა"><datalist id="aj-r"><option value="დაზიანდა"><option value="დაიკარგა"><option value="დათვლის შესწორება"><option value="ნიმუში / საჩუქარი"></datalist></label></div>
      <div class="acts"><button class="btn ghost" type="submit">კორექციის ჩაწერა</button></div></form>` : ""}</div>
  <h2>მოძრაობის ისტორია <small>ბოლო ${(S.moves || []).length}</small></h2>
  <div class="card">${(S.moves || []).map(x => `<div class="crow"><span>${when(x.at)} · ${esc(x.product)}${x.note ? ` <small class="note">· ${esc(x.note)}</small>` : ""}</span><span class="pill ${x.qty > 0 ? "delivered" : "problem"}">${MK[x.kind] || x.kind} ${x.qty > 0 ? "+" : ""}${x.qty}</span><span class="note">${esc(x.by)}</span></div>`).join("") || `<div class="note">ჯერ არაფერი.</div>`}</div>`;
}

// ---------- სტატისტიკა ----------
function stats() {
  const P = { today: ["დღეს", 0], week: ["7 დღე", 7], month: ["ეს თვე", -1], d30: ["30 დღე", 30], all: ["ყველა", null] };
  const start = period === "today" ? S.today : period === "month" ? S.today.slice(0, 7) + "-01" : P[period][1] ? new Date(Date.parse(S.today) - (P[period][1] - 1) * 864e5).toISOString().slice(0, 10) : "";
  const inP = S.orders.filter(o => !start || String(o.created).slice(0, 10) >= start);
  const live = inP.filter(o => !["cancelled", "returned"].includes(o.status)), done = inP.filter(o => o.status === "delivered"), lost = inP.filter(o => ["cancelled", "returned"].includes(o.status));
  const by = (key, list) => { const m = {}; list.forEach(o => { const k = key(o); (m[k] ||= { n: 0, s: 0 }); m[k].n++; m[k].s += total(o); }); return Object.entries(m).sort((a, b) => b[1].s - a[1].s); };
  const toys = {}; live.forEach(o => o.items.forEach(i => { (toys[i.name] ||= { q: 0, s: 0 }); toys[i.name].q += i.qty; toys[i.name].s += i.qty * i.price; }));
  const top = Object.entries(toys).sort((a, b) => b[1].q - a[1].q);
  const rows = (list, f) => list.map(f).join("") || `<tr><td colspan="3" class="note">ჯერ არაფერი.</td></tr>`;
  return `<div class="chips" role="group" aria-label="პერიოდი">${Object.entries(P).map(([k, v]) => `<button type="button" data-period="${k}" aria-pressed="${k === period}">${v[0]}</button>`).join("")}</div>
  <div class="tiles"><div class="tile"><span>გაყიდვები</span><b>${gel(sumOf(live))}</b><small>${live.length} შეკვეთა</small></div>
    <div class="tile"><span>ჩაბარებული</span><b>${gel(sumOf(done))}</b><small>${done.length} შეკვეთა</small></div>
    <div class="tile"><span>საშუალო შეკვეთა</span><b>${gel(live.length ? sumOf(live) / live.length : 0)}</b><small>მიწოდების ჩათვლით</small></div>
    <div class="tile"><span>გაუქმდა / დაბრუნდა</span><b>${lost.length}</b><small>${gel(sumOf(lost))}</small></div></div>
  <div class="split2"><div><h2>ყველაზე გაყიდვადი</h2><div class="tw"><table class="sm"><thead><tr><th>სათამაშო</th><th>ცალი</th><th>თანხა</th></tr></thead><tbody>${rows(top, ([n, v]) => `<tr><td>${esc(n)}</td><td>${v.q}</td><td>${gel(v.s)}</td></tr>`)}</tbody></table></div></div>
  <div><h2>გამყიდველები</h2><div class="tw"><table class="sm"><thead><tr><th>გამყიდველი</th><th>შეკვეთა</th><th>თანხა</th></tr></thead><tbody>${rows(by(o => o.seller || "—", live), ([n, v]) => `<tr><td>${esc(n)}</td><td>${v.n}</td><td>${gel(v.s)}</td></tr>`)}</tbody></table></div>
  <h2>კურიერები</h2><div class="tw"><table class="sm"><thead><tr><th>კურიერი</th><th>ჩააბარა</th><th>თანხა</th></tr></thead><tbody>${rows(by(o => o.courier || "—", done), ([n, v]) => `<tr><td>${esc(n)}</td><td>${v.n}</td><td>${gel(v.s)}</td></tr>`)}</tbody></table></div></div></div>
  <h2>მიწოდების ზონები</h2><div class="tiles">${Object.entries(ZONE).map(([k, z]) => { const l = live.filter(o => o.zone === k); return `<div class="tile"><span>${z[0]}</span><b>${l.length}</b><small>შეკვეთა · ${gel(sumOf(l))}</small></div>`; }).join("")}</div>`;
}

// ---------- კურიერების დღე ----------
function couriersTab() {
  const days = [[S.today, "დღეს"], [S.tomorrow, "ხვალ"]];
  return days.map(([d, l]) => `<h2>${l} <small>${esc(day(d))}</small></h2><div class="list">${S.couriers.map(c => {
    const mine = S.orders.filter(o => o.courier_id === c.id && o.delivery_date === d && ["assigned", "picked", "problem", "delivered"].includes(o.status));
    const todo = mine.filter(o => o.status !== "delivered");
    return `<div class="card"><div class="top"><b>${esc(c.name)}</b><span class="pill">${mine.length} შეკვეთა</span><small>ასაღები ${gel(sumOf(todo))}${mine.length - todo.length ? ` · ჩაბარდა ${mine.length - todo.length}` : ""}</small></div>
      ${mine.map(o => `<div class="crow"><span>№ ${o.id} · ${esc(o.customer)} · ${esc(place(o))}</span><span class="pill ${o.status}">${ST[o.status]}</span><span>${gel(total(o))}</span></div>`).join("") || `<div class="note">შეკვეთა არ არის.</div>`}</div>`;
  }).join("") || `<div class="msg">კურიერი ჯერ არ დაგიმატებია.</div>`}</div>`).join("") +
  (S.orders.some(o => o.status === "new") ? `<h2>კურიერის გარეშე <small>${S.orders.filter(o => o.status === "new").length}</small></h2><div class="list">${S.orders.filter(o => o.status === "new").map(card).join("")}</div>` : "");
}

// ---------- თანამშრომლები ----------
const canGive = p => isAdmin() || (has(p) && p !== "users");
function permBox(prefix, list, disabled) {
  return `<div class="pgroups">${GROUPS.map(([g, ps]) => { const on = ps.filter(p => list.includes(p[0])).length;
    return `<fieldset class="pg"><legend><span>${g}</span><button type="button" class="link" data-op="pgall" data-pre="${prefix}" data-g="${esc(g)}" ${disabled ? "disabled" : ""}>${on === ps.length ? "მოხსნა" : "ყველა"}</button></legend>
      ${ps.map(([k, l, d]) => `<label class="chk"><input type="checkbox" data-perm="${prefix}" data-g="${esc(g)}" value="${k}" ${list.includes(k) ? "checked" : ""} ${disabled || !canGive(k) ? "disabled" : ""}><span>${l}${d ? `<small>${esc(d)}</small>` : ""}</span></label>`).join("")}</fieldset>`; }).join("")}</div>`;
}
function users() {
  const tpl = TEMPLATES[newTpl] || TEMPLATES.sales, ad = newTpl === "admin";
  return `<form class="card" id="uf" autocomplete="off"><b>ახალი თანამშრომელი</b><div class="g2">
    <label for="u-name">სახელი, გვარი<input id="u-name" required></label><label for="u-email">მეილი (ამით შევა სისტემაში)<input id="u-email" type="email" required></label>
    <label for="u-tpl">შაბლონი (უფლებები თავისით მოინიშნება, მერე შეგიძლია შეცვალო)<select id="u-tpl">${Object.entries(TEMPLATES).filter(([k]) => k !== "admin" || isAdmin()).map(([k, v]) => `<option value="${k}" ${k === newTpl ? "selected" : ""}>${v[0]}</option>`).join("")}</select></label>
    <label for="u-title">თანამდებობა (ჩანს სახელთან)<input id="u-title" value="${esc(ad ? "ადმინი" : tpl[0])}"></label>
    <label for="u-pass">დროებითი პაროლი (მინ. 8 სიმბოლო; მერე თავად შეცვლის)<input id="u-pass" minlength="8" required></label></div>
    <span class="hint" style="margin:10px 0 4px;display:block">${ad ? "ადმინს ყველა უფლება აქვს." : "უფლებები"}</span>${ad ? "" : permBox("new", tpl[1])}
    <div class="acts"><button class="btn" type="submit">დამატება</button></div></form>
  <h2>თანამშრომლები <small>${S.users.filter(u => u.active).length} აქტიური</small></h2><div class="list">${S.users.map(u => {
    const self = u.id === S.me.id, lockAdmin = u.role === "admin" && !isAdmin(), ed = editUser === u.id;
    return `<div class="card${u.active ? "" : " off"}"><div class="top"><b>${esc(u.name)}</b><span class="pill ${u.active ? "picked" : "cancelled"}">${esc(u.title || ROLE[u.role])}${u.active ? "" : " · გათიშულია"}</span><small>${esc(u.email)} · ბოლო შესვლა: ${ago(u.last_login)}</small></div>
    ${u.role === "admin" ? `<div class="note">ადმინს ყველა უფლება აქვს (კურიერის რეჟიმის გარდა).</div>` : `<div class="note">${u.perms.length ? u.perms.map(p => PNAME[p]).filter(Boolean).join(" · ") : "უფლებები არ აქვს"}</div>`}
    ${lockAdmin ? "" : `<details ${ed ? "open" : ""} data-ud="${u.id}"><summary class="note">შეცვლა</summary><div class="ued">
      <div class="g3"><label for="ue-n-${u.id}">სახელი<input id="ue-n-${u.id}" value="${esc(u.name)}"></label><label for="ue-e-${u.id}">მეილი<input id="ue-e-${u.id}" type="email" value="${esc(u.email)}"></label><label for="ue-t-${u.id}">თანამდებობა<input id="ue-t-${u.id}" value="${esc(u.title)}"></label></div>
      <div class="acts"><button class="btn ghost" data-op="saveinfo" data-id="${u.id}">მონაცემების შენახვა</button></div>
      ${u.role === "admin" || self ? `<div class="note">${self ? "საკუთარ უფლებებს ვერ შეცვლი." : ""}</div>` : `<div class="acts"><span class="note">შაბლონი:</span>${Object.entries(TEMPLATES).filter(([k]) => k !== "admin").map(([k, v]) => `<button type="button" class="chipbtn" data-op="usetpl" data-id="${u.id}" data-t="${k}">${v[0]}</button>`).join("")}</div>${permBox(u.id, u.perms)}<div class="acts"><button class="btn" data-op="saveperms" data-id="${u.id}">უფლებების შენახვა</button></div>`}
      <div class="acts"><input id="np-${u.id}" placeholder="ახალი პაროლი (მინ. 8)" aria-label="ახალი პაროლი" style="max-width:220px"><button class="btn ghost" data-op="resetpw" data-id="${u.id}">პაროლის შეცვლა</button>
        <button class="btn ghost" data-op="logoutall" data-id="${u.id}">ყველა მოწყობილობიდან გამოყვანა</button>
        ${self ? "" : `<button class="btn ${u.active ? "bad" : "ghost"}" data-op="toggleuser" data-id="${u.id}" data-on="${u.active ? 0 : 1}">${u.active ? "გათიშვა" : "ჩართვა"}</button>`}</div>
      <p class="hint" style="margin:0">გათიშული თანამშრომელი ვეღარ შევა, მაგრამ მისი შეკვეთები და ისტორია რჩება. პაროლის შეცვლა და გათიშვა მას ყველგან გამოიყვანს.</p></div></details>`}</div>`; }).join("")}</div>`;
}
const pickedPerms = prefix => [...document.querySelectorAll(`[data-perm="${prefix}"]:checked`)].map(c => c.value);

// ---------- ჟურნალი ----------
async function loadAudit() { try { const r = await api(`audit?user=${encodeURIComponent(AUD.user)}&q=${encodeURIComponent(AUD.q)}`); AUD.rows = r.rows; force = true; draw(); } catch (e) { say(e.message); } }
function audit() {
  const people = S.users || S.sellers || [];
  return `<p class="hint">ყველა მნიშვნელოვანი ცვლილება: ვინ, როდის და რა გააკეთა (შეკვეთები, ფასები, მარაგი, თანამშრომლები, საიტი).</p>
  <div class="filters"><label for="au-u">თანამშრომელი<select id="au-u"><option value="">ყველა</option>${people.map(u => `<option value="${u.id}" ${u.id == AUD.user ? "selected" : ""}>${esc(u.name)}</option>`).join("")}</select></label>
    <label for="au-q">ძებნა<input id="au-q" type="search" value="${esc(AUD.q)}" placeholder="მაგ. ფასი, № 12, გაუქმდა"></label></div>
  <div class="card">${AUD.rows === null ? `<div class="note">იტვირთება…</div>` : AUD.rows.map(r => `<div class="arow"><time>${when(r.at)}</time><span><b>${esc(r.action)}</b>${r.order_id ? ` · <span class="pill">№ ${r.order_id}</span>` : ""}${r.detail ? `<small>${esc(r.detail)}</small>` : ""}</span><span class="note">${esc(r.user_name)}</span></div>`).join("") || `<div class="note">ჩანაწერი არ არის.</div>`}</div>`;
}

const emails = () => `${S.mailReady ? "" : `<div class="msg" style="margin-bottom:14px">მეილის სერვისი ჯერ არ არის დაყენებული.</div>`}
  <div class="list">${S.emails.map(e => `<div class="card"><div class="top"><b>${e.order_id ? "№ " + e.order_id : "ანგარიში"}</b><span class="pill ${e.status}">${MST[e.status] || e.status}</span><time>${when(e.created)}</time></div>
    <div class="who"><span>${esc(KIND[e.kind] || e.kind)}</span><span>${esc(e.to_addr || "მისამართის გარეშე")}</span></div>${e.error ? `<div class="note">${esc(e.error)}</div>` : ""}
    ${e.status === "failed" && e.order_id ? `<div class="acts"><button class="btn ghost" data-op="retry" data-id="${e.id}">ხელახლა გაგზავნა</button></div>` : ""}</div>`).join("") || `<div class="msg">წერილები ჯერ არ გაგზავნილა.</div>`}</div>`;

// ---------- კურიერი (ტელეფონზე) ----------
function courier() {
  const list = S.deliveries || [], todo = list.filter(o => o.status !== "delivered"), done = list.filter(o => o.status === "delivered");
  const c = o => `<div class="card strip s-${o.status}"><div class="top"><b>№ ${o.id}</b><span class="pill ${o.status}">${o.status === "assigned" ? "წასაღებია" : o.status === "picked" ? "აღებული მაქვს" : ST[o.status]}</span></div>
    <div class="who"><span><b>${esc(o.customer)}</b></span><span>${esc(place(o))}</span></div>
    <div class="acts"><a class="btn ghost" href="tel:${esc(String(o.phone).replace(/[^\d+]/g, ""))}">${PH}${esc(o.phone)}</a>${o.address ? `<a class="btn ghost" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(o.address)}" target="_blank" rel="noopener">${MAP}რუკა</a>` : ""}</div>
    <ul class="items">${o.items.map(i => `<li><span>${esc(i.name)}</span><span>× ${i.qty}</span></li>`).join("")}</ul>
    <div class="sum"><span>ასაღები თანხა</span><span>${gel(o.collect)}</span></div>
    ${o.note ? `<div class="note">შენიშვნა: ${esc(o.note)}</div>` : ""}${o.courier_note ? `<div class="note">ჩემი შენიშვნა: ${esc(o.courier_note)}</div>` : ""}
    ${o.status === "delivered" ? "" : o.status === "assigned" ? `<div class="acts"><button class="btn big wide" data-op="pick" data-id="${o.id}">ავიღე შეკვეთა</button></div>` :
      `<div class="acts"><button class="btn big wide" data-op="cdeliver" data-id="${o.id}">ჩაბარებულია</button></div>
      ${o.status === "picked" ? `<details><summary class="note">ვერ ჩავაბარე…</summary><div class="reasons" style="margin:8px 0">${REASONS.map(r => `<button type="button" data-reason="${o.id}" data-r="${esc(r)}" aria-pressed="${reason[o.id] === r}">${r}</button>`).join("")}</div>
      ${reason[o.id] === "სხვა" ? `<label for="n-${o.id}">რა მოხდა<input id="n-${o.id}"></label>` : ""}<div class="acts" style="margin-top:8px"><button class="btn bad" data-op="problem" data-id="${o.id}" ${reason[o.id] ? "" : "disabled"}>დადასტურება: ვერ ჩავაბარე</button></div></details>` : ""}`}</div>`;
  const byDay = {}; todo.forEach(o => (byDay[o.delivery_date] ||= []).push(o));
  const label = d => d === S.today ? "დღეს" : d === S.tomorrow ? "ხვალ" : day(d);
  const todayList = byDay[S.today] || [];
  return `<div class="daybar"><span>დღეს წასაღები: <b>${todayList.length}</b></span><span>ასაღები სულ <b>${gel(todayList.reduce((a, o) => a + o.collect, 0))}</b></span></div>
  ${Object.keys(byDay).sort().map(d => `<h2>${label(d)} <small>${byDay[d].length} · ${esc(day(d))}</small></h2><div class="list">${byDay[d].map(c).join("")}</div>`).join("") || `<h2>მიტანა</h2><div class="msg">ახლა წასაღები არაფერია.</div>`}
  ${done.length ? `<h2>დღეს ჩაბარებული <small>${done.length}</small></h2><div class="list">${done.map(c).join("")}</div>` : ""}`;
}


// ---------- მოგება-ზარალი (მხოლოდ ადმინი) ----------
let PN = { m: "", d: null, view: "report", loading: false }, KEEP = {};
const fm = n => { const r = Math.round((+n || 0) * 100) / 100; return (r < 0 ? "−" : "") + Math.abs(r).toLocaleString("en-US", { maximumFractionDigits: 2 }).replace(/,/g, " ") + " ₾"; };
const mname = m => { const [y, mo] = String(m).split("-"); return `${MON[+mo - 1] || ""} ${y}`; };
const pc = (a, b) => (b ? Math.round((a / b) * 100) : 0);
const kv = (id, def) => esc(KEEP[id] ?? def ?? "");
const sg = n => (n < 0 ? "neg" : "pos");
async function loadPnl(m) { PN.loading = true; try { PN.d = await api("pnl" + ((m || PN.m) ? "?m=" + (m || PN.m) : "")); PN.m = PN.d.month; PN.fail = false; } catch (e) { PN.fail = true; say(e.message); } PN.loading = false; force = true; draw(); }
async function pnlAct(path, data, ok) { if (busy) return false; busy = true; say(""); try { PN.d = await api(path, { ...data, m: PN.m }); say(ok, true); force = true; draw(); return true; } catch (e) { say(e.message); return false; } finally { busy = false; } }
const monthPick = D => `<label for="pn-m" style="max-width:240px">თვე<select id="pn-m">${D.months.slice().reverse().map(x => `<option value="${x.month}" ${x.month === PN.m ? "selected" : ""}>${mname(x.month)}</option>`).join("")}</select></label>`;
function pnl() {
  const D = PN.d; if (!D) return `<div class="note">იტვირთება…</div>`;
  const V = [["report", "ანგარიში"], ["costs", "თვითღირებულება"], ["pay", "ხელფასები"], ["exp", "ხარჯები"]];
  return `<div class="chips" role="group" aria-label="მოგება-ზარალი">${V.map(([k, l]) => `<button type="button" data-pv="${k}" aria-pressed="${k === PN.view}">${l}</button>`).join("")}</div>` + { report: pnlReport, costs: pnlCosts, pay: pnlPay, exp: pnlExp }[PN.view](D);
}
function pnlReport(D) {
  const x = D.detail, miss = D.products.filter(p => !p.set && !p.hidden).length;
  const f0 = D.months.findIndex(m => m.orders || m.sal || m.other), MS = D.months.slice(f0 < 0 ? D.months.length - 1 : Math.min(f0, D.months.length - 1)); // ცარიელი თვეები თავში არ ჩანს
  const max = Math.max(1, ...MS.map(m => Math.abs(m.net)));
  const T = k => MS.reduce((a, m) => a + m[k], 0);
  return `<div class="filters">${monthPick(D)}</div>
  ${x.noCost ? `<div class="warn" style="margin-bottom:12px">${x.noCost} გაყიდულ ცალს თვითღირებულება არ აქვს ჩაწერილი, ამიტომ მოგება რეალურზე მეტად ჩანს. <button class="link" data-pv="costs">თვითღირებულების ჩაწერა</button></div>` : miss ? `<div class="warn" style="margin-bottom:12px">${miss} სათამაშოს თვითღირებულება ჯერ არ არის ჩაწერილი. <button class="link" data-pv="costs">ჩაწერა</button></div>` : ""}
  <div class="tiles"><div class="tile"><span>შემოსავალი</span><b>${fm(x.revenue)}</b><small>${x.orders} შეკვეთა · ${x.units} ცალი</small></div>
    <div class="tile"><span>თვითღირებულება</span><b>${fm(x.cogs)}</b><small>მთლიანი მოგება ${fm(x.gross)}</small></div>
    <div class="tile"><span>ხარჯები</span><b>${fm(x.sal + x.other)}</b><small>ხელფასი ${fm(x.sal)} · სხვა ${fm(x.other)}</small></div>
    <div class="tile"><span>წმინდა მოგება</span><b class="${sg(x.net)}">${fm(x.net)}</b><small>მარჟა ${pc(x.net, x.revenue)}%</small></div></div>
  <div class="split2"><div><h2>${mname(x.month)}</h2><div class="card pl">
    <div><span>სათამაშოების გაყიდვა</span><span>${fm(x.goods)}</span></div><div><span>მიწოდების საფასური</span><span>${fm(x.fee)}</span></div>
    <div class="eq"><span>შემოსავალი</span><span>${fm(x.revenue)}</span></div>
    <div><span>− თვითღირებულება</span><span>${fm(-x.cogs)}</span></div>
    <div class="eq"><span>მთლიანი მოგება <small class="note">${pc(x.gross, x.revenue)}%</small></span><span>${fm(x.gross)}</span></div>
    <div><span>− ხელფასები</span><span>${fm(-x.sal)}</span></div>
    ${x.salaries.map(s => `<div class="sub"><span>${esc(s.name)}${s.deliveries ? ` · ${s.deliveries} მიტანა` : ""}${s.byComm ? ` · ${fm(s.byComm)} %-ით` : ""}</span><span>${fm(s.total)}</span></div>`).join("")}
    ${Object.entries(x.exp).map(([c, v]) => `<div><span>− ${esc(c)}</span><span>${fm(-v)}</span></div>`).join("")}
    <div class="eq big"><span>წმინდა მოგება</span><span class="${sg(x.net)}">${fm(x.net)}</span></div></div>
    <p class="hint" style="margin-top:8px">შემოსავალი ითვლება ჩაბარებული შეკვეთებიდან, ჩაბარების თვის მიხედვით. გაუქმებული და დაბრუნებული არ ითვლება.</p></div>
  <div><h2>მარაგის ღირებულება</h2><div class="tiles" style="grid-template-columns:1fr 1fr"><div class="tile"><span>თვითღირებულებით</span><b>${fm(D.stockValue)}</b><small>რაც ახლა საწყობშია</small></div><div class="tile"><span>საიტის ფასით</span><b>${fm(D.stockRetail)}</b><small>თუ ყველაფერი გაიყიდება</small></div></div>
    <h2>სათამაშოები ამ თვეში</h2><div class="tw"><table class="sm"><thead><tr><th>სათამაშო</th><th>ცალი</th><th>შემოსავალი</th><th>მოგება</th><th>მარჟა</th></tr></thead><tbody>${x.products.map(p => `<tr><td>${esc(p.name)}${p.noCost ? ` <small class="neg">(თვითღ. არ არის)</small>` : ""}</td><td>${p.qty}</td><td>${fm(p.rev)}</td><td class="${sg(p.profit)}">${fm(p.profit)}</td><td>${pc(p.profit, p.rev)}%</td></tr>`).join("") || `<tr><td colspan="5" class="note">ამ თვეში ჩაბარებული შეკვეთა არ არის.</td></tr>`}</tbody></table></div></div></div>
  <h2>თვეების მიხედვით <small>წმინდა მოგება</small></h2>
  <div class="card"><div class="bars">${MS.map(m => `<div class="b" title="${mname(m.month)}: ${fm(m.net)}"><em class="${sg(m.net)}">${m.net ? Math.round(m.net) : ""}</em><i class="${m.net < 0 ? "neg" : ""}" style="height:${Math.max(2, Math.round((Math.abs(m.net) / max) * 100))}%"></i><span>${(MON[+m.month.slice(5) - 1] || "").slice(0, 3)}</span></div>`).join("")}</div></div>
  <div class="tw" style="margin-top:12px"><table><thead><tr><th>თვე</th><th>შეკვეთა</th><th>შემოსავალი</th><th>თვითღირებულება</th><th>მთლიანი მოგება</th><th>ხელფასი</th><th>სხვა ხარჯი</th><th>წმინდა მოგება</th></tr></thead>
  <tbody>${MS.slice().reverse().map(m => `<tr><td><button class="link" data-op="pnlmonth" data-m="${m.month}">${mname(m.month)}</button></td><td>${m.orders}</td><td>${fm(m.revenue)}</td><td>${fm(m.cogs)}</td><td>${fm(m.gross)}</td><td>${fm(m.sal)}</td><td>${fm(m.other)}</td><td class="${sg(m.net)}">${fm(m.net)}</td></tr>`).join("")}</tbody>
  <tfoot><tr><td>სულ${MS.length > 1 ? ` (${MS.length} თვე)` : ""}</td><td>${T("orders")}</td><td>${fm(T("revenue"))}</td><td>${fm(T("cogs"))}</td><td>${fm(T("gross"))}</td><td>${fm(T("sal"))}</td><td>${fm(T("other"))}</td><td class="${sg(T("net"))}">${fm(T("net"))}</td></tr></tfoot></table></div>`;
}
function costRow(id) {
  const p = PN.d.products.find(x => x.id === id); if (!p) return;
  const v = k => +(String(KEEP[`c-${k}-${id}`] ?? p[k]).replace(",", ".")) || 0, c = v("buy") + v("ship") + v("pack");
  const set = (s, t, cl) => { const e = $(s); if (e) { e.textContent = t; if (cl !== undefined) e.className = cl; } };
  set(`#ct-${id}`, c ? fm(c) : "—"); set(`#cp-${id}`, c ? fm(p.price - c) : "—", c ? sg(p.price - c) : ""); set(`#cm-${id}`, c ? pc(p.price - c, p.price) + "%" : "—");
}
function pnlCosts(D) {
  const inp = (p, k) => `<input id="c-${k}-${p.id}" data-keep data-cost="${p.id}" type="number" min="0" step="0.01" inputmode="decimal" value="${kv(`c-${k}-${p.id}`, p[k] || "")}" placeholder="0" aria-label="${esc(p.name)}">`;
  return `<p class="hint">ჩაწერე <b>ერთი ცალის</b> ფასი ლარში. მაგ.: თუ 100 ცალის ტრანსპორტი და განბაჟება 300 ₾ დაჯდა, ტრანსპორტში ჩაწერე 3. ახალი თვითღირებულება მოქმედებს ახალ შეკვეთებზე. უკვე გაფორმებულ შეკვეთებს ძველი რჩება, ხოლო ამ ცვლილებამდე გაფორმებულებს მიმდინარე ფასი ეთვლებათ.</p>
  <form id="costf"><div class="tw costs"><table><thead><tr><th>სათამაშო</th><th>საიტის ფასი</th><th>შესყიდვა</th><th>ტრანსპორტი, განბაჟება</th><th>შეფუთვა</th><th>თვითღირებულება</th><th>მოგება ცალზე</th><th>მარჟა</th><th>მარაგში</th></tr></thead>
  <tbody>${D.products.map(p => { const v = k => +(String(KEEP[`c-${k}-${p.id}`] ?? p[k]).replace(",", ".")) || 0, c = v("buy") + v("ship") + v("pack");
    return `<tr><td>${esc(p.name)}${p.hidden ? ` <small class="note">(დამალული)</small>` : ""}</td><td>${fm(p.price)}</td><td>${inp(p, "buy")}</td><td>${inp(p, "ship")}</td><td>${inp(p, "pack")}</td><td id="ct-${p.id}">${c ? fm(c) : "—"}</td><td id="cp-${p.id}" class="${c ? sg(p.price - c) : ""}">${c ? fm(p.price - c) : "—"}</td><td id="cm-${p.id}">${c ? pc(p.price - c, p.price) + "%" : "—"}</td><td>${p.left}</td></tr>`; }).join("")}</tbody></table></div>
  <div class="acts" style="margin-top:12px"><button class="btn" type="submit">შენახვა</button></div></form>`;
}
function pnlPay(D) {
  const u = KEEP["pf-u"] ?? "", x = D.detail, act = D.pay.filter(p => p.active), old = D.pay.filter(p => !p.active);
  const terms = p => [p.fixed ? `თვეში ${fm(p.fixed)}` : "", p.per_delivery ? `თითო მიტანა ${fm(p.per_delivery)}` : "", p.commission ? `${p.commission}% საკუთარი გაყიდვებიდან` : ""].filter(Boolean).join(" · ");
  return `<p class="hint">ხელფასი შეიძლება იყოს ფიქსირებული, თითო ჩაბარებულ შეკვეთაზე (კურიერი) ან პროცენტი იმ შეკვეთებიდან, რომლებიც თანამშრომელმა გააფორმა. შეიძლება სამივე ერთად. პირობის შეცვლისას ძველი თვეები უცვლელი რჩება.</p>
  <div class="split2"><form class="card" id="payf"><b>ხელფასის დანიშვნა ან შეცვლა</b>
    <label for="pf-u">თანამშრომელი<select id="pf-u" data-keep><option value="">აირჩიე…</option>${D.staff.filter(s => s.active).map(s => `<option value="${s.id}" ${String(s.id) === u ? "selected" : ""}>${esc(s.name)}${s.title ? " · " + esc(s.title) : ""}</option>`).join("")}<option value="x" ${u === "x" ? "selected" : ""}>სხვა (სისტემაში არ შედის)</option></select></label>
    ${u === "x" ? `<label for="pf-n">სახელი<input id="pf-n" data-keep value="${kv("pf-n")}"></label>` : ""}
    <div class="g2"><label for="pf-f">ფიქსირებული, თვეში ₾<input id="pf-f" data-keep type="number" min="0" step="0.01" value="${kv("pf-f")}" placeholder="0"></label>
      <label for="pf-d">თითო ჩაბარებულ შეკვეთაზე ₾<input id="pf-d" data-keep type="number" min="0" step="0.01" value="${kv("pf-d")}" placeholder="0"></label>
      <label for="pf-c">% საკუთარი გაყიდვებიდან<input id="pf-c" data-keep type="number" min="0" max="100" step="0.1" value="${kv("pf-c")}" placeholder="0"></label>
      <label for="pf-m">რომელი თვიდან<input id="pf-m" data-keep type="month" value="${kv("pf-m", D.now)}"></label></div>
    <div class="acts"><button class="btn" type="submit">შენახვა</button></div></form>
  <div><div class="filters">${monthPick(D)}</div><div class="tw"><table class="sm"><thead><tr><th>${esc(mname(x.month))}</th><th>ფიქს.</th><th>მიტანით</th><th>%-ით</th><th>სულ</th></tr></thead>
    <tbody>${x.salaries.map(s => `<tr><td>${esc(s.name)}</td><td>${fm(s.fixed)}</td><td>${s.deliveries ? `${fm(s.byDel)} <small class="note">(${s.deliveries})</small>` : "—"}</td><td>${s.byComm ? `${fm(s.byComm)} <small class="note">(${fm(s.sales)}-დან)</small>` : "—"}</td><td><b>${fm(s.total)}</b></td></tr>`).join("") || `<tr><td colspan="5" class="note">ამ თვეში ხელფასი არავისზეა.</td></tr>`}</tbody>
    ${x.salaries.length ? `<tfoot><tr><td>სულ</td><td></td><td></td><td></td><td>${fm(x.sal)}</td></tr></tfoot>` : ""}</table></div></div></div>
  <h2>მოქმედი პირობები</h2><div class="list">${act.map(p => `<div class="card"><div class="top"><b>${esc(p.name)}</b><small>${mname(p.from_month)}-დან${p.to_month ? " " + mname(p.to_month) + "-მდე" : ""}</small></div><div>${terms(p)}</div>
    <div class="acts"><button class="btn ghost" data-op="pnlpay-edit" data-id="${p.id}">შეცვლა</button><button class="btn bad" data-op="pnlpay-stop" data-id="${p.id}" data-to="${D.now}">შეწყვეტა ამ თვის შემდეგ</button></div></div>`).join("") || `<div class="msg">ხელფასი ჯერ არავისთვის არ არის ჩაწერილი.</div>`}</div>
  ${old.length ? `<h2>ისტორია</h2><div class="card">${old.map(p => `<div class="crow"><span>${esc(p.name)} · ${terms(p)}</span><span class="note">${mname(p.from_month)} – ${mname(p.to_month)}</span><button class="link" data-op="pnlpay-del" data-id="${p.id}">წაშლა</button></div>`).join("")}</div>` : ""}`;
}
function pnlExp(D) {
  const k = KEEP["ef-k"] || "once", x = D.detail;
  return `<div class="split2"><form class="card" id="expf"><b>ხარჯის დამატება</b>
    <label for="ef-k">სახე<select id="ef-k" data-keep><option value="once" ${k === "once" ? "selected" : ""}>ერთჯერადი</option><option value="monthly" ${k === "monthly" ? "selected" : ""}>ყოველთვიური (მაგ. ქირა, ინტერნეტი)</option></select></label>
    <div class="g2">${k === "monthly" ? `<label for="ef-mm">რომელი თვიდან<input id="ef-mm" data-keep type="month" value="${kv("ef-mm", D.now)}"></label>` : `<label for="ef-d">თარიღი<input id="ef-d" data-keep type="date" value="${kv("ef-d", S.today)}"></label>`}
      <label for="ef-c">კატეგორია<select id="ef-c" data-keep>${D.cats.map(c => `<option ${c === (KEEP["ef-c"] || D.cats[0]) ? "selected" : ""}>${esc(c)}</option>`).join("")}</select></label>
      <label for="ef-a">თანხა, ₾${k === "monthly" ? " (თვეში)" : ""}<input id="ef-a" data-keep type="number" min="0" step="0.01" inputmode="decimal" value="${kv("ef-a")}" required></label>
      <label for="ef-n">შენიშვნა<input id="ef-n" data-keep value="${kv("ef-n")}" placeholder="მაგ. Facebook რეკლამა"></label></div>
    <div class="acts"><button class="btn" type="submit">დამატება</button></div></form>
  <div><div class="filters">${monthPick(D)}</div><div class="card">${x.expList.map(e => `<div class="crow"><span>${esc(e.category)}${e.note ? ` <small class="note">· ${esc(e.note)}</small>` : ""}<br><small class="note">${e.kind === "monthly" ? "ყოველთვიური" : esc(e.day)}</small></span><b>${fm(e.amount)}</b>${e.kind === "monthly" ? "<span></span>" : `<button class="link" data-op="pnlexp-del" data-id="${e.id}">წაშლა</button>`}</div>`).join("") || `<div class="note">${esc(mname(x.month))}: ხარჯი არ არის ჩაწერილი.</div>`}
    ${x.expList.length ? `<div class="crow"><b>სულ</b><b>${fm(x.other)}</b><span></span></div>` : ""}</div></div></div>
  <h2>ყოველთვიური ხარჯები</h2><div class="card">${D.monthly.map(e => { const on = !e.to_month || e.to_month >= D.now; return `<div class="crow"><span>${esc(e.category)}${e.note ? ` · ${esc(e.note)}` : ""}<br><small class="note">${mname(e.day)}-დან${e.to_month ? " " + mname(e.to_month) + "-მდე" : ""}</small></span><b>${fm(e.amount)}</b>${on ? `<button class="link" data-op="pnlexp-stop" data-id="${e.id}" data-to="${D.now}">შეწყვეტა</button>` : `<button class="link" data-op="pnlexp-del" data-id="${e.id}">წაშლა</button>`}</div>`; }).join("") || `<div class="note">ჯერ არ არის.</div>`}</div>`;
}

// ---------- ვიზიტორები (მხოლოდ ადმინი) ----------
let VS = { per: "7", from: "", to: "", d: null, loading: false };
const addD = (d, n) => new Date(Date.parse(d + "T12:00:00Z") + n * 864e5).toISOString().slice(0, 10);
const VP = [["today", "დღეს"], ["yest", "გუშინ"], ["7", "7 დღე"], ["30", "30 დღე"], ["month", "ეს თვე"], ["90", "90 დღე"]];
function vRange() {
  const t = S.today;
  if (VS.per === "today") return [t, t]; if (VS.per === "yest") return [addD(t, -1), addD(t, -1)];
  if (VS.per === "month") return [t.slice(0, 8) + "01", t]; if (VS.per === "custom") return [VS.from || addD(t, -6), VS.to || t];
  return [addD(t, -(+VS.per - 1)), t];
}
async function loadVisits() { VS.loading = true; const [f, t] = vRange(); try { VS.d = await api(`visits?from=${f}&to=${t}`); VS.fail = false; } catch (e) { VS.fail = true; say(e.message); } VS.loading = false; force = true; draw(); }
const secs = s => (s < 60 ? `${s} წმ` : `${Math.floor(s / 60)} წთ ${s % 60} წმ`);
const SRC = { direct: "პირდაპირ (ბმული, სანიშნე, მესენჯერი)" };
const LBL = { order_wa: "WhatsApp-ით შეკვეთა", order_copy: "შეკვეთის ტექსტის კოპირება", contact_wa: "WhatsApp (კონტაქტებიდან)", contact_phone: "ტელეფონზე დარეკვა", contact_mail: "მეილის მიწერა", contact_instagram: "Instagram", contact_facebook: "Facebook", contact_tiktok: "TikTok",
  gallery: "ფოტოების გადაფურცვლა", toy_card: "სათამაშოს ბარათი სიაში", toy_link: "სათამაშოს ბმული", logo: "ლოგო", back: "„უკან“", "lang:en": "ენა → ENG", "lang:ka": "ენა → ქარ" };
const ANC = { collection: "კოლექცია", story: "ჩვენი ისტორია", order: "როგორ შევუკვეთო", top: "ზემოთ" }, WHERE = { nav: "მენიუ", foot: "ქვედა მენიუ", btn: "ღილაკი", link: "ბმული" };
const lname = (l, d) => LBL[l] || (l.startsWith("cat:") ? "კატეგორია: " + (d.cats[l.slice(4)] || l.slice(4)) : /^(nav|foot|btn|link):/.test(l) ? `${WHERE[l.split(":")[0]]}: ${ANC[l.split(":")[1]] || l.split(":")[1]}` : l.startsWith("contact_") ? l.slice(8) : l);
const pname = (p, d) => { if (p === "/" ) return "მთავარი (ქარ)"; if (p === "/en") return "მთავარი (ENG)"; const m = /^\/(en\/)?toy\/(.+)$/.exec(p); return m ? (d.pnames[m[2]] || m[2]) + (m[1] ? " (ENG)" : "") : p; };
const meters = (list, d, name) => { const tot = list.reduce((a, x) => a + x.v, 0) || 1; return list.map(x => `<div class="meter"><span>${esc(name(x.k))}</span><span>${pc(x.v, tot)}% <small class="note">${x.v}</small></span><i><b style="width:${pc(x.v, tot)}%"></b></i></div>`).join("") || `<div class="note">—</div>`; };
function visits() {
  const d = VS.d, [f, t] = vRange();
  const head = `<div class="chips" role="group" aria-label="პერიოდი">${VP.map(([k, l]) => `<button type="button" data-vp="${k}" aria-pressed="${k === VS.per}">${l}</button>`).join("")}</div>
  <div class="filters"><label for="vs-from">დან<input id="vs-from" type="date" value="${esc(f)}"></label><label for="vs-to">მდე<input id="vs-to" type="date" value="${esc(t)}"></label>${d ? `<span class="live">ახლა საიტზეა: ${d.live}</span>` : ""}</div>`;
  if (!d) return head + `<div class="note">იტვირთება…</div>`;
  const o = d.tot, note = `<p class="hint">ვიზიტორი = ერთი შემოსვლა (ბრაუზერის ერთი ჩანართი). სახელი, IP და cookie არ ინახება. თანამშრომლების (სისტემაში შესულების) ვიზიტები არ ითვლება.${d.since ? ` სტატისტიკა იწერება ${+d.since.slice(8)} ${MON[+d.since.slice(5, 7) - 1]}-დან.` : ""}</p>`;
  if (!o.v) return head + `<div class="msg">ამ პერიოდში ვიზიტი ჯერ არ ჩაწერილა.</div>` + note;
  const vmax = Math.max(1, ...d.days.map(x => x.v)), all = [];
  for (let x = d.from; x <= d.to && all.length < 400; x = addD(x, 1)) all.push(d.days.find(y => y.day === x) || { day: x, v: 0, intent: 0 });
  const hmax = Math.max(1, ...d.hours.map(h => h.v)), hours = Array.from({ length: 24 }, (_, h) => d.hours.find(x => +x.k === h)?.v || 0);
  const fun = [["შემოვიდა საიტზე", o.v], ["ნახა სათამაშოს გვერდი", o.pview], ["დააჭირა შეკვეთის ღილაკს", o.orderc], ["დაგვიკავშირდა (შეკვეთა ან კონტაქტი)", o.intent]];
  return head + `<div class="tiles"><div class="tile"><span>ვიზიტორი</span><b>${o.v}</b><small>${o.pv} გვერდის ნახვა · ${pc(o.ret, o.v)}% დაბრუნებული</small></div>
    <div class="tile"><span>საშუალო დრო საიტზე</span><b>${secs(o.secs)}</b><small>ჩამოსქროლა საშ. ${o.depth}%</small></div>
    <div class="tile"><span>დაგვიკავშირდა</span><b>${o.intent}</b><small>${pc(o.intent, o.v)}% ვიზიტორებიდან</small></div>
    <div class="tile"><span>ტელეფონიდან</span><b>${pc(o.mob, o.v)}%</b><small>${o.mob} ვიზიტორი</small></div></div>
  <h2>ვიზიტორები დღეების მიხედვით</h2><div class="card"><div class="bars">${all.map((x, k) => `<div class="b" title="${esc(day(x.day))}: ${x.v} ვიზიტორი, ${x.intent} დაგვიკავშირდა"><em>${all.length <= 31 && x.v ? x.v : ""}</em><i style="height:${Math.max(2, Math.round((x.v / vmax) * 100))}%"></i><span>${all.length <= 31 || k % 7 === 0 ? +x.day.slice(8) : ""}</span></div>`).join("")}</div></div>
  <div class="split2"><div><h2>გზა შეკვეთამდე</h2><div class="card funnel">${fun.map(([l, n]) => `<div><span>${l}</span><i style="width:${Math.max(1, pc(n, o.v))}%"></i><b>${n} <small class="note">${pc(n, o.v)}%</small></b></div>`).join("")}
    <p class="hint" style="margin:6px 0 0">იმავე პერიოდში სისტემაში გაფორმდა <b>${d.orders}</b> შეკვეთა (ყველა არხიდან, მათ შორის Instagram-იდან და ზარით).</p></div></div>
    <div><h2>საიდან მოვიდნენ</h2><div class="tw"><table class="sm"><thead><tr><th>წყარო</th><th>ვიზიტორი</th><th>დაგვიკავშირდა</th></tr></thead><tbody>${d.srcs.map(s => `<tr><td>${esc(SRC[s.src] || s.src)}</td><td>${s.v} <small class="note">${pc(s.v, o.v)}%</small></td><td>${s.intent} <small class="note">${pc(s.intent, s.v)}%</small></td></tr>`).join("")}</tbody></table></div>
    ${d.camps.length ? `<h2>რეკლამის კამპანიები <small>utm_campaign</small></h2><div class="tw"><table class="sm"><thead><tr><th>კამპანია</th><th>ვიზიტორი</th><th>დაგვიკავშირდა</th></tr></thead><tbody>${d.camps.map(c => `<tr><td>${esc(c.camp)} <small class="note">${esc(c.src)}</small></td><td>${c.v}</td><td>${c.intent}</td></tr>`).join("")}</tbody></table></div>` : ""}</div></div>
  <h2>სათამაშოები</h2><div class="tw"><table><thead><tr><th>სათამაშო</th><th>გვერდის ნახვა</th><th>ვიზიტორი</th><th>სიიდან დააჭირა</th><th>ფოტოები გადაფურცლა</th><th>შეკვეთის ღილაკი</th><th>კონვერსია</th></tr></thead>
    <tbody>${d.prods.map(p => `<tr><td>${esc(p.name)}</td><td>${p.views}</td><td>${p.v}</td><td>${p.cards}</td><td>${p.gal}</td><td>${p.orderc}</td><td>${pc(p.orderc, p.v)}%</td></tr>`).join("") || `<tr><td colspan="7" class="note">ჯერ არაფერი.</td></tr>`}</tbody></table></div>
  <div class="split2"><div><h2>რას დააჭირეს</h2><div class="tw"><table class="sm"><thead><tr><th>ღილაკი / ბმული</th><th>დაჭერა</th><th>ვიზიტორი</th></tr></thead><tbody>${d.clicks.map(c => `<tr><td>${esc(lname(c.label, d))}</td><td>${c.c}</td><td>${c.v}</td></tr>`).join("") || `<tr><td colspan="3" class="note">ჯერ არაფერი.</td></tr>`}</tbody></table></div></div>
    <div><h2>გვერდები</h2><div class="tw"><table class="sm"><thead><tr><th>გვერდი</th><th>ნახვა</th><th>ვიზიტორი</th></tr></thead><tbody>${d.pages.map(p => `<tr><td>${esc(pname(p.path, d))}</td><td>${p.c}</td><td>${p.v}</td></tr>`).join("")}</tbody></table></div></div></div>
  <div class="g4" style="margin-top:8px"><div><h2>მოწყობილობა</h2><div class="card">${meters(d.dev, d, k => ({ mobile: "ტელეფონი", desktop: "კომპიუტერი", tablet: "პლანშეტი" }[k] || k))}</div></div>
    <div><h2>სისტემა</h2><div class="card">${meters(d.os, d, k => k)}</div></div>
    <div><h2>ენა</h2><div class="card">${meters(d.lang, d, k => ({ ka: "ქართული", en: "ინგლისური" }[k] || k))}</div></div>
    <div><h2>ახალი / დაბრუნებული</h2><div class="card">${meters([{ k: "ახალი", v: o.v - o.ret }, { k: "დაბრუნებული", v: o.ret }], d, k => k)}</div></div></div>
  <h2>რომელ საათზე შემოდიან <small>თბილისის დროით</small></h2><div class="card"><div class="bars">${hours.map((v, h) => `<div class="b" title="${h}:00 — ${v} ვიზიტორი"><i class="${v ? "" : "lite"}" style="height:${Math.max(2, Math.round((v / hmax) * 100))}%"></i><span>${h % 3 === 0 ? h : ""}</span></div>`).join("")}</div></div>` + note;
}

// ---------- მოქმედებები ----------
document.addEventListener("click", async e => {
  const t = e.target.closest("[data-tab]"), f = e.target.closest("[data-filter]"), b = e.target.closest("[data-op]"), rz = e.target.closest("[data-reason]"), pp = e.target.closest("[data-period]");
  if (rz) { reason[rz.dataset.reason] = rz.dataset.r; force = true; draw(); const d = document.querySelector(`[data-op=problem][data-id="${rz.dataset.reason}"]`); d && d.closest("details").setAttribute("open", ""); return; }
  if (t) { tab = t.dataset.tab; editId = null; q = ""; say(""); if (tab === "audit") AUD.rows = null; if (tab === "pnl") { PN.d = null; PN.fail = false; } if (tab === "visits") { VS.d = null; VS.fail = false; } force = true; draw(); try { S = await api("state"); force = true; draw(); } catch {} }
  if (f) { filter = f.dataset.filter; force = true; draw(); }
  if (pp) { period = pp.dataset.period; force = true; draw(); }
  const pv = e.target.closest("[data-pv]"), vp = e.target.closest("[data-vp]");
  if (pv) { PN.view = pv.dataset.pv; say(""); force = true; return draw(); }
  if (vp) { VS.per = vp.dataset.vp; VS.d = null; VS.fail = false; force = true; draw(); return; }
  if (!b) return;
  const a = b.dataset.op, id = b.dataset.id; force = true;
  if (a === "forgot") { authMode = "forgot"; say(""); return draw(); }
  if (a === "tologin") { authMode = ""; RESET = ""; history.replaceState(null, "", "/admin"); say(""); return draw(); }
  if (a === "pnlpay-edit") { const p = PN.d.pay.find(x => x.id == id); if (!p) return; Object.assign(KEEP, { "pf-u": p.user_id ? String(p.user_id) : "x", "pf-n": p.user_id ? "" : p.name, "pf-f": p.fixed, "pf-d": p.per_delivery, "pf-c": p.commission, "pf-m": PN.d.now }); draw(); $("#payf")?.scrollIntoView({ behavior: "smooth" }); return; }
  if (a === "pnlpay-stop") { if (!confirmOnce(b, "დააჭირე კიდევ ერთხელ")) return; return pnlAct(`pnl/pay/${id}/stop`, { to_month: b.dataset.to }, "ხელფასი შეწყდა (ისტორია რჩება)."); }
  if (a === "pnlpay-del") { if (!confirmOnce(b, "წაიშალოს?")) return; return pnlAct(`pnl/pay/${id}/delete`, {}, "წაიშალა."); }
  if (a === "pnlexp-del") { if (!confirmOnce(b, "წაიშალოს?")) return; return pnlAct(`pnl/expense/${id}/delete`, {}, "ხარჯი წაიშალა."); }
  if (a === "pnlexp-stop") { if (!confirmOnce(b, "დააჭირე კიდევ ერთხელ")) return; return pnlAct(`pnl/expense/${id}/stop`, { to_month: b.dataset.to }, "ყოველთვიური ხარჯი შეწყდა."); }
  if (a === "pnlmonth") { PN.view = "report"; return loadPnl(b.dataset.m); }
  if (a === "logout") { await api("logout", {}).catch(() => {}); S = null; F = null; say(""); return draw(); }
  if (a === "pw") { pw = !pw; return draw(); }
  if (a === "additem") { const p = S.products.find(p => p.left > 0) || S.products[0]; F.items.push({ product_id: p?.id || "", qty: 1, price: p?.price || 0 }); return draw(); }
  if (a === "rmitem") { F.items.splice(+b.dataset.k, 1); return draw(); }
  if (a === "assign") return act(`orders/${id}/assign`, { courier_id: $(`#c-${id}`).value }, "კურიერი დაინიშნა და წერილი გაეგზავნა.");
  if (a === "cancel") { if (!confirmOnce(b, "დააჭირე კიდევ ერთხელ გასაუქმებლად")) return; return act(`orders/${id}/cancel`, {}, "შეკვეთა გაუქმდა."); }
  if (a === "return") { if (!confirmOnce(b, "დააჭირე კიდევ ერთხელ")) return; return act(`orders/${id}/return`, {}, "მონიშნულია დაბრუნებულად."); }
  if (a === "deliver") return act(`orders/${id}/deliver`, {}, "ჩაბარებულია.");
  if (a === "edit") { const o = S.orders.find(x => x.id == id); if (!o) return; editId = o.id; F = { customer: o.customer, phone: o.phone, email: o.email, address: o.address, zone: o.zone, fee: o.fee, note: o.note, delivery_date: o.delivery_date, items: o.items.map(i => ({ product_id: i.product_id, qty: i.qty, price: i.price })) }; found = ""; tab = "edit"; scrollTo(0, 0); return draw(); }
  if (a === "editcancel") { editId = null; F = blank(); tab = "orders"; return draw(); }
  if (a === "hist") { if (hist[id]) { delete hist[id]; return draw(); } try { hist[id] = (await api(`orders/${id}/history`)).rows; } catch (x) { say(x.message); } force = true; return draw(); }
  if (a === "ofclear") { OF = { from: "", to: "", seller: "", courier: "" }; return draw(); }
  if (a === "pick") return act(`orders/${id}/pick`, {}, "მონიშნულია. მყიდველს წერილი გაეგზავნა.");
  if (a === "cdeliver") return act(`orders/${id}/deliver`, { note: $(`#n-${id}`)?.value || "" }, "ჩაბარებულია.");
  if (a === "problem") { const r = reason[id] || ""; const note = r === "სხვა" ? ($(`#n-${id}`)?.value || "") : r; delete reason[id]; return act(`orders/${id}/problem`, { note }); }
  if (a === "pgall") { const boxes = [...document.querySelectorAll(`[data-perm="${b.dataset.pre}"][data-g="${CSS.escape(b.dataset.g)}"]`)].filter(c => !c.disabled), on = boxes.every(c => c.checked); boxes.forEach(c => (c.checked = !on)); b.textContent = on ? "ყველა" : "მოხსნა"; return; }
  if (a === "usetpl") { const list = TEMPLATES[b.dataset.t][1]; document.querySelectorAll(`[data-perm="${id}"]`).forEach(c => { if (!c.disabled) c.checked = list.includes(c.value); }); $(`#ue-t-${id}`).value = TEMPLATES[b.dataset.t][0]; return; }
  if (a === "toggleuser") { editUser = +id; if (b.dataset.on === "0" && !confirmOnce(b, "დააჭირე კიდევ ერთხელ გასათიშად")) return; return act(`users/${id}`, { active: b.dataset.on === "1" }, b.dataset.on === "1" ? "ჩაირთო." : "გაითიშა. სისტემაში ვეღარ შევა."); }
  if (a === "saveperms") { editUser = +id; return act(`users/${id}`, { perms: pickedPerms(id), title: $(`#ue-t-${id}`).value }, "უფლებები შეინახა. თანამშრომელი მაშინვე მხოლოდ ამას დაინახავს."); }
  if (a === "saveinfo") { editUser = +id; return act(`users/${id}`, { name: $(`#ue-n-${id}`).value, email: $(`#ue-e-${id}`).value, title: $(`#ue-t-${id}`).value }, "შეინახა."); }
  if (a === "resetpw") { editUser = +id; return act(`users/${id}`, { password: $(`#np-${id}`).value }, "პაროლი შეიცვალა. ძველი შესვლები გაუქმდა."); }
  if (a === "logoutall") { editUser = +id; if (!confirmOnce(b, "დააჭირე კიდევ ერთხელ")) return; return act(`users/${id}`, { logoutAll: true }, "ყველა მოწყობილობიდან გამოვიდა."); }
  if (a === "retry") return act(`emails/${id}/retry`);
});
// საშიში ღილაკი: პირველი დაჭერა მხოლოდ გაფრთხილებაა
function confirmOnce(b, text) { if (b.dataset.sure === "1") return true; b.dataset.sure = "1"; b.dataset.was = b.textContent; b.textContent = text; setTimeout(() => { if (b.isConnected) { b.dataset.sure = ""; b.textContent = b.dataset.was; } }, 4000); return false; }

let lookupT = null, audT = null;
app.addEventListener("input", e => { const el = e.target;
  if (el.dataset.keep !== undefined) { KEEP[el.id] = el.value; if (el.dataset.cost) costRow(el.dataset.cost); return; }
  if (el.id === "q") { q = el.value; pending = true; clearTimeout(lookupT); lookupT = setTimeout(() => { const pos = el.selectionStart; force = true; draw(); const n = $("#q"); if (n) { n.focus(); n.setSelectionRange(pos, pos); } }, 250); return; }
  if (el.id === "au-q") { AUD.q = el.value; clearTimeout(audT); audT = setTimeout(async () => { const pos = el.selectionStart; await loadAudit(); const n = $("#au-q"); if (n) { n.focus(); n.setSelectionRange(pos, pos); } }, 350); return; }
  if (!F || !el.closest("#f")) return;
  if (el.dataset.f === "phone" && tab !== "edit") { clearTimeout(lookupT); lookupT = setTimeout(async () => { const digits = el.value.replace(/\D/g, ""); if (digits.length < 6) return;
    try { const c = await api("customer?phone=" + encodeURIComponent(el.value)); if (c.customer && F.phone === el.value) { if (!F.customer) F.customer = c.customer; if (!F.address) F.address = c.address || ""; if (!F.email) F.email = c.email || ""; if (c.zone && ZONE[c.zone]) { F.zone = c.zone; F.fee = ZONE[c.zone][1]; } found = "ნაცნობი მყიდველი: " + c.customer; force = true; draw(); } } catch {} }, 400); }
  if (el.dataset.f) F[el.dataset.f] = el.type === "number" ? +el.value || 0 : el.value;
  if (el.dataset.fi && el.dataset.k !== "product_id") F.items[+el.dataset.fi][el.dataset.k] = +el.value || 0;
  if ($("#f-total")) $("#f-total").textContent = gel(F.items.reduce((a, i) => a + i.qty * i.price, 0) + (+F.fee || 0)); });
app.addEventListener("change", e => { const el = e.target;
  if (el.id === "pn-m") { PN.d = null; PN.m = el.value; loadPnl(el.value); return; }
  if (el.id === "pf-u" || el.id === "ef-k") { KEEP[el.id] = el.value; force = true; draw(); return; }
  if (el.dataset.keep !== undefined) { KEEP[el.id] = el.value; return; }
  if (el.id === "vs-from" || el.id === "vs-to") { VS[el.id === "vs-from" ? "from" : "to"] = el.value; VS.per = "custom"; VS.d = null; VS.fail = false; force = true; draw(); return; }
  if (el.id === "u-tpl") { newTpl = el.value; force = true; draw(); return; }
  if (el.dataset.of !== undefined) { OF[el.dataset.of] = el.value; force = true; draw(); return; }
  if (el.id === "au-u") { AUD.user = el.value; loadAudit(); return; }
  if (F && el.dataset.f === "zone") { F.fee = ZONE[F.zone][1]; force = true; draw(); }
  if (F && el.dataset.fi && el.dataset.k === "product_id") { F.items[+el.dataset.fi].product_id = el.value; F.items[+el.dataset.fi].price = S.products.find(p => p.id == el.value)?.price || 0; force = true; draw(); } });
app.addEventListener("submit", async e => { e.preventDefault(); const id = e.target.id;
  if (id === "login") { try { S = await api("login", { email: $("#l-email").value, password: $("#l-pass").value }); say(""); force = true; draw(); } catch (x) { say(x.message); } }
  if (id === "f") {
    if (tab === "edit") { if (await act(`orders/${editId}/edit`, F, `შეკვეთა № ${editId} შესწორდა.`)) { delete hist[editId]; editId = null; F = blank(); tab = "orders"; force = true; draw(); } }
    else if (await act("orders", F, "შეკვეთა გაფორმდა. წერილები იგზავნება.")) { F = blank(); found = ""; tab = "orders"; filter = "open"; force = true; draw(); } }
  if (id === "uf") { if (await act("users", { name: $("#u-name").value, email: $("#u-email").value, template: newTpl, title: $("#u-title").value, password: $("#u-pass").value, perms: pickedPerms("new") }, "თანამშრომელი დაემატა. მეილზე მიუვა ბმული საკუთარი პაროლის დასაყენებლად (ან მიეცი დროებითი პაროლი).")) { newTpl = "sales"; force = true; draw(); } }
  if (id === "rcv") { const items = [...document.querySelectorAll("[data-rc]")].map(i => ({ id: i.dataset.rc, qty: +i.value || 0 })).filter(i => i.qty > 0); act("stock/receive", { items, note: $("#rc-note").value }, "პარტია მიღებულია, მარაგი განახლდა."); }
  if (id === "adj") act("stock/adjust", { id: $("#aj-p").value, qty: +$("#aj-q").value, note: $("#aj-n").value }, "კორექცია ჩაიწერა.");
  if (id === "pwf") { try { await api("password", { old: $("#p-old").value, new: $("#p-new").value }); pw = false; say("პაროლი შეიცვალა. სხვა მოწყობილობებიდან გამოხვედი; მეილზე შეტყობინება მოგივა.", true); force = true; draw(); } catch (x) { say(x.message); } }
  if (id === "fg") { try { await api("forgot", { email: $("#fg-email").value }); authMode = ""; say("თუ ეს მეილი სისტემაშია, ბმული გაიგზავნა. შეამოწმე ფოსტა (Spam-იც).", true); force = true; draw(); } catch (x) { say(x.message); } }
  if (id === "rs") { if ($("#rs-1").value !== $("#rs-2").value) return say("პაროლები ერთმანეთს არ ემთხვევა.");
    try { S = await api("reset", { token: RESET, password: $("#rs-1").value }); RESET = ""; history.replaceState(null, "", "/admin"); say("ახალი პაროლი დაყენდა. შესული ხარ.", true); force = true; draw(); } catch (x) { say(x.message); } }
  if (id === "costf") { const items = PN.d.products.map(p => ({ id: p.id, buy: KEEP["c-buy-" + p.id] ?? p.buy, ship: KEEP["c-ship-" + p.id] ?? p.ship, pack: KEEP["c-pack-" + p.id] ?? p.pack }));
    if (await pnlAct("pnl/costs", { items }, "თვითღირებულება შეინახა.")) Object.keys(KEEP).filter(k => k.startsWith("c-")).forEach(k => delete KEEP[k]); }
  if (id === "payf") { const u = KEEP["pf-u"] || "";
    if (await pnlAct("pnl/pay", { user_id: u && u !== "x" ? u : null, name: KEEP["pf-n"] || "", fixed: KEEP["pf-f"] || 0, per_delivery: KEEP["pf-d"] || 0, commission: KEEP["pf-c"] || 0, from_month: KEEP["pf-m"] || PN.d.now }, "ხელფასის პირობა შეინახა.")) Object.keys(KEEP).filter(k => k.startsWith("pf-")).forEach(k => delete KEEP[k]); }
  if (id === "expf") { const k = KEEP["ef-k"] || "once";
    if (await pnlAct("pnl/expense", { kind: k, day: k === "monthly" ? (KEEP["ef-mm"] || PN.d.now) : (KEEP["ef-d"] || S.today), category: KEEP["ef-c"] || PN.d.cats[0], amount: KEEP["ef-a"] || 0, note: KEEP["ef-n"] || "" }, "ხარჯი დაემატა.")) ["ef-a", "ef-n"].forEach(k => delete KEEP[k]); } });

(async () => { if (!RESET) { try { S = await api("state"); } catch { S = null; } } draw();
  setInterval(async () => { if (!S || busy || document.hidden || tab === "edit") return; try { S = await api("state"); draw(); } catch {} }, 20000); })();
