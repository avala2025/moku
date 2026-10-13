"use strict";
const $ = s => document.querySelector(s), app = $("#app");
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const gel = n => (Math.round(n) || 0) + " ₾";
const two = n => String(n).padStart(2, "0");
const when = s => { const x = new Date(s); return isNaN(x) ? "" : `${two(x.getDate())}.${two(x.getMonth() + 1)} ${two(x.getHours())}:${two(x.getMinutes())}`; };
const MON = ["იანვარი", "თებერვალი", "მარტი", "აპრილი", "მაისი", "ივნისი", "ივლისი", "აგვისტო", "სექტემბერი", "ოქტომბერი", "ნოემბერი", "დეკემბერი"], WD = ["კვირა", "ორშაბათი", "სამშაბათი", "ოთხშაბათი", "ხუთშაბათი", "პარასკევი", "შაბათი"];
const day = d => { const x = new Date(d + "T12:00:00"); return isNaN(x) ? d : `${WD[x.getDay()]}, ${x.getDate()} ${MON[x.getMonth()]}`; };
const ST = { new: "კურიერი არ არის დანიშნული", assigned: "გაფორმებული", picked: "კურიერმა აიღო", problem: "ვერ ჩაბარდა", delivered: "ჩაბარებული", returned: "დაბრუნდა", cancelled: "გაუქმდა" };
const ROLE = { admin: "ადმინი", sales: "გაყიდვები", courier: "კურიერი" };
const ZONE = { tbilisi: ["თბილისი", 7], region: ["რეგიონი", 15], pickup: ["თვითგატანა", 0] };
const KIND = { order_created: "მყიდველს: შეკვეთა გაფორმდა", courier_assigned: "კურიერს: წასაღები შეკვეთა", picked: "მყიდველს: კურიერმა აიღო" };
const MST = { sent: "გაიგზავნა", failed: "ვერ გაიგზავნა", skipped: "გამოტოვებულია", sending: "იგზავნება" };
const TABS = { admin: [["home", "მთავარი"], ["orders", "შეკვეთები"], ["neworder", "ახალი შეკვეთა"], ["couriers", "კურიერები"], ["stock", "მარაგი"], ["users", "თანამშრომლები"], ["emails", "მეილები"]],
  sales: [["neworder", "ახალი შეკვეთა"], ["orders", "ჩემი შეკვეთები"], ["stock", "მარაგი"]], courier: [] };
let S = null, tab = "", filter = "open", F = null, busy = false, pending = false, force = false, pw = false, q = "", found = "", reason = {};
const img = n => n ? (String(n).startsWith("u-") ? `${S.imgBase}/${n}-480.webp` : `/img/${n}-480.webp`) : "";
const PH = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3"><path d="M3 2h3l1.5 3.5L6 7a9 9 0 0 0 3 3l1.5-1.5L14 10v3a1 1 0 0 1-1 1A11 11 0 0 1 2 3a1 1 0 0 1 1-1Z"/></svg>';
const MAP = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3"><path d="M8 14s4.5-4 4.5-7.5a4.5 4.5 0 0 0-9 0C3.5 10 8 14 8 14Z"/><circle cx="8" cy="6.5" r="1.5"/></svg>';
const REASONS = ["არ პასუხობს", "არასწორი მისამართი", "უარი თქვა", "სხვა"];
const sumOf = list => list.reduce((a, o) => a + total(o), 0);
const matches = o => !q || [o.customer, o.phone, o.address, String(o.id), ...o.items.map(i => i.name)].join(" ").toLowerCase().includes(q.toLowerCase());
const say = (m, ok) => { const e = $("#err"); e.textContent = m || ""; e.classList.toggle("ok", !!ok); };
const total = o => o.items.reduce((a, i) => a + i.qty * i.price, 0) + o.fee;

async function api(path, data) {
  const r = await fetch("/api/" + path, { method: data ? "POST" : "GET", headers: data ? { "Content-Type": "application/json", "X-Moku": "1" } : {}, body: data ? JSON.stringify(data) : undefined, credentials: "same-origin" });
  const j = await r.json().catch(() => ({}));
  if (r.status === 401 && path !== "login") { S = null; draw(); }
  if (!r.ok) throw new Error(j.error || "ვერ შესრულდა. სცადეთ ხელახლა.");
  return j;
}
async function act(path, data, okMsg) {
  if (busy) return; busy = true; say("");
  try { const j = await api(path, data || {}); if (j.me) S = j; say(okMsg || "", true); force = true; draw(); return true; }
  catch (e) { say(e.message); return false; } finally { busy = false; }
}
const blank = () => { const p = S.products.find(p => p.left > 0) || S.products[0]; return { customer: "", phone: "", email: "", address: "", zone: "tbilisi", fee: 7, note: "", delivery_date: S.tomorrow, courier_id: S.couriers[0]?.id || "", items: [{ product_id: p?.id || "", qty: 1, price: p?.price || 0 }] }; };

function draw() {
  const a = document.activeElement;
  if (S && a && app.contains(a) && /INPUT|TEXTAREA|SELECT/.test(a.tagName) && !force) { pending = true; return; }
  force = false; pending = false;
  if (!S) { $("#tabs").hidden = $("#me").hidden = true; app.innerHTML = login(); return; }
  const role = S.me.role, tabs = TABS[role];
  if (!tabs.some(t => t[0] === tab)) tab = tabs[0]?.[0] || "";
  $("#me").hidden = false;
  $("#me").innerHTML = `<span>${esc(S.me.name)} · ${ROLE[role]}</span>${role === "admin" ? `<a class="link" href="/">საიტი</a>` : ""}<button class="link" data-op="pw">პაროლის შეცვლა</button><button class="link" data-op="logout">გასვლა</button>`;
  $("#tabs").hidden = !tabs.length;
  $("#tabs").innerHTML = tabs.map(([k, l]) => `<button type="button" data-tab="${k}" aria-pressed="${k === tab}">${l}</button>`).join("");
  if (!F && role !== "courier") F = blank();
  app.innerHTML = (pw ? pwForm() : "") + (role === "courier" ? courier() : tab === "home" ? home() : tab === "orders" ? orders() : tab === "neworder" ? newOrder() : tab === "couriers" ? couriersTab() : tab === "stock" ? (role === "admin" ? stockAdmin() : stockView()) : tab === "users" ? users() : emails());
}
app.addEventListener("focusout", () => setTimeout(() => { if (pending) draw(); }, 0));

const login = () => `<form class="login card" id="login"><h1>შესვლა</h1>
  <label for="l-email">მეილი<input id="l-email" type="email" autocomplete="username" required></label>
  <label for="l-pass">პაროლი<input id="l-pass" type="password" autocomplete="current-password" required></label>
  <button class="btn big" type="submit">შესვლა</button></form>`;
const pwForm = () => `<form class="card" id="pwf" style="margin-bottom:16px"><div class="g2">
  <label for="p-old">ძველი პაროლი<input id="p-old" type="password" autocomplete="current-password" required></label>
  <label for="p-new">ახალი პაროლი (მინ. 8 სიმბოლო)<input id="p-new" type="password" autocomplete="new-password" minlength="8" required></label></div>
  <div class="acts"><button class="btn" type="submit">შენახვა</button><button class="btn ghost" type="button" data-op="pw">დახურვა</button></div></form>`;

function card(o) {
  const admin = S.me.role === "admin", s = o.status, cs = `<select id="c-${o.id}" aria-label="კურიერი">${S.couriers.map(c => `<option value="${c.id}" ${c.id === o.courier_id ? "selected" : ""}>${esc(c.name)}</option>`).join("")}</select>`;
  const canAssign = ["new", "assigned", "problem"].includes(s) && S.couriers.length;
  return `<div class="card strip s-${s}"><div class="top"><b>№ ${o.id}</b><span class="pill ${s}">${ST[s]}</span><time>${when(o.created)}</time>${admin ? `<small>გააფორმა: ${esc(o.seller)}</small>` : ""}</div>
    <div class="who"><span>${esc(o.customer)} · ${esc(o.phone)}${o.email ? " · " + esc(o.email) : ""}</span><span>${esc(ZONE[o.zone]?.[0] || "")}${o.address ? ", " + esc(o.address) : ""}</span>
    <span>მიტანის დღე: ${esc(day(o.delivery_date))}${o.courier ? " · კურიერი: " + esc(o.courier) : ""}</span></div>
    <ul class="items">${o.items.map(i => `<li><span>${esc(i.name)} × ${i.qty}</span><span>${gel(i.qty * i.price)}</span></li>`).join("")}<li><span>მიწოდება</span><span>${gel(o.fee)}</span></li></ul>
    <div class="sum"><span>სულ</span><span>${gel(total(o))}</span></div>
    ${o.note ? `<div class="note">შენიშვნა: ${esc(o.note)}</div>` : ""}${o.courier_note ? `<div class="note">კურიერი: ${esc(o.courier_note)}</div>` : ""}
    <div class="acts">${canAssign ? `${cs}<button class="btn ghost" data-op="assign" data-id="${o.id}">${s === "new" ? "კურიერის დანიშვნა" : "კურიერის შეცვლა"}</button>` : ""}
      ${admin && ["new", "assigned", "picked", "problem"].includes(s) ? `<button class="btn ghost" data-op="deliver" data-id="${o.id}">ჩაბარებულია</button>` : ""}
      ${admin && ["picked", "problem", "delivered"].includes(s) ? `<button class="btn bad" data-op="return" data-id="${o.id}">დაბრუნდა</button>` : ""}
      ${["new", "assigned", "problem"].includes(s) ? `<button class="btn bad" data-op="cancel" data-id="${o.id}">გაუქმება</button>` : ""}</div></div>`;
}
const OPEN = ["new", "assigned", "picked", "problem"];
function home() {
  const n = s => S.orders.filter(o => o.status === s).length, sum = s => sumOf(S.orders.filter(o => o.status === s));
  const units = S.products.reduce((a, p) => a + Math.max(0, p.left), 0), sold = S.products.reduce((a, p) => a + p.sold, 0), rev = S.products.reduce((a, p) => a + p.revenue, 0);
  const low = S.products.filter(p => !p.hidden && p.left <= 2 && (p.stock_in > 0 || p.sold > 0 || p.reserved > 0 || p.onway > 0)), open = S.orders.filter(o => OPEN.includes(o.status));
  const live = o => !["cancelled", "returned"].includes(o.status);
  const today = S.orders.filter(o => live(o) && String(o.created).slice(0, 10) === S.today), month = S.orders.filter(o => live(o) && String(o.created).slice(0, 7) === S.today.slice(0, 7));
  const delivered = month.filter(o => o.status === "delivered");
  return `${S.mailReady ? "" : `<div class="msg" style="margin-bottom:14px">მეილის სერვისი ჯერ არ არის დაყენებული, ამიტომ წერილები არ იგზავნება. ისინი ჩანს „მეილები“ განყოფილებაში, როგორც გაუგზავნელი.</div>`}
  <div class="tiles"><div class="tile"><span>დღეს</span><b>${today.length}</b><small>შეკვეთა · ${gel(sumOf(today))}</small></div>
    <div class="tile"><span>ამ თვეში</span><b>${month.length}</b><small>შეკვეთა · ${gel(sumOf(month))} · ჩაბარდა ${delivered.length}</small></div>
    <div class="tile"><span>ჯერ კურიერს არ აუღია</span><b>${n("new") + n("assigned")}</b><small>შეკვეთა</small></div>
    <div class="tile"><span>კურიერთანაა</span><b>${n("picked") + n("problem")}</b><small>ასაღები ${gel(sum("picked") + sum("problem"))}</small></div></div>
  ${low.length ? `<h2>მარაგი იწურება</h2><div class="card">${low.map(p => `<div class="crow"><span>${esc(p.name)}</span><span class="pill ${p.left <= 0 ? "problem" : "new"}">${p.left <= 0 ? "გათავდა" : "დარჩა " + p.left}</span><span></span></div>`).join("")}</div>` : ""}
  <h2>გაყიდულია, მაგრამ ჯერ არ ჩაბარებულა <small>${open.length} · ${gel(sumOf(open))}</small></h2><div class="list">${open.map(card).join("") || `<div class="msg">ყველაფერი ჩაბარებულია.</div>`}</div>
  <h2>სულ</h2><div class="tiles"><div class="tile"><span>მარაგში დარჩა</span><b>${units}</b><small>ცალი, ${S.products.length} სახეობა</small></div><div class="tile"><span>გაიყიდა და ჩაბარდა</span><b>${sold}</b><small>ცალი · ${gel(rev)}</small></div></div>`;
}
function orders() {
  const groups = { open: o => OPEN.includes(o.status), delivered: o => o.status === "delivered", closed: o => ["returned", "cancelled"].includes(o.status) }, list = S.orders.filter(groups[filter]);
  const shown = list.filter(matches);
  return `<div class="search"><input id="q" type="search" placeholder="ძებნა: სახელი, ტელეფონი, მისამართი, №" value="${esc(q)}" aria-label="ძებნა">${S.me.role === "admin" ? `<a class="btn ghost" href="/api/orders.csv">Excel</a>` : ""}</div>
  <div class="chips" role="group" aria-label="სტატუსი">${[["open", "მიმდინარე"], ["delivered", "ჩაბარებული"], ["closed", "დაბრუნებული / გაუქმებული"]].map(([k, l]) => `<button type="button" data-filter="${k}" aria-pressed="${k === filter}">${l} · ${S.orders.filter(groups[k]).length}</button>`).join("")}</div>
  <div class="list">${shown.map(card).join("") || `<div class="msg">${q ? "ვერაფერი მოიძებნა." : "აქ შეკვეთა არ არის."}</div>`}</div>`;
}
const stockList = () => `<ul class="stocklist">${S.products.filter(p => !p.hidden).map(p => `<li>${p.img ? `<img src="${img(p.img)}" alt="">` : "<span></span>"}<span>${esc(p.name)}<br><small class="note">${gel(p.price)}</small></span><span class="${p.left <= 2 ? "low" : ""}">${p.left} ც.</span></li>`).join("")}</ul>`;
const stockView = () => `<p class="hint">რამდენი ცალია ახლა თავისუფალი გასაყიდად.</p><div class="card">${stockList()}</div>`;
function newOrder() {
  const sum = F.items.reduce((a, i) => a + (+i.qty || 0) * (+i.price || 0), 0) + (+F.fee || 0);
  const mine = S.orders.filter(o => String(o.created).slice(0, 10) === S.today && !["cancelled", "returned"].includes(o.status));
  return `<div class="daybar"><span>დღეს გაფორმებული: <b>${mine.length}</b> შეკვეთა</span><span>სულ <b>${gel(sumOf(mine))}</b></span></div>
  <div class="split" style="margin-top:12px"><form class="card" id="f" autocomplete="off" style="gap:12px"><div class="g2">
    <label for="f-phone">ტელეფონი (თუ ადრე შეუკვეთავს, დანარჩენი თავად შეივსება)<input id="f-phone" data-f="phone" value="${esc(F.phone)}" inputmode="tel" required>${found ? `<span class="found">${esc(found)}</span>` : ""}</label>
    <label for="f-customer">მყიდველის სახელი<input id="f-customer" data-f="customer" value="${esc(F.customer)}" required></label>
    <label for="f-email">მყიდველის მეილი (წერილებისთვის)<input id="f-email" data-f="email" type="email" value="${esc(F.email)}"></label>
    <label for="f-date">მიტანის დღე<input id="f-date" data-f="delivery_date" type="date" value="${esc(F.delivery_date)}" required></label>
    <label for="f-zone">მიწოდება<select id="f-zone" data-f="zone">${Object.entries(ZONE).map(([k, v]) => `<option value="${k}" ${k === F.zone ? "selected" : ""}>${v[0]} · ${v[1]} ₾</option>`).join("")}</select></label>
    <label for="f-fee">მიწოდების ფასი, ₾<input id="f-fee" data-f="fee" type="number" min="0" value="${esc(F.fee)}"></label></div>
    <label for="f-address">მისამართი<input id="f-address" data-f="address" value="${esc(F.address)}"></label>
    ${F.items.map((it, k) => `<div class="irow"><span class="th">${(S.products.find(p => p.id == it.product_id) || {}).img ? `<img src="${img(S.products.find(p => p.id == it.product_id).img)}" alt="">` : ""}</span>
      <label for="f-p${k}">სათამაშო<select id="f-p${k}" data-fi="${k}" data-k="product_id">${S.products.map(p => `<option value="${p.id}" ${p.id == it.product_id ? "selected" : ""} ${p.left <= 0 ? "disabled" : ""}>${esc(p.name)} · ${p.price} ₾ · დარჩა ${p.left}</option>`).join("")}</select></label>
      <label for="f-q${k}">ცალი<input id="f-q${k}" data-fi="${k}" data-k="qty" type="number" min="1" value="${esc(it.qty)}"></label>
      <label for="f-r${k}">ფასი, ₾<input id="f-r${k}" data-fi="${k}" data-k="price" type="number" min="0" value="${esc(it.price)}"></label>
      <button type="button" data-op="rmitem" data-k="${k}" aria-label="სტრიქონის წაშლა" ${F.items.length > 1 ? "" : "disabled"}>×</button></div>`).join("")}
    <div class="acts"><button type="button" class="btn ghost" data-op="additem">+ კიდევ ერთი სათამაშო</button></div>
    <label for="f-courier">კურიერი<select id="f-courier" data-f="courier_id"><option value="">ჯერ არ დავნიშნო</option>${S.couriers.map(c => `<option value="${c.id}" ${c.id == F.courier_id ? "selected" : ""}>${esc(c.name)}</option>`).join("")}</select></label>
    <label for="f-note">შენიშვნა<textarea id="f-note" data-f="note" rows="2">${esc(F.note)}</textarea></label>
    <div class="sum"><span>სულ გადასახდელი</span><span id="f-total">${gel(sum)}</span></div>
    <p class="hint" style="margin:0">შენახვისას მყიდველს და კურიერს წერილი ავტომატურად გაეგზავნება.</p>
    <div class="acts"><button class="btn big" type="submit">შეკვეთის გაფორმება</button></div></form>
    <div class="card"><b>მარაგი ახლა</b>${stockList()}</div></div>`;
}
function stockAdmin() {
  const t = k => S.products.reduce((a, p) => a + p[k], 0);
  return `<p class="hint">„მიღებული“ არის სულ რამდენი ცალი შემოვიდა საწყობში. დარჩენილს სისტემა თავად ითვლის. დაბრუნებული და გაუქმებული შეკვეთები მარაგს უბრუნდება.</p>
  <div class="tw"><table><thead><tr><th>სათამაშო</th><th>ფასი, ₾</th><th>მიღებული (ჩაწერე)</th><th>გაფორმებული</th><th>კურიერთან</th><th>ჩაბარებული</th><th>დარჩა</th><th>შემოსავალი</th></tr></thead>
  <tbody>${S.products.map(p => `<tr><td>${esc(p.name)}${p.hidden ? ` <small class="note">(საიტზე დამალულია)</small>` : ""}</td>
    <td>${p.price}</td>
    <td><input id="s-i-${p.id}" data-s="${p.id}" data-k="stock_in" type="number" min="0" value="${p.stock_in}" aria-label="მიღებული"></td>
    <td>${p.reserved}</td><td>${p.onway}</td><td>${p.sold}</td><td class="${p.left <= 2 ? "low" : ""}">${p.left}</td><td>${gel(p.revenue)}</td></tr>`).join("")}</tbody>
  <tfoot><tr><td>სულ</td><td></td><td>${t("stock_in")}</td><td>${t("reserved")}</td><td>${t("onway")}</td><td>${t("sold")}</td><td>${t("left")}</td><td>${gel(t("revenue"))}</td></tr></tfoot></table></div>
  <p class="hint" style="margin-top:12px">სათამაშოს სახელი, ფასი და ფასდაკლება იცვლება საიტზე, „ადმინი“ ღილაკიდან. <a href="/">საიტზე გადასვლა</a></p>`;
}
function couriersTab() {
  const days = [[S.today, "დღეს"], [S.tomorrow, "ხვალ"]];
  return days.map(([d, l]) => `<h2>${l} <small>${esc(day(d))}</small></h2><div class="list">${S.couriers.map(c => {
    const mine = S.orders.filter(o => o.courier_id === c.id && o.delivery_date === d && ["assigned", "picked", "problem", "delivered"].includes(o.status));
    const todo = mine.filter(o => o.status !== "delivered");
    return `<div class="card"><div class="top"><b>${esc(c.name)}</b><span class="pill">${mine.length} შეკვეთა</span><small>ასაღები ${gel(sumOf(todo))}${mine.length - todo.length ? ` · ჩაბარდა ${mine.length - todo.length}` : ""}</small></div>
      ${mine.map(o => `<div class="crow"><span>№ ${o.id} · ${esc(o.customer)} · ${esc(ZONE[o.zone]?.[0] || "")}${o.address ? ", " + esc(o.address) : ""}</span><span class="pill ${o.status}">${ST[o.status]}</span><span>${gel(total(o))}</span></div>`).join("") || `<div class="note">შეკვეთა არ არის.</div>`}</div>`;
  }).join("") || `<div class="msg">კურიერი ჯერ არ დაგიმატებია.</div>`}</div>`).join("") +
  (S.orders.some(o => o.status === "new") ? `<h2>კურიერის გარეშე <small>${S.orders.filter(o => o.status === "new").length}</small></h2><div class="list">${S.orders.filter(o => o.status === "new").map(card).join("")}</div>` : "");
}
function users() {
  return `<form class="card" id="uf" autocomplete="off"><b>ახალი თანამშრომელი</b><div class="g2">
    <label for="u-name">სახელი<input id="u-name" required></label><label for="u-email">მეილი (ამით შევა სისტემაში)<input id="u-email" type="email" required></label>
    <label for="u-role">როლი<select id="u-role"><option value="sales">გაყიდვები</option><option value="courier">კურიერი</option><option value="admin">ადმინი</option></select></label>
    <label for="u-pass">დროებითი პაროლი (მინ. 8 სიმბოლო)<input id="u-pass" minlength="8" required></label></div>
    <div class="acts"><button class="btn" type="submit">დამატება</button></div></form>
  <h2>თანამშრომლები</h2><div class="list">${S.users.map(u => `<div class="card"><div class="top"><b>${esc(u.name)}</b><span class="pill ${u.active ? "picked" : "cancelled"}">${ROLE[u.role]}${u.active ? "" : " · გათიშულია"}</span><small>${esc(u.email)}</small></div>
    <div class="acts"><input id="np-${u.id}" placeholder="ახალი პაროლი" aria-label="ახალი პაროლი" style="max-width:200px"><button class="btn ghost" data-op="resetpw" data-id="${u.id}">პაროლის შეცვლა</button>
    ${u.id === S.me.id ? "" : `<button class="btn ${u.active ? "bad" : "ghost"}" data-op="toggleuser" data-id="${u.id}" data-on="${u.active ? 0 : 1}">${u.active ? "გათიშვა" : "ჩართვა"}</button>`}</div></div>`).join("")}</div>`;
}
const emails = () => `${S.mailReady ? "" : `<div class="msg" style="margin-bottom:14px">მეილის სერვისი ჯერ არ არის დაყენებული. სერვერზე გადატანისას ჩაირთვება.</div>`}
  <div class="list">${S.emails.map(e => `<div class="card"><div class="top"><b>№ ${e.order_id}</b><span class="pill ${e.status}">${MST[e.status] || e.status}</span><time>${when(e.created)}</time></div>
    <div class="who"><span>${esc(KIND[e.kind] || e.kind)}</span><span>${esc(e.to_addr || "მისამართის გარეშე")}</span></div>${e.error ? `<div class="note">${esc(e.error)}</div>` : ""}
    ${e.status === "failed" ? `<div class="acts"><button class="btn ghost" data-op="retry" data-id="${e.id}">ხელახლა გაგზავნა</button></div>` : ""}</div>`).join("") || `<div class="msg">წერილები ჯერ არ გაგზავნილა.</div>`}</div>`;

function courier() {
  const todo = S.orders.filter(o => o.status !== "delivered"), done = S.orders.filter(o => o.status === "delivered");
  const c = o => `<div class="card strip s-${o.status}"><div class="top"><b>№ ${o.id}</b><span class="pill ${o.status}">${o.status === "assigned" ? "წასაღებია" : o.status === "picked" ? "აღებული მაქვს" : ST[o.status]}</span></div>
    <div class="who"><span><b>${esc(o.customer)}</b></span><span>${esc(ZONE[o.zone]?.[0] || "")}${o.address ? ", " + esc(o.address) : ""}</span></div>
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
  ${Object.keys(byDay).sort().map(d => `<h2>${label(d)} <small>${byDay[d].length} · ${esc(day(d))}</small></h2><div class="list">${byDay[d].map(c).join("")}</div>`).join("") || `<h2>ჩემი შეკვეთები</h2><div class="msg">ახლა წასაღები არაფერია.</div>`}
  ${done.length ? `<h2>დღეს ჩაბარებული <small>${done.length}</small></h2><div class="list">${done.map(c).join("")}</div>` : ""}`;
}

document.addEventListener("click", async e => {
  const t = e.target.closest("[data-tab]"), f = e.target.closest("[data-filter]"), b = e.target.closest("[data-op]"), rz = e.target.closest("[data-reason]");
  if (rz) { reason[rz.dataset.reason] = rz.dataset.r; force = true; draw(); const d = document.querySelector(`[data-op=problem][data-id="${rz.dataset.reason}"]`); d && d.closest("details").setAttribute("open", ""); return; }
  if (t) { tab = t.dataset.tab; q = ""; say(""); force = true; draw(); try { S = await api("state"); force = true; draw(); } catch {} }
  if (f) { filter = f.dataset.filter; force = true; draw(); }
  if (!b) return;
  const a = b.dataset.op, id = b.dataset.id; force = true;
  if (a === "logout") { await api("logout", {}).catch(() => {}); S = null; F = null; say(""); return draw(); }
  if (a === "pw") { pw = !pw; return draw(); }
  if (a === "additem") { const p = S.products.find(p => p.left > 0) || S.products[0]; F.items.push({ product_id: p?.id || "", qty: 1, price: p?.price || 0 }); return draw(); }
  if (a === "rmitem") { F.items.splice(+b.dataset.k, 1); return draw(); }
  if (a === "assign") return act(`orders/${id}/assign`, { courier_id: $(`#c-${id}`).value }, "კურიერი დაინიშნა და წერილი გაეგზავნა.");
  if (["deliver", "return", "cancel"].includes(a)) return act(`orders/${id}/${a}`);
  if (a === "pick") return act(`orders/${id}/pick`, {}, "მონიშნულია. მყიდველს წერილი გაეგზავნა.");
  if (a === "cdeliver") return act(`orders/${id}/deliver`, { note: $(`#n-${id}`)?.value || "" }, "ჩაბარებულია.");
  if (a === "problem") { const r = reason[id] || ""; const note = r === "სხვა" ? ($(`#n-${id}`)?.value || "") : r; delete reason[id]; return act(`orders/${id}/problem`, { note }); }
  if (a === "toggleuser") return act(`users/${id}`, { active: b.dataset.on === "1" });
  if (a === "resetpw") return act(`users/${id}`, { password: $(`#np-${id}`).value }, "პაროლი შეიცვალა.");
  if (a === "retry") return act(`emails/${id}/retry`);
});
let lookupT = null;
app.addEventListener("input", e => { const el = e.target;
  if (el.id === "q") { q = el.value; pending = true; clearTimeout(lookupT); lookupT = setTimeout(() => { const pos = el.selectionStart; force = true; draw(); const n = $("#q"); if (n) { n.focus(); n.setSelectionRange(pos, pos); } }, 250); return; }
  if (!F) return;
  if (el.dataset.f === "phone") { clearTimeout(lookupT); lookupT = setTimeout(async () => { const digits = el.value.replace(/\D/g, ""); if (digits.length < 6) return;
    try { const c = await api("customer?phone=" + encodeURIComponent(el.value)); if (c.customer && F.phone === el.value) { if (!F.customer) F.customer = c.customer; if (!F.address) F.address = c.address || ""; if (!F.email) F.email = c.email || ""; if (c.zone && ZONE[c.zone]) { F.zone = c.zone; F.fee = ZONE[c.zone][1]; } found = "ნაცნობი მყიდველი: " + c.customer; force = true; draw(); } } catch {} }, 400); }
  if (el.dataset.f) F[el.dataset.f] = el.type === "number" ? +el.value || 0 : el.value;
  if (el.dataset.fi && el.dataset.k !== "product_id") F.items[+el.dataset.fi][el.dataset.k] = +el.value || 0;
  if ($("#f-total")) $("#f-total").textContent = gel(F.items.reduce((a, i) => a + i.qty * i.price, 0) + (+F.fee || 0)); });
app.addEventListener("change", e => { const el = e.target;
  if (F && el.dataset.f === "zone") { F.fee = ZONE[F.zone][1]; force = true; draw(); }
  if (F && el.dataset.fi && el.dataset.k === "product_id") { F.items[+el.dataset.fi].product_id = el.value; F.items[+el.dataset.fi].price = S.products.find(p => p.id == el.value)?.price || 0; force = true; draw(); }
  if (el.dataset.s) act(`stock/${encodeURIComponent(el.dataset.s)}`, { stock_in: +el.value || 0 }, "მარაგი შეინახა."); });
app.addEventListener("submit", async e => { e.preventDefault(); const id = e.target.id;
  if (id === "login") { try { S = await api("login", { email: $("#l-email").value, password: $("#l-pass").value }); say(""); force = true; draw(); } catch (x) { say(x.message); } }
  if (id === "f") { if (await act("orders", F, "შეკვეთა გაფორმდა. წერილები იგზავნება.")) { F = blank(); found = ""; tab = "orders"; filter = "open"; force = true; draw(); } }
  if (id === "uf") { if (await act("users", { name: $("#u-name").value, email: $("#u-email").value, role: $("#u-role").value, password: $("#u-pass").value }, "თანამშრომელი დაემატა.")) e.target.reset?.(); }
  if (id === "pwf") { try { await api("password", { old: $("#p-old").value, new: $("#p-new").value }); pw = false; say("პაროლი შეიცვალა.", true); force = true; draw(); } catch (x) { say(x.message); } } });

(async () => { try { S = await api("state"); } catch { S = null; } draw();
  setInterval(async () => { if (!S || busy || document.hidden) return; try { S = await api("state"); draw(); } catch {} }, 20000); })();
