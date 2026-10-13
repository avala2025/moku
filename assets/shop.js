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

  // სათამაშოს გალერეა
  var main = $("#pp-main");
  $$(".pp-gal .thumbs button").forEach(function (b) {
    b.addEventListener("click", function () {
      if (!main) return;
      main.srcset = b.getAttribute("data-srcset");
      main.src = b.getAttribute("data-src");
      main.classList.toggle("cut", b.getAttribute("data-cut") === "1");
      $$(".pp-gal .thumbs button").forEach(function (x) { x.setAttribute("aria-pressed", String(x === b)); });
    });
  });

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
