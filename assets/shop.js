/* MOKU საიტის ქცევა: ფილტრი, გალერეა, ტექსტის კოპირება, ანიმაცია, სტატისტიკა თანხმობით */
(function () {
  "use strict";
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  // კატეგორიის ფილტრი მთავარ გვერდზე
  var grid = $("#grid");
  $$("[data-c2]").forEach(function (b) {
    b.addEventListener("click", function () {
      var cat = b.getAttribute("data-c2");
      $$("[data-c2]").forEach(function (x) { x.setAttribute("aria-pressed", String(x === b)); });
      var shown = [];
      $$(".card", grid).forEach(function (c) {
        var on = cat === "all" || c.getAttribute("data-cat") === cat;
        c.hidden = !on;
        c.classList.remove("wide");
        if (on) shown.push(c);
      });
      if (cat === "all") {
        var r = shown.length % 3;
        if (r && shown[0]) shown[0].classList.add("wide");
        if (r === 1 && shown.length > 1) shown[shown.length - 1].classList.add("wide");
      }
    });
  });

  // მენიუ ტელეფონზე
  var burger = $("#burger"), head = $("header");
  if (burger && head) {
    var setMenu = function (on) { head.classList.toggle("open", on); burger.setAttribute("aria-expanded", String(on)); };
    burger.addEventListener("click", function () { setMenu(!head.classList.contains("open")); });
    $$("nav a", head).forEach(function (a) { a.addEventListener("click", function () { setMenu(false); }); });
    document.addEventListener("click", function (e) { if (!head.contains(e.target)) setMenu(false); });
  }

  // სათამაშოს გალერეა: პატარა ფოტოები, თითის გასმა, დიდი ფოტო დაჭერით
  var main = $("#pp-main"), shot = $(".pp-shot"), tbs = $$(".pp-gal .thumbs button"), cur = 0;
  var shots = tbs.length ? tbs.map(function (b) { return { src: b.getAttribute("data-src"), set: b.getAttribute("data-srcset"), full: b.getAttribute("data-full"), cut: b.getAttribute("data-cut") === "1" }; })
    : main ? [{ src: main.getAttribute("src"), set: main.getAttribute("srcset"), full: main.getAttribute("data-full"), cut: main.classList.contains("cut") }] : [];
  var dots = null;
  // არაკვადრატული ფოტო მთლიანად ჩანს (არ იჭრება)
  function fit() { if (!main || !main.naturalWidth) return; var r = main.naturalWidth / main.naturalHeight; main.classList.toggle("fit", !main.classList.contains("cut") && (r < 0.9 || r > 1.12)); }
  function show(k) {
    if (!main || !shots.length) return;
    cur = (k + shots.length) % shots.length;
    var x = shots[cur];
    main.classList.remove("fit");
    main.classList.toggle("cut", x.cut);
    main.srcset = x.set; main.src = x.src;
    tbs.forEach(function (b, i) { b.setAttribute("aria-pressed", String(i === cur)); });
    if (dots) $$("i", dots).forEach(function (d, i) { d.classList.toggle("on", i === cur); });
  }
  function swipe(el, go) {
    var x0 = null, y0 = 0;
    el.addEventListener("touchstart", function (e) { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; }, { passive: true });
    el.addEventListener("touchend", function (e) {
      if (x0 === null) return;
      var dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0; x0 = null;
      if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.4) { el._swiped = Date.now(); go(dx < 0 ? 1 : -1); }
    }, { passive: true });
  }
  if (main) {
    main.addEventListener("load", fit); if (main.complete) fit();
    tbs.forEach(function (b, i) { b.addEventListener("click", function () { show(i); }); });
    if (shots.length > 1 && shot) {
      dots = document.createElement("div"); dots.className = "dots"; dots.setAttribute("aria-hidden", "true");
      dots.innerHTML = shots.map(function (_, i) { return "<i" + (i ? "" : ' class="on"') + "></i>"; }).join("");
      shot.parentNode.insertBefore(dots, shot.nextSibling);
      swipe(shot, function (d) { show(cur + d); });
    }
    if (shot) shot.addEventListener("click", function () { if (shot._swiped && Date.now() - shot._swiped < 400) return; openLb(); });
  }
  var lb = null;
  function openLb() {
    if (lb || !shots.length) return;
    lb = document.createElement("div"); lb.className = "lb"; lb.setAttribute("role", "dialog"); lb.setAttribute("aria-modal", "true");
    var many = shots.length > 1;
    lb.innerHTML = '<img alt=""><button type="button" class="lb-x" aria-label="Close">×</button>' + (many ? '<button type="button" class="lb-p" aria-label="Previous">‹</button><button type="button" class="lb-n" aria-label="Next">›</button><span class="lb-c"></span>' : "");
    var im = $("img", lb), c = $(".lb-c", lb);
    var paint = function () { im.src = shots[cur].full || shots[cur].src; if (c) c.textContent = (cur + 1) + " / " + shots.length; };
    var close = function () { if (!lb) return; document.removeEventListener("keydown", key); lb.remove(); lb = null; document.documentElement.style.overflow = ""; };
    var step = function (d) { show(cur + d); paint(); };
    var key = function (e) { if (e.key === "Escape") close(); else if (e.key === "ArrowRight") step(1); else if (e.key === "ArrowLeft") step(-1); };
    lb.addEventListener("click", function (e) {
      if (lb._swiped && Date.now() - lb._swiped < 400) return;
      var b = e.target.closest("button");
      if (b && b.classList.contains("lb-p")) return step(-1);
      if (b && b.classList.contains("lb-n")) return step(1);
      if (b || e.target === lb) close();
    });
    if (many) swipe(lb, step);
    document.addEventListener("keydown", key);
    document.documentElement.style.overflow = "hidden";
    paint(); document.body.appendChild(lb); $(".lb-x", lb).focus();
  }

  // ტელეფონზე შეკვეთის ზოლი: იმალება, როცა შეკვეთის ღილაკები ისედაც ეკრანზეა
  var bb = $("#buybar"), acts = $(".pp-info .actions");
  if (bb && acts && "IntersectionObserver" in window) {
    new IntersectionObserver(function (es) { bb.classList.toggle("away", es[0].isIntersecting); }).observe(acts);
  }

  // შეკვეთის ტექსტის კოპირება
  var copy = $("#copy");
  if (copy) copy.addEventListener("click", function () {
    var m = $("#p-msg"), t = $("#toast");
    var ok = function () { t.textContent = copy.getAttribute("data-ok"); };
    var no = function () { getSelection().selectAllChildren(m); t.textContent = copy.getAttribute("data-fail"); };
    try { navigator.clipboard.writeText(m.textContent).then(ok, no); } catch (e) { no(); }
  });

  // სექციები რბილად ჩნდება; ის, რაც უკვე ეკრანზეა, ადგილზე რჩება
  if ("IntersectionObserver" in window && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (x) { if (x.isIntersecting) { x.target.classList.remove("pre"); io.unobserve(x.target); } });
    }, { rootMargin: "0px 0px -8% 0px" });
    $$(".rv").forEach(function (el) { if (el.getBoundingClientRect().top > innerHeight) { el.classList.add("pre"); io.observe(el); } });
  }

  // MOKU-ს საკუთარი სტატისტიკა (ადმინში „ვიზიტორები“): უსახელოდ, cookie-ს გარეშე. იგზავნება: რა გვერდი, რას დააჭირა, რამდენ ხანს.
  (function () {
    if (navigator.webdriver || /[?&]edit=/.test(location.search)) return;
    var get = function (s, k) { try { return s.getItem(k); } catch (e) { return null; } };
    var put = function (s, k, v) { try { s.setItem(k, v); } catch (e) {} };
    var SS = window.sessionStorage, LS = window.localStorage;
    var sid = get(SS, "mk-sid");
    if (!sid) {
      sid = (Math.random().toString(36).slice(2) + Date.now().toString(36)).replace(/[^a-z0-9]/g, "").slice(0, 32);
      put(SS, "mk-sid", sid);
      put(SS, "mk-ret", get(LS, "mk-seen") ? "1" : "0"); put(LS, "mk-seen", "1");
      var qs = new URLSearchParams(location.search), r = "";
      try { r = document.referrer ? new URL(document.referrer).hostname : ""; } catch (e) {}
      if (r === location.hostname) r = "";
      put(SS, "mk-src", JSON.stringify({ r: r, u: qs.get("utm_source") || "", c: qs.get("utm_campaign") || "", f: qs.has("fbclid") ? 1 : 0, g: qs.has("gclid") ? 1 : 0 }));
    }
    var src = {}; try { src = JSON.parse(get(SS, "mk-src") || "{}"); } catch (e) {}
    var base = { sid: sid, lang: document.body.getAttribute("data-lang") || "ka", ret: get(SS, "mk-ret") === "1" ? 1 : 0, src: src };
    var q = [], timer = null, t0 = Date.now(), depth = 0;
    function send(now) {
      clearTimeout(timer); if (!q.length) return;
      var body = JSON.stringify(Object.assign({ ev: q.splice(0, 40) }, base));
      try { if (now && navigator.sendBeacon && navigator.sendBeacon("/t", new Blob([body], { type: "text/plain" }))) return; } catch (e) {}
      try { fetch("/t", { method: "POST", body: body, keepalive: true, headers: { "Content-Type": "text/plain" } }).catch(function () {}); } catch (e) {}
    }
    function ev(k, extra) { var e = { k: k, p: location.pathname }; for (var x in extra) e[x] = extra[x]; q.push(e); clearTimeout(timer); timer = setTimeout(send, 2000); }
    function scrolled() { var h = document.documentElement.scrollHeight - innerHeight; depth = Math.max(depth, h > 0 ? Math.round((scrollY / h) * 100) : 100); }
    addEventListener("scroll", scrolled, { passive: true }); scrolled();
    function leave() { var s = Math.round((Date.now() - t0) / 1000); if (s > 0) ev("leave", { s: s, d: depth }); t0 = Date.now(); send(true); }
    document.addEventListener("visibilitychange", function () { if (document.visibilityState === "hidden") leave(); else t0 = Date.now(); });
    addEventListener("pagehide", leave);
    var pidOf = function (h) { var m = /\/toy\/([a-z0-9_-]+)/i.exec(h || ""); return m ? m[1] : ""; };
    function label(a) {
      var h = a.getAttribute("href") || "", m;
      if (a.hasAttribute("data-consent") || a.hasAttribute("data-copied")) return null;
      if (a.id === "copy") return ["order_copy"];
      if (/wa\.me\//.test(h)) return [a.closest(".pp") ? "order_wa" : "contact_wa"];
      if (a.hasAttribute("data-c2")) return ["cat:" + a.getAttribute("data-c2")];
      if (a.closest(".thumbs") || a.closest(".lb")) return ["gallery"];
      if (a.id === "burger") return ["menu"];
      if (a.hasAttribute("data-dm")) return ["order_" + a.getAttribute("data-dm")];
      if (a.closest(".buybar")) return [/wa\.me\//.test(h) ? "order_wa" : "order_bar"];
      if (a.classList.contains("card")) return ["toy_card", pidOf(h)];
      if (a.hasAttribute("hreflang")) return ["lang:" + a.getAttribute("hreflang")];
      if (/^tel:/.test(h)) return ["contact_phone"];
      if (/^mailto:/.test(h)) return ["contact_mail"];
      if ((m = /^https?:\/\/(?:www\.|m\.)?([a-z0-9-]+)\./i.exec(h)) && !/moku/i.test(m[1])) return ["contact_" + m[1].toLowerCase()];
      if (a.classList.contains("brand")) return ["logo"];
      if (a.classList.contains("back")) return ["back"];
      if ((m = /#([a-z]+)$/i.exec(h))) return [(a.closest("header") ? "nav" : a.closest("footer") ? "foot" : a.classList.contains("btn") ? "btn" : "link") + ":" + m[1]];
      if (pidOf(h)) return ["toy_link", pidOf(h)];
      return null;
    }
    document.addEventListener("click", function (e) {
      var a = e.target.closest && e.target.closest("a,button"); if (!a) return;
      var l = label(a); if (!l) return;
      ev("click", l[1] ? { l: l[0], pid: l[1] } : { l: l[0] });
      if (a.tagName === "A" && !/^#/.test(a.getAttribute("href") || "")) send(true); // გვერდიდან გადის: მაშინვე გაგზავნე
    }, true);
    ev("view");
  })();

  // სტატისტიკა: იტვირთება მხოლოდ თანხმობის შემდეგ და მხოლოდ თუ კოდი ჩაწერილია პანელში
  var ga = document.body.getAttribute("data-ga"), px = document.body.getAttribute("data-px");
  if (!ga && !px) return;
  var KEY = "moku-consent", choice = null;
  try { choice = localStorage.getItem(KEY); } catch (e) {}
  function load() {
    if (ga) {
      var s = document.createElement("script"); s.async = true; s.src = "https://www.googletagmanager.com/gtag/js?id=" + encodeURIComponent(ga); document.head.appendChild(s);
      window.dataLayer = window.dataLayer || [];
      window.gtag = function () { window.dataLayer.push(arguments); };
      window.gtag("js", new Date()); window.gtag("config", ga);
    }
    if (px) {
      /* Meta Pixel-ის სტანდარტული ჩამტვირთავი */
      !function (f, b, e, v, n, t, s) { if (f.fbq) return; n = f.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments); }; if (!f._fbq) f._fbq = n; n.push = n; n.loaded = !0; n.version = "2.0"; n.queue = []; t = b.createElement(e); t.async = !0; t.src = v; s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s); }(window, document, "script", "https://connect.facebook.net/en_US/fbevents.js");
      window.fbq("init", px); window.fbq("track", "PageView");
    }
  }
  if (choice === "yes") return load();
  if (choice === "no") return;
  var bar = $("#consent");
  if (!bar) return;
  bar.hidden = false;
  $$("[data-consent]", bar).forEach(function (b) {
    b.addEventListener("click", function () {
      var v = b.getAttribute("data-consent");
      try { localStorage.setItem(KEY, v); } catch (e) {}
      bar.hidden = true;
      if (v === "yes") load();
    });
  });
})();
