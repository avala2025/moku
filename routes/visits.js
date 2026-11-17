// საიტის სტატისტიკა: ვინ შემოვიდა, საიდან, რა ნახა, რას დააჭირა. უსახელოდ: არც IP, არც cookie, არც სახელი.
// თანამშრომლების (სისტემაში შესულების) ვიზიტი არ ითვლება. ნახვა მხოლოდ ადმინს შეუძლია.
const db = require("../db");
const auth = require("../lib/auth");

const BOT = /bot|crawl|spider|slurp|preview|facebookexternalhit|headless|lighthouse|pingdom|uptime|curl|wget|python|axios|node-fetch|go-http/i;
const KINDS = ["view", "click", "leave"];
const clip = (v, n) => String(v ?? "").slice(0, n);
const tbNow = () => { const d = new Date(Date.now() + 4 * 36e5); return { day: d.toISOString().slice(0, 10), hr: d.getUTCHours() }; };
const tbDay = (plus = 0) => new Date(Date.now() + 4 * 36e5 + plus * 864e5).toISOString().slice(0, 10);
const isDay = (s) => /^\d{4}-\d\d-\d\d$/.test(String(s || ""));

function device(ua) { return /iPad|Tablet|PlayBook|Silk|Android(?!.*Mobile)/i.test(ua) ? "tablet" : /Mobi|iPhone|iPod|Android/i.test(ua) ? "mobile" : "desktop"; }
function osOf(ua) { return /iPhone|iPad|iPod/i.test(ua) ? "iOS" : /Android/i.test(ua) ? "Android" : /Windows/i.test(ua) ? "Windows" : /Mac OS X|Macintosh/i.test(ua) ? "Mac" : /Linux/i.test(ua) ? "Linux" : "სხვა"; }
// საიდან მოვიდა: utm_source > ფეისბუქის/გუგლის რეკლამის ნიშანი > წინა საიტი > პირდაპირ
function source(s) {
  s = s && typeof s === "object" ? s : {};
  const u = clip(s.u, 40).toLowerCase().trim(), r = clip(s.r, 80).toLowerCase().replace(/^www\.|^m\.|^l\.|^lm\./, "");
  const named = (x) => /facebook|^fb\b|fb\.com|fb\.me/.test(x) ? "Facebook" : /instagram|^ig$/.test(x) ? "Instagram" : /google/.test(x) ? "Google" : /tiktok/.test(x) ? "TikTok" : /youtube|youtu\.be/.test(x) ? "YouTube" : /bing/.test(x) ? "Bing" : /yandex/.test(x) ? "Yandex" : /whatsapp|wa\.me/.test(x) ? "WhatsApp" : /t\.me|telegram/.test(x) ? "Telegram" : /viber/.test(x) ? "Viber" : /linkedin|lnkd/.test(x) ? "LinkedIn" : /pinterest/.test(x) ? "Pinterest" : "";
  if (u) return named(u) || u;
  if (s.f) return r && /instagram/.test(r) ? "Instagram" : "Facebook";
  if (s.g) return "Google";
  if (r) return named(r) || r;
  return "direct";
}

module.exports = function visits(app, { h, need, fail, getShop }) {
  const admin = async (req) => { const u = await need(req); if (u.role !== "admin") fail(403, "ეს მხოლოდ ადმინისთვისაა."); return u; };

  // ერთი მისამართიდან მაქსიმუმ 600 მოვლენა 10 წუთში (შემთხვევითი ან ცუდი ნაკადისგან დაცვა)
  const seen = new Map();
  const tooMany = (ip, n) => { const now = Date.now(), r = (seen.get(ip) || []).filter((x) => now - x[0] < 600e3); const sum = r.reduce((a, x) => a + x[1], 0); if (sum + n > 600) return true; r.push([now, n]); seen.set(ip, r); if (seen.size > 5000) seen.clear(); return false; };
  let cleanAt = 0;

  // ბრაუზერი აგზავნის text/plain-ს (sendBeacon), ამიტომ ტანს თვითონ ვკითხულობთ
  app.post("/t", (req, res) => {
    let raw = "", big = false;
    req.on("data", (c) => { raw += c; if (raw.length > 16000) { big = true; req.destroy(); } });
    req.on("end", async () => {
      res.statusCode = 204; res.end();
      try {
        if (big) return;
        const ua = String(req.headers["user-agent"] || "");
        if (!ua || BOT.test(ua) || auth.sessionFrom(req)) return; // რობოტი ან თანამშრომელი
        const b = JSON.parse(raw || "{}"), sid = clip(b.sid, 40);
        if (!/^[a-z0-9]{8,40}$/i.test(sid) || !Array.isArray(b.ev) || !b.ev.length) return;
        const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket.remoteAddress || "?";
        const ev = b.ev.slice(0, 40).filter((e) => e && KINDS.includes(e.k));
        if (!ev.length || tooMany(ip, ev.length)) return;
        const { day, hr } = tbNow(), at = new Date().toISOString(), dev = device(ua), os = osOf(ua), src = clip(source(b.src), 60), camp = clip(b.src && b.src.c, 60);
        const lang = b.lang === "en" ? "en" : "ka", ret = b.ret ? 1 : 0;
        const vals = [], args = [];
        for (const e of ev) {
          const path = clip(e.p, 120).replace(/[^\w\-/.]/g, ""), m = /^\/(?:en\/)?toy\/([a-z0-9_-]{1,60})/i.exec(path);
          const pid = /^[a-z0-9_-]{1,60}$/i.test(String(e.pid || "")) ? String(e.pid) : m ? m[1] : "";
          const label = /^[a-z0-9_:.\-]{1,40}$/i.test(String(e.l || "")) ? String(e.l) : "";
          if (e.k === "click" && !label) continue;
          const secs = e.k === "leave" ? Math.max(0, Math.min(1800, Math.round(Number(e.s) || 0))) : 0, depth = e.k === "leave" ? Math.max(0, Math.min(100, Math.round(Number(e.d) || 0))) : 0;
          if (e.k === "leave" && !secs) continue;
          const row = [at, day, hr, sid, e.k, path, pid, label, lang, dev, os, src, camp, ret, secs, depth];
          vals.push("(" + row.map((_, k) => "$" + (args.length + k + 1)).join(",") + ")"); args.push(...row);
        }
        if (!vals.length) return;
        await db.run("insert into hits (at, day, hr, sid, kind, path, pid, label, lang, dev, os, src, camp, ret, secs, depth) values " + vals.join(","), args);
        // 13 თვეზე ძველი ჩანაწერები იშლება (დღეში ერთხელ)
        if (Date.now() - cleanAt > 864e5) { cleanAt = Date.now(); await db.run("delete from hits where day < $1", [tbDay(-400)]); }
      } catch (e) { if (!(e instanceof SyntaxError)) console.error("stat:", e.message); }
    });
  });

  // ადმინისთვის: პერიოდის ჯამები
  app.get("/api/visits", h(async (req, res) => {
    await admin(req);
    const to = isDay(req.query.to) ? req.query.to : tbDay(0), from = isDay(req.query.from) && req.query.from <= to ? req.query.from : tbDay(-6);
    const P = [from, to], W = "day >= $1 and day <= $2";
    const q = (sql, extra = []) => db.all(sql, [...P, ...extra]);
    const n = (r, ...k) => { k.forEach((x) => (r[x] = Number(r[x]) || 0)); return r; };
    const INTENT = "(label like 'order_%' or label like 'contact_%')", ORDER = "label like 'order_%'";
    const tot = n((await q(`select count(distinct sid) as v, sum(case when kind = 'view' then 1 else 0 end) as pv, count(distinct case when ret = 1 then sid end) as ret,
      count(distinct case when kind = 'view' and pid <> '' then sid end) as pview, count(distinct case when ${INTENT} then sid end) as intent, count(distinct case when ${ORDER} then sid end) as orderc,
      count(distinct case when dev = 'mobile' then sid end) as mob from hits where ${W}`))[0] || {}, "v", "pv", "ret", "pview", "intent", "orderc", "mob");
    const t = (await q(`select avg(t) as a from (select sid, sum(secs) as t from hits where ${W} and kind = 'leave' group by sid) x`))[0];
    tot.secs = Math.round(Number(t && t.a) || 0);
    const d = (await q(`select avg(depth) as a from hits where ${W} and kind = 'leave' and path not like '/admin%'`))[0];
    tot.depth = Math.round(Number(d && d.a) || 0);
    const days = (await q(`select day, count(distinct sid) as v, sum(case when kind = 'view' then 1 else 0 end) as pv, count(distinct case when ${INTENT} then sid end) as intent from hits where ${W} group by day order by day`)).map((r) => n(r, "v", "pv", "intent"));
    const srcs = (await q(`select src, count(distinct sid) as v, count(distinct case when ${INTENT} then sid end) as intent from hits where ${W} group by src order by v desc limit 30`)).map((r) => n(r, "v", "intent"));
    const camps = (await q(`select src, camp, count(distinct sid) as v, count(distinct case when ${INTENT} then sid end) as intent from hits where ${W} and camp <> '' group by src, camp order by v desc limit 20`)).map((r) => n(r, "v", "intent"));
    const prods = (await q(`select pid, sum(case when kind = 'view' then 1 else 0 end) as views, count(distinct case when kind = 'view' then sid end) as v,
      count(distinct case when ${ORDER} then sid end) as orderc, sum(case when label = 'gallery' then 1 else 0 end) as gal, count(distinct case when label = 'toy_card' then sid end) as cards
      from hits where ${W} and pid <> '' group by pid order by v desc`)).map((r) => n(r, "views", "v", "orderc", "gal", "cards"));
    const clicks = (await q(`select label, count(*) as c, count(distinct sid) as v from hits where ${W} and kind = 'click' group by label order by c desc limit 40`)).map((r) => n(r, "c", "v"));
    const group = async (col) => (await q(`select ${col} as k, count(distinct sid) as v from hits where ${W} group by ${col} order by v desc`)).map((r) => n(r, "v"));
    const pages = (await q(`select path, count(*) as c, count(distinct sid) as v from hits where ${W} and kind = 'view' group by path order by c desc limit 25`)).map((r) => n(r, "c", "v"));
    const live = n((await db.all("select count(distinct sid) as v from hits where at >= $1", [new Date(Date.now() - 5 * 60e3).toISOString()]))[0] || {}, "v").v;
    // სისტემაში გაფორმებული შეკვეთები იმავე პერიოდში (საიტიდან თუ სხვა გზით, ერთად)
    const fromIso = new Date(Date.parse(from + "T00:00:00Z") - 4 * 36e5).toISOString(), toIso = new Date(Date.parse(to + "T00:00:00Z") + 20 * 36e5).toISOString();
    const ord = n((await db.all("select count(*) as c from orders where created >= $1 and created < $2 and status <> 'cancelled'", [fromIso, toIso]))[0] || {}, "c").c;
    const first = (await db.all("select min(day) as d from hits"))[0];
    const shop = await getShop(), T = shop.T.ka || {};
    const names = Object.fromEntries(shop.products.map((p) => [p.id, p.ka[0] + (p.ka[4] ? " · " + String(p.ka[4]).split(":")[0].trim().slice(0, 40) : "")]));
    res.json({ from, to, today: tbDay(0), since: (first && first.d) || "", live, tot, days, srcs, camps, prods: prods.map((p) => ({ ...p, name: names[p.pid] || p.pid })), clicks,
      dev: await group("dev"), os: await group("os"), lang: await group("lang"), hours: await group("hr"), pages, orders: ord,
      cats: Object.fromEntries(["all", ...new Set(shop.products.map((p) => p.cat))].map((k) => [k, T[k] || k])), pnames: names });
  }));
};
