/* MOKU ადმინ-პანელი საიტზე: ტექსტები, სათამაშოები, ფოტოები, ფასები, კონტაქტი, სტატისტიკა.
   იტვირთება მხოლოდ მაშინ, როცა ადმინი შესულია. ინახება ბაზაში (/api/shop). */
(function () {
  "use strict";
  var $ = function (s) { return document.querySelector(s); }, $$ = function (s) { return Array.prototype.slice.call(document.querySelectorAll(s)); };
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); };
  var CATS = ["build", "music", "role", "boards"], TINTS = ["--birch", "--mist", "--sage", "--blush"];
  var W = null, IMGBASE = "", UPLOADS = false, dirty = false, tab = "products", openId = null, delId = null, busy = false;

  document.body.insertAdjacentHTML("beforeend",
    '<button type="button" id="admin-open">ადმინი</button>' +
    '<dialog id="admin" aria-labelledby="a-title">' +
    '<div class="a-top"><h2 id="a-title">ადმინ პანელი</h2><a class="btn ghost" href="/admin" style="margin-left:auto;padding:10px 18px">შეკვეთები და მარაგი</a><button class="x" type="button" id="a-close" aria-label="დახურვა" style="position:static">×</button></div>' +
    '<div id="a-tabs" role="group" aria-label="განყოფილება"><button type="button" data-tab="products">სათამაშოები</button><button type="button" data-tab="prices">ფასები და მიწოდება</button><button type="button" data-tab="contact">კონტაქტი და სტატისტიკა</button><button type="button" data-tab="texts">ტექსტები</button></div>' +
    '<div id="a-body"></div>' +
    '<div class="a-foot"><span id="a-status" role="status"></span><button class="btn ghost" type="button" id="a-reset">გაუქმება</button><button class="btn" type="button" id="a-save">შენახვა</button></div>' +
    '</dialog>');
  var A = $("#admin");

  var src = function (n) { return String(n).indexOf("u-") === 0 ? IMGBASE + "/" + n + "-480.webp" : "/img/" + n + "-480.webp"; };
  var LBL = { top: "ზედა ზოლი ({d} = ფასდაკლების %)", nav1: "მენიუ: კოლექცია", nav2: "მენიუ: ჩვენ შესახებ", nav3: "მენიუ: შეკვეთა",
    heroEyebrow: "მთავარი ეკრანი: პატარა წარწერა", heroTitle: "მთავარი სათაური (*სიტყვა* გამოიყოფა ფერით)", heroText: "მთავარი ტექსტი", heroCta: "მთავარი ღილაკი", heroLink: "მთავარი ბმული", seal: "მრგვალი ბეჭდის წარწერა", band: "მოძრავი ზოლი (სიტყვები გამოყავი | ნიშნით)",
    n1t: "უპირატესობა 1: სათაური", n1: "უპირატესობა 1: ტექსტი", n2t: "უპირატესობა 2: სათაური", n2: "უპირატესობა 2: ტექსტი", n3t: "უპირატესობა 3: სათაური", n3: "უპირატესობა 3: ტექსტი",
    colEyebrow: "კოლექცია: პატარა წარწერა", colTitle: "კოლექცია: სათაური", all: "ფილტრი: ყველა", build: "კატეგორია 1", music: "კატეგორია 2", role: "კატეგორია 3", boards: "კატეგორია 4",
    roomEyebrow: "ოთახის სექცია: პატარა წარწერა", roomTitle: "ოთახის სექცია: სათაური", roomText: "ოთახის სექცია: ტექსტი ({name} = არჩეული სათამაშო)", roomCta: "ოთახის სექცია: ღილაკი",
    stEyebrow: "სახელის ისტორია: პატარა წარწერა", stTitle: "სახელის ისტორია: სათაური", st1: "სახელის ისტორია: აბზაცი 1", st2: "სახელის ისტორია: აბზაცი 2",
    orEyebrow: "შეკვეთა: პატარა წარწერა", orTitle: "შეკვეთა: სათაური", s1t: "ნაბიჯი 1: სათაური", s1: "ნაბიჯი 1: ტექსტი", s2t: "ნაბიჯი 2: სათაური", s2: "ნაბიჯი 2: ტექსტი", s3t: "ნაბიჯი 3: სათაური", s3: "ნაბიჯი 3: ტექსტი (მიწოდება)",
    soon: "ცარიელი კონტაქტის ტექსტი", phone: "სიტყვა „ტელეფონი“", foot: "ქვედა ხაზი", footText: "ქვედა ტექსტი", material: "სიტყვა „მასალა“", size: "სიტყვა „ზომა“", delivery: "სიტყვა „მიწოდება“", deliveryV: "მიწოდების პირობა სათამაშოს გვერდზე", price: "სიტყვა „ფასი“",
    copy: "ღილაკი: ტექსტის კოპირება", how: "ღილაკი: როგორ შევუკვეთო", copied: "შეტყობინება: დაკოპირდა", copyFail: "შეტყობინება: ვერ დაკოპირდა", view: "ღილაკი: ნახვა", orderT: "შეკვეთის ტექსტი ({n} = სახელი, {p} = ფასი)",
    heroAlt: "მთავარი ფოტოს აღწერა (Google-ისთვის)", roomAlt: "ოთახის ფოტოს აღწერა (Google-ისთვის)",
    seoTitle: "Google: მთავარი გვერდის სათაური", seoDesc: "Google: მთავარი გვერდის აღწერა (150 სიმბოლომდე)", back: "ღილაკი: კოლექციაში დაბრუნება", similar: "სათამაშოს გვერდი: „კიდევ ნახე“", waBtn: "ღილაკი: WhatsApp-ით შეკვეთა",
    consentText: "თანხმობის ზოლის ტექსტი", consentOk: "თანხმობა: ღილაკი „კი“", consentNo: "თანხმობა: ღილაკი „არა“" };
  var DELIV = ["top", "deliveryV", "s3", "n3t", "n3"];
  var setPath = function (o, path, v) { var k = path.split("."), last = k.pop(); k.reduce(function (a, x) { return a[x]; }, o)[last] = v; };
  var getPath = function (o, path) { return path.split(".").reduce(function (a, x) { return a == null ? a : a[x]; }, o); };
  function inp(path, label, o) {
    o = o || {}; var v = getPath(W, path); if (v == null) v = ""; var id = "a-" + path.replace(/\./g, "-");
    return '<label class="f' + (o.wide ? " w" : "") + '" for="' + id + '"><span>' + esc(label) + "</span>" + (o.area ? '<textarea id="' + id + '" data-p="' + path + '" rows="' + o.area + '">' + esc(v) + "</textarea>" : '<input id="' + id + '" data-p="' + path + '" type="' + (o.num ? "number" : "text") + '" ' + (o.num ? 'min="0" inputmode="numeric"' : "") + ' value="' + esc(v) + '">') + "</label>";
  }
  var pair = function (key, o) { return '<div class="pair"><b>' + esc(LBL[key] || key) + "</b>" + inp("T.ka." + key, "ქართულად", o) + inp("T.en." + key, "English", o) + "</div>"; };
  var newPrice = function (p) { return Math.round(p.old * (1 - W.discount / 100)); };
  var mark = function (m) { dirty = true; $("#a-status").textContent = m || "შეუნახავი ცვლილებები გაქვს"; };

  function render() {
    $$("#a-tabs button").forEach(function (b) { b.setAttribute("aria-pressed", String(b.dataset.tab === tab)); });
    var B = $("#a-body");
    if (tab === "products") {
      B.innerHTML = '<p class="a-note">ისრებით შეცვალე რიგი. სათამაშოზე დააჭირე, რომ გახსნა და შეცვალო.</p>' + W.products.map(function (p, i) {
        var o = p.id === openId;
        return '<div class="row' + (p.hidden ? " off2" : "") + '"><div class="rh"><span class="th" style="background:var(' + p.tint + ')">' + (p.imgs[0] ? '<img src="' + src(p.imgs[0][0]) + '" alt="">' : "") + "</span>" +
          '<button type="button" class="nm" data-act="open" data-k="' + i + '"><b>' + esc(p.ka[0] || "უსახელო") + "</b><small>" + p.old + " ₾ → " + newPrice(p) + " ₾" + (p.hidden ? " · დამალულია" : "") + "</small></button>" +
          '<button type="button" class="ic" data-act="up" data-k="' + i + '" aria-label="ზემოთ" ' + (i ? "" : "disabled") + ">↑</button>" +
          '<button type="button" class="ic" data-act="down" data-k="' + i + '" aria-label="ქვემოთ" ' + (i < W.products.length - 1 ? "" : "disabled") + ">↓</button>" +
          '<button type="button" class="tx" data-act="hide" data-k="' + i + '">' + (p.hidden ? "ჩვენება" : "დამალვა") + "</button></div>" +
          (o ? '<div class="rb">' + inp("products." + i + ".ka.0", "სახელი (ქართ.)") + inp("products." + i + ".en.0", "Name (Eng.)") +
            inp("products." + i + ".ka.1", "აღწერა (ქართ.)", { area: 4 }) + inp("products." + i + ".en.1", "Description (Eng.)", { area: 4 }) +
            inp("products." + i + ".ka.2", "მასალა (ქართ.)") + inp("products." + i + ".en.2", "Material (Eng.)") +
            inp("products." + i + ".ka.3", "ზომა (ქართ.)") + inp("products." + i + ".en.3", "Size (Eng.)") +
            inp("products." + i + ".old", "ფასი ფასდაკლებამდე, ₾", { num: 1 }) +
            '<label class="f" for="a-cat-' + i + '"><span>კატეგორია</span><select id="a-cat-' + i + '" data-p="products.' + i + '.cat">' + CATS.map(function (c) { return '<option value="' + c + '" ' + (c === p.cat ? "selected" : "") + ">" + esc(W.T.ka[c]) + "</option>"; }).join("") + "</select></label>" +
            '<label class="f" for="a-tint-' + i + '"><span>ფონის ფერი</span><select id="a-tint-' + i + '" data-p="products.' + i + '.tint">' + TINTS.map(function (c, k) { return '<option value="' + c + '" ' + (c === p.tint ? "selected" : "") + ">" + ["ხისფერი", "ცისფერი", "მწვანე", "ვარდისფერი"][k] + "</option>"; }).join("") + "</select></label>" +
            '<div class="f w"><span>ფოტოები (პირველი მთავარია; „თეთრი ფონი“: ფოტო ფერად ფონზე ჩაჯდება)</span><div class="ph">' + (p.imgs.map(function (x, k) {
              return '<span class="pc"><img src="' + src(x[0]) + '" alt="">' + (k ? '<button type="button" data-act="main" data-k="' + i + '" data-j="' + k + '">მთავარი</button>' : "<em>მთავარი</em>") +
                '<button type="button" data-act="cut" data-k="' + i + '" data-j="' + k + '">' + (x[1] ? "თეთრი ფონი ✓" : "თეთრი ფონი") + "</button>" +
                '<button type="button" data-act="rmimg" data-k="' + i + '" data-j="' + k + '" aria-label="ფოტოს წაშლა">×</button></span>';
            }).join("") || "<small>ფოტო ჯერ არ არის</small>") + "</div>" +
            (UPLOADS ? '<label class="btn ghost up">ფოტოს დამატება<input type="file" accept="image/*" multiple data-up="' + i + '" hidden></label>' : '<small>ფოტოს ასატვირთად Railway-ში საჭიროა SUPABASE_URL და SUPABASE_SERVICE_ROLE_KEY.</small>') + "</div>" +
            '<div class="f w"><button type="button" class="danger" data-act="del" data-k="' + i + '">' + (delId === p.id ? "დააჭირე კიდევ ერთხელ წასაშლელად" : "სათამაშოს წაშლა") + "</button></div></div>" : "") + "</div>";
      }).join("") + '<button type="button" class="add" data-act="add">+ ახალი სათამაშო</button>';
    } else if (tab === "prices") {
      B.innerHTML = '<div class="grid2">' + inp("discount", "ფასდაკლება, % (0 = ფასდაკლების გარეშე)", { num: 1 }) + "</div>" +
        '<table class="pt"><thead><tr><th>სათამაშო</th><th>ძველი ფასი, ₾</th><th>ახალი ფასი</th></tr></thead><tbody>' + W.products.map(function (p, i) {
          return "<tr><td>" + esc(p.ka[0]) + '</td><td><input id="a-old-' + i + '" data-p="products.' + i + '.old" type="number" min="0" inputmode="numeric" value="' + p.old + '" aria-label="ძველი ფასი"></td><td data-new="' + i + '">' + newPrice(p) + " ₾</td></tr>";
        }).join("") + "</tbody></table><h4>მიწოდება</h4>" + DELIV.map(function (k) { return pair(k, { area: 2 }); }).join("");
    } else if (tab === "contact") {
      B.innerHTML = '<p class="a-note">ცარიელი ველი საიტზე ჩანს როგორც „მალე დაემატება“. თუ WhatsApp-ს ჩაწერ, სათამაშოს გვერდზე გამოჩნდება ღილაკი „WhatsApp-ით შეკვეთა“.</p><div class="grid2">' +
        inp("contacts.wa", "WhatsApp ნომერი (მაგ. +995 5XX XX XX XX)") + inp("contacts.ig", "Instagram (მაგ. @moku.ge)") + inp("contacts.phone", "ტელეფონი") + "</div>" +
        '<h4>სტატისტიკა</h4><p class="a-note">ჩაირთვება მხოლოდ მაშინ, როცა მყიდველი თანხმობის ზოლზე „ვეთანხმები“-ს დააჭერს. ცარიელი ველი = გამორთულია.</p><div class="grid2">' +
        inp("analytics.ga", "Google Analytics (G-XXXXXXXXXX)") + inp("analytics.pixel", "Meta Pixel (მხოლოდ ციფრები)") + "</div>";
    } else {
      B.innerHTML = '<div class="pair"><b>ოთახის სექცია: რომელი სათამაშო იდგეს</b><label class="f" for="a-room"><span>სათამაშო</span><select id="a-room" data-p="room">' + W.products.map(function (q) { return '<option value="' + esc(q.id) + '" ' + (q.id === W.room ? "selected" : "") + ">" + esc(q.ka[0]) + "</option>"; }).join("") + '</select></label><small>ტექსტში {name} ამ სათამაშოს სახელით შეიცვლება.</small></div>' + Object.keys(W.T.ka).filter(function (k) { return DELIV.indexOf(k) < 0; }).map(function (k) { return pair(k, { area: /Text|st1|st2|^s\d$|footText|band|heroTitle|seoDesc|consentText/.test(k) ? 3 : 0 }); }).join("");
    }
  }

  async function load() {
    var r = await fetch("/api/shop", { credentials: "same-origin" }), j = await r.json().catch(function () { return {}; });
    if (!r.ok) throw new Error(j.error || "ვერ ჩაიტვირთა");
    W = j.data; IMGBASE = j.imgBase || ""; UPLOADS = !!j.uploads; dirty = false;
  }
  $("#admin-open").onclick = async function () {
    try { if (!W) await load(); } catch (e) { alert(e.message); return; }
    delId = null; render(); $("#a-status").textContent = dirty ? "შეუნახავი ცვლილებები გაქვს" : ""; A.showModal();
  };
  $("#a-tabs").onclick = function (e) { var b = e.target.closest("button"); if (b) { tab = b.dataset.tab; render(); $("#a-body").scrollTop = 0; } };
  A.addEventListener("input", function (e) {
    var p = e.target.dataset.p; if (!p) return;
    var v = e.target.value; if (e.target.type === "number") v = Math.max(0, Math.round(+v || 0));
    setPath(W, p, v); mark();
    if (tab === "prices") $$("[data-new]").forEach(function (c) { c.textContent = newPrice(W.products[c.dataset.new]) + " ₾"; });
  });
  A.addEventListener("change", function (e) {
    if (e.target.dataset.p && e.target.tagName === "SELECT" && tab === "products") render();
    if (e.target.dataset.up !== undefined) upload(+e.target.dataset.up, Array.prototype.slice.call(e.target.files));
  });
  $("#a-body").addEventListener("click", function (e) {
    var b = e.target.closest("[data-act]"); if (!b || busy) return;
    var P = W.products, i = +b.dataset.k, j = +b.dataset.j, a = b.dataset.act;
    if (a === "open") { openId = openId === P[i].id ? null : P[i].id; delId = null; render(); return; }
    if (a === "up") { var t = P[i - 1]; P[i - 1] = P[i]; P[i] = t; }
    if (a === "down") { var u = P[i + 1]; P[i + 1] = P[i]; P[i] = u; }
    if (a === "hide") P[i].hidden = !P[i].hidden;
    if (a === "main") P[i].imgs.unshift(P[i].imgs.splice(j, 1)[0]);
    if (a === "cut") P[i].imgs[j][1] = P[i].imgs[j][1] ? 0 : 1;
    if (a === "rmimg") P[i].imgs.splice(j, 1);
    if (a === "del") { if (delId !== P[i].id) { delId = P[i].id; render(); return; } P.splice(i, 1); delId = null; }
    if (a === "add") { var id = "p" + Date.now().toString(36); P.push({ id: id, cat: "build", tint: "--birch", imgs: [], ka: ["ახალი სათამაშო", "", "ხე", ""], en: ["New toy", "", "Wood", ""], old: 0, hidden: true }); openId = id; }
    mark(); render();
  });

  // ფოტო ბრაუზერში მცირდება სამ ზომაში (WebP) + ერთი JPG გაზიარებისთვის, მერე იტვირთება
  function toBlob(c, type, q) { return new Promise(function (ok) { c.toBlob(ok, type, q); }); }
  async function variants(file) {
    var bmp = await createImageBitmap(file), out = [], name = "u-" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
    var sizes = [[480, "webp"], [960, "webp"], [1400, "webp"], [1200, "jpg"]];
    for (var k = 0; k < sizes.length; k++) {
      var w = sizes[k][0], s = Math.min(1, w / bmp.width), c = document.createElement("canvas");
      c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s);
      var ctx = c.getContext("2d"); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height); ctx.drawImage(bmp, 0, 0, c.width, c.height);
      var blob = sizes[k][1] === "jpg" ? await toBlob(c, "image/jpeg", 0.85) : await toBlob(c, "image/webp", 0.82);
      out.push([name + "-" + w + "." + sizes[k][1], blob]);
    }
    return { name: name, files: out };
  }
  async function upload(i, files) {
    if (!files.length) return;
    busy = true; var st = $("#a-status");
    try {
      for (var f = 0; f < files.length; f++) {
        st.textContent = "ფოტო " + (f + 1) + " / " + files.length + " მზადდება…";
        var v = await variants(files[f]);
        for (var k = 0; k < v.files.length; k++) {
          st.textContent = "ფოტო " + (f + 1) + " / " + files.length + " იტვირთება… (" + (k + 1) + "/4)";
          var r = await fetch("/api/images/" + encodeURIComponent(v.files[k][0]), { method: "POST", credentials: "same-origin", headers: { "X-Moku": "1", "Content-Type": v.files[k][1].type || "image/jpeg" }, body: v.files[k][1] });
          if (!r.ok) { var j = await r.json().catch(function () { return {}; }); throw new Error(j.error || "ფოტო ვერ აიტვირთა"); }
        }
        W.products[i].imgs.push([v.name, 0]);
      }
      mark("ფოტო დაემატა. დააჭირე „შენახვა“, რომ საიტზე გამოჩნდეს.");
    } catch (e) { st.textContent = e.message || "ფოტო ვერ აიტვირთა"; }
    busy = false; render();
  }

  $("#a-close").onclick = function () { A.close(); };
  $("#a-reset").onclick = async function () { try { await load(); openId = delId = null; render(); $("#a-status").textContent = "ცვლილებები გაუქმდა"; } catch (e) { $("#a-status").textContent = e.message; } };
  $("#a-save").onclick = async function () {
    var st = $("#a-status"), btn = $("#a-save"); btn.disabled = true; st.textContent = "ინახება…";
    try {
      var r = await fetch("/api/shop", { method: "POST", headers: { "Content-Type": "application/json", "X-Moku": "1" }, credentials: "same-origin", body: JSON.stringify({ data: W }) });
      var j = await r.json().catch(function () { return {}; });
      if (!r.ok) throw new Error(j.error || "ვერ შეინახა. სცადე ხელახლა.");
      dirty = false; st.textContent = "შენახულია. გვერდი ახლდება…"; setTimeout(function () { location.reload(); }, 400);
    } catch (e) { st.textContent = e.message || "ვერ შეინახა. სცადე ხელახლა."; btn.disabled = false; }
  };
  addEventListener("beforeunload", function (e) { if (dirty) { e.preventDefault(); e.returnValue = ""; } });
})();
