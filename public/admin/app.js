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
const TABS = { admin: [["home", "მთავარი"], ["orders", "შეკვეთები"], ["neworder", "ახალი შეკვეთა"], ["stock", "მარაგი"], ["users", "თანამშრომლები"], ["emails", "მეილები"]],
  sales: [["neworder", "ახალი შეკვეთა"], ["orders", "ჩემი შეკვეთები"], ["stock", "მარაგი"]], courier: [] };
let S = null, tab = "", filter = "open", F = null, busy = false, pending = false, force = false, pw = false;
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
  app.innerHTML = (pw ? pwForm() : "") + (role === "courier" ? courier() : tab === "home" ? home() : tab === "orders" ? orders() : tab === "neworder" ? newOrder() : tab === "stock" ? (role === "admin" ? stockAdmin() : stockView()) : tab === "users" ? users() : emails());
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
  return `<div class="card"><div class="top"><b>№ ${o.id}</b><span class="pill ${s}">${ST[s]}</span><time>${when(o.created)}</time>${admin ? `<small>გააფორმა: ${esc(o.seller)}</small>` : ""}</div>
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
  const n = s => S.orders.filter(o => o.status === s).length, sum = s => S.orders.filter(o => o.status === s).reduce((a, o) => a + total(o), 0);
  const units = S.products.reduce((a, p) => a + Math.max(0, p.left), 0), sold = S.products.reduce((a, p) => a + p.sold, 0), rev = S.products.reduce((a, p) => a + p.revenue, 0);
  const low = S.products.filter(p => p.left <= 2), open = S.orders.filter(o => OPEN.includes(o.status));
  return `${S.mailReady ? "" : `<div class="msg" style="margin-bottom:14px">მეილის სერვისი ჯერ არ არის დაყენებული, ამიტომ წერილები არ იგზავნება. ისინი ჩანს „მეილები“ განყოფილებაში, როგორც გაუგზავნელი.</div>`}
  <div class="tiles"><div class="tile"><span>მარაგში დარჩა</span><b>${units}</b><small>ცალი, ${S.products.length} სახეობა</small></div>
    <div class="tile"><span>გაიყიდა და ჩაბარდა</span><b>${sold}</b><small>ცალი · ${gel(rev)}</small></div>
    <div class="tile"><span>ჯერ კურიერს არ აუღია</span><b>${n("new") + n("assigned")}</b><small>შეკვეთა</small></div>
    <div class="tile"><span>კურიერთანაა</span><b>${n("picked") + n("problem")}</b><small>ასაღები ${gel(sum("picked") + sum("problem"))}</small></div></div>
  <h2>გაყიდულია, მაგრამ ჯერ არ ჩაბარებულა</h2><div class="list">${open.map(card).join("") || `<div class="msg">ყველაფერი ჩაბარებულია.</div>`}</div>
  ${low.length ? `<h2>მარაგი იწურება</h2><div class="list">${low.map(p => `<div class="card"><div class="top"><b>${esc(p.name)}</b><span class="pill ${p.left <= 0 ? "problem" : "new"}">დარჩა ${p.left}</span></div></div>`).join("")}</div>` : ""}`;
}
function orders() {
  const groups = { open: o => OPEN.includes(o.status), delivered: o => o.status === "delivered", closed: o => ["returned", "cancelled"].includes(o.status) }, list = S.orders.filter(groups[filter]);
  return `<div class="chips" role="group" aria-label="სტატუსი">${[["open", "მიმდინარე"], ["delivered", "ჩაბარებული"], ["closed", "დაბრუნებული / გაუქმებული"]].map(([k, l]) => `<button type="button" data-filter="${k}" aria-pressed="${k === filter}">${l} · ${S.orders.filter(groups[k]).length}</button>`).join("")}</div>
  <div class="list">${list.map(card).join("") || `<div class="msg">აქ შეკვეთა არ არის.</div>`}</div>`;
}
const stockList = () => `<ul class="stocklist">${S.products.map(p => `<li><span>${esc(p.name)} · ${gel(p.price)}</span><span class="${p.left <= 2 ? "low" : ""}">${p.left} ც.</span></li>`).join("")}</ul>`;
const stockView = () => `<p class="hint">რამდენი ცალია ახლა თავისუფალი გასაყიდად.</p><div class="card">${stockList()}</div>`;
function newOrder() {
  const sum = F.items.reduce((a, i) => a + (+i.qty || 0) * (+i.price || 0), 0) + (+F.fee || 0);
  return `<div class="split"><form class="card" id="f" autocomplete="off" style="gap:12px"><div class="g2">
    <label for="f-customer">მყიდველის სახელი<input id="f-customer" data-f="customer" value="${esc(F.customer)}" required></label>
    <label for="f-phone">ტელეფონი<input id="f-phone" data-f="phone" value="${esc(F.phone)}" inputmode="tel" required></label>
    <label for="f-email">მყიდველის მეილი (წერილებისთვის)<input id="f-email" data-f="email" type="email" value="${esc(F.email)}"></label>
    <label for="f-date">მიტანის დღე<input id="f-date" data-f="delivery_date" type="date" value="${esc(F.delivery_date)}" required></label>
    <label for="f-zone">მიწოდება<select id="f-zone" data-f="zone">${Object.entries(ZONE).map(([k, v]) => `<option value="${k}" ${k === F.zone ? "selected" : ""}>${v[0]} · ${v[1]} ₾</option>`).join("")}</select></label>
    <label for="f-fee">მიწოდების ფასი, ₾<input id="f-fee" data-f="fee" type="number" min="0" value="${esc(F.fee)}"></label></div>
    <label for="f-address">მისამართი<input id="f-address" data-f="address" value="${esc(F.address)}"></label>
    ${F.items.map((it, k) => `<div class="irow">
      <label for="f-p${k}">სათამაშო<select id="f-p${k}" data-fi="${k}" data-k="product_id">${S.products.map(p => `<option value="${p.id}" ${p.id == it.product_id ? "selected" : ""} ${p.left <= 0 ? "disabled" : ""}>${esc(p.name)} (დარჩა ${p.left})</option>`).join("")}</select></label>
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
  const c = o => `<div class="card"><div class="top"><b>№ ${o.id}</b><span class="pill ${o.status}">${o.status === "assigned" ? "წასაღებია" : o.status === "picked" ? "აღებული მაქვს" : ST[o.status]}</span><small>${esc(day(o.delivery_date))}</small></div>
    <div class="who"><span>${esc(o.customer)}</span><span><a href="tel:${esc(String(o.phone).replace(/[^\d+]/g, ""))}">${esc(o.phone)}</a></span>
    <span>${esc(ZONE[o.zone]?.[0] || "")}${o.address ? ", " + esc(o.address) + ` · <a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(o.address)}" target="_blank" rel="noopener">რუკა</a>` : ""}</span></div>
    <ul class="items">${o.items.map(i => `<li><span>${esc(i.name)}</span><span>× ${i.qty}</span></li>`).join("")}</ul>
    <div class="sum"><span>ასაღები თანხა</span><span>${gel(o.collect)}</span></div>
    ${o.note ? `<div class="note">შენიშვნა: ${esc(o.note)}</div>` : ""}${o.courier_note ? `<div class="note">ჩემი შენიშვნა: ${esc(o.courier_note)}</div>` : ""}
    ${o.status === "delivered" ? "" : `${o.status === "assigned" ? "" : `<label for="n-${o.id}">შენიშვნა (თუ რამე მოხდა)<input id="n-${o.id}"></label>`}
    <div class="acts">${o.status === "assigned" ? `<button class="btn big" data-op="pick" data-id="${o.id}">ავიღე შეკვეთა</button>` : `<button class="btn big" data-op="cdeliver" data-id="${o.id}">ჩაბარებულია</button>${o.status === "picked" ? `<button class="btn bad" data-op="problem" data-id="${o.id}">ვერ ჩავაბარე</button>` : ""}`}</div>`}</div>`;
  return `<h2 style="margin-top:0">ჩემი შეკვეთები · ${todo.length}</h2><div class="list">${todo.map(c).join("") || `<div class="msg">ახლა წასაღები არაფერია.</div>`}</div>
  ${done.length ? `<h2>დღეს ჩაბარებული · ${done.length}</h2><div class="list">${done.map(c).join("")}</div>` : ""}`;
}

document.addEventListener("click", async e => {
  const t = e.target.closest("[data-tab]"), f = e.target.closest("[data-filter]"), b = e.target.closest("[data-op]");
  if (t) { tab = t.dataset.tab; say(""); force = true; draw(); }
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
  if (a === "problem") return act(`orders/${id}/problem`, { note: $(`#n-${id}`)?.value || "" });
  if (a === "toggleuser") return act(`users/${id}`, { active: b.dataset.on === "1" });
  if (a === "resetpw") return act(`users/${id}`, { password: $(`#np-${id}`).value }, "პაროლი შეიცვალა.");
  if (a === "retry") return act(`emails/${id}/retry`);
});
app.addEventListener("input", e => { const el = e.target; if (!F) return;
  if (el.dataset.f) F[el.dataset.f] = el.type === "number" ? +el.value || 0 : el.value;
  if (el.dataset.fi) F.items[+el.dataset.fi][el.dataset.k] = +el.value || 0;
  if ($("#f-total")) $("#f-total").textContent = gel(F.items.reduce((a, i) => a + i.qty * i.price, 0) + (+F.fee || 0)); });
app.addEventListener("change", e => { const el = e.target;
  if (F && el.dataset.f === "zone") { F.fee = ZONE[F.zone][1]; force = true; draw(); }
  if (F && el.dataset.fi && el.dataset.k === "product_id") { F.items[+el.dataset.fi].price = S.products.find(p => p.id == el.value)?.price || 0; force = true; draw(); }
  if (el.dataset.s) act(`stock/${encodeURIComponent(el.dataset.s)}`, { stock_in: +el.value || 0 }, "მარაგი შეინახა."); });
app.addEventListener("submit", async e => { e.preventDefault(); const id = e.target.id;
  if (id === "login") { try { S = await api("login", { email: $("#l-email").value, password: $("#l-pass").value }); say(""); force = true; draw(); } catch (x) { say(x.message); } }
  if (id === "f") { if (await act("orders", F, "შეკვეთა გაფორმდა. წერილები იგზავნება.")) { F = blank(); tab = "orders"; filter = "open"; force = true; draw(); } }
  if (id === "uf") { if (await act("users", { name: $("#u-name").value, email: $("#u-email").value, role: $("#u-role").value, password: $("#u-pass").value }, "თანამშრომელი დაემატა.")) e.target.reset?.(); }
  if (id === "pwf") { try { await api("password", { old: $("#p-old").value, new: $("#p-new").value }); pw = false; say("პაროლი შეიცვალა.", true); force = true; draw(); } catch (x) { say(x.message); } } });

(async () => { try { S = await api("state"); } catch { S = null; } draw();
  setInterval(async () => { if (!S || busy || document.hidden) return; try { S = await api("state"); draw(); } catch {} }, 20000); })();
