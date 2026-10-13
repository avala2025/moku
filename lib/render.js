// მაღაზიის გვერდები სერვერზე: მთავარი და სათამაშოს გვერდი, ქართულად და ინგლისურად.
// ტექსტი და ფოტოები პირდაპირ HTML-ში იწერება, რომ Google-მა ყველაფერი წაიკითხოს.
const { nowPrice } = require("./shop");
const storage = require("./storage");

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const CATS = ["build", "music", "role", "boards"];
const WIDTHS = [480, 960, 1400];
const ARROW = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.2" aria-hidden="true"><path d="M1 8h13M9.5 3.5 14 8l-4.5 4.5"/></svg>';
const UNDER = '<svg viewBox="0 0 300 20" preserveAspectRatio="none" aria-hidden="true"><path d="M3 13c48-9 96-10 147-6s98 5 147-3"/></svg>';
const MARK = '<svg viewBox="0 0 26 26" fill="none" stroke="currentColor" stroke-width="1" aria-hidden="true"><circle cx="13" cy="13" r="12"/><circle cx="12.4" cy="13.3" r="8"/><circle cx="11.9" cy="13.6" r="4.2"/><circle cx="11.6" cy="13.8" r="1" fill="currentColor"/></svg>';

// მისამართები
const home = (L) => (L === "en" ? "/en" : "/");
const anchor = (L, id) => (L === "en" ? "/en#" : "/#") + id;
const toyPath = (L, id) => (L === "en" ? "/en/toy/" : "/toy/") + encodeURIComponent(id);

// ფოტოები: ჩვენი ფაილები /img-ში, პანელიდან ატვირთული კი Supabase-ში ("u-" იწყება)
const imgUrl = (name, w) => (String(name).startsWith("u-") ? `${storage.publicBase()}/${name}-${w}.webp` : `/img/${name}-${w}.webp`);
const ogUrl = (base, name) => (String(name).startsWith("u-") ? `${storage.publicBase()}/${name}-1200.jpg` : `${base}/img/${name}.jpg`);
function picture(name, { alt = "", sizes = "100vw", cls = "", eager = false, extra = "" } = {}) {
  const srcset = WIDTHS.map((w) => `${imgUrl(name, w)} ${w}w`).join(", ");
  return `<img${cls ? ` class="${cls}"` : ""} src="${imgUrl(name, 960)}" srcset="${srcset}" sizes="${sizes}" alt="${esc(alt)}" width="960" height="960" decoding="async"${eager ? ' fetchpriority="high"' : ' loading="lazy"'}${extra}>`;
}

function textFor(shop, L) {
  const T = shop.T[L] || shop.T.ka;
  return (k) => String(T[k] ?? shop.T.ka[k] ?? "").replace(/\{d\}/g, shop.discount);
}
const emph = (s) => esc(s).replace(/\*(.+?)\*/g, (_, w) => `<em>${w}${UNDER}</em>`);
const priceHtml = (shop, p) => (shop.discount > 0 ? `<s>${p.old} ₾</s><b>${nowPrice(shop, p)} ₾</b>` : `<b>${p.old} ₾</b>`);

function contactLinks(shop, t) {
  const c = shop.contacts;
  const one = (k) => {
    const v = String(c[k] || "").trim();
    if (!v) return esc(t("soon"));
    const href = k === "wa" ? "https://wa.me/" + v.replace(/\D/g, "") : k === "ig" ? "https://instagram.com/" + v.replace(/^@/, "") : "tel:" + v.replace(/[^\d+]/g, "");
    return `<a href="${esc(href)}"${k === "phone" ? "" : ' target="_blank" rel="noopener"'}>${esc(v)}</a>`;
  };
  return { wa: one("wa"), ig: one("ig"), phone: one("phone") };
}

// ---------- ჩარჩო: head, header, footer ----------
function shell({ L, t, shop, base, path, alt, title, desc, image, type = "website", jsonld = [], body, admin, assets }) {
  const url = base + path;
  const a = shop.analytics || {};
  return `<!doctype html>
<html lang="${L}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${esc(url)}">
<link rel="alternate" hreflang="ka" href="${esc(base + alt.ka)}">
<link rel="alternate" hreflang="en" href="${esc(base + alt.en)}">
<link rel="alternate" hreflang="x-default" href="${esc(base + alt.ka)}">
<meta property="og:type" content="${type}">
<meta property="og:site_name" content="MOKU">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${esc(url)}">
<meta property="og:image" content="${esc(image)}">
<meta property="og:locale" content="${L === "en" ? "en_US" : "ka_GE"}">
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#f2f0eb">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="icon" href="/favicon-32.png" sizes="32x32" type="image/png">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="manifest" href="/site.webmanifest">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;1,300&family=Jost:wght@300;400&family=Noto+Sans+Georgian:wght@300;400&family=Noto+Serif+Georgian:wdth,wght@62.5..100,300..400&display=swap">
<link rel="stylesheet" href="${assets.css}">
${jsonld.map((j) => `<script type="application/ld+json">${JSON.stringify(j).replace(/</g, "\\u003c")}</script>`).join("\n")}
</head>
<body data-ga="${esc(a.ga || "")}" data-px="${esc(a.pixel || "")}" data-lang="${L}">
<a class="skip" href="#top">${L === "en" ? "Skip to content" : "შინაარსზე გადასვლა"}</a>
<div class="topline">${esc(t("top"))}</div>
<header>
  <div class="wrap bar">
    <nav aria-label="${L === "en" ? "Main" : "მთავარი მენიუ"}">
      <a href="${anchor(L, "collection")}">${esc(t("nav1"))}</a>
      <a href="${anchor(L, "story")}">${esc(t("nav2"))}</a>
      <a href="${anchor(L, "order")}">${esc(t("nav3"))}</a>
    </nav>
    <a class="brand" href="${home(L)}" aria-label="MOKU">${MARK}MOKU</a>
    <div class="lang" aria-label="Language">
      <a href="${esc(alt.ka)}" hreflang="ka" lang="ka"${L === "ka" ? ' aria-current="true"' : ""}>ქარ</a>
      <a href="${esc(alt.en)}" hreflang="en" lang="en"${L === "en" ? ' aria-current="true"' : ""}>ENG</a>
    </div>
  </div>
</header>
${body}
<footer>
  <div class="wrap">
    <div class="foot">
      <p>${esc(t("footText"))}</p>
      <nav aria-label="Footer">
        <a href="${anchor(L, "collection")}">${esc(t("nav1"))}</a>
        <a href="${anchor(L, "story")}">${esc(t("nav2"))}</a>
        <a href="${anchor(L, "order")}">${esc(t("nav3"))}</a>
      </nav>
    </div>
    <div class="giant" aria-hidden="true">MOKU</div>
    <div class="fine"><span>© ${new Date().getFullYear()} MOKU</span><span>${esc(t("foot"))}</span></div>
  </div>
</footer>
<div class="consent" id="consent" hidden role="region" aria-label="cookies">
  <p>${esc(t("consentText"))}</p>
  <div><button type="button" class="btn ghost" data-consent="no">${esc(t("consentNo"))}</button><button type="button" class="btn" data-consent="yes">${esc(t("consentOk"))}</button></div>
</div>
<script src="${assets.js}" defer></script>
${admin ? `<script src="${assets.panel}" defer></script>` : ""}
</body>
</html>`;
}

// ---------- ბარათი ----------
function card(shop, L, t, p, n, wide) {
  const [a, b] = p.imgs, name = p[L][0] || p.ka[0];
  const sizes = wide ? "(max-width: 900px) 100vw, 66vw" : "(max-width: 480px) 100vw, (max-width: 900px) 50vw, 33vw";
  return `<a class="card${wide ? " wide" : ""}" href="${toyPath(L, p.id)}" data-cat="${esc(p.cat)}">
      <div class="plinth" style="--tint:var(${esc(p.tint || "--birch")})">
        <span class="no">N° ${String(n).padStart(2, "0")}</span>
        ${a ? picture(a[0], { alt: name, sizes, cls: `${a[1] ? "cut" : ""}${b ? " has-alt" : ""}`.trim() }) : ""}
        ${b ? picture(b[0], { sizes, cls: `alt${b[1] ? " cut" : ""}` }) : ""}
        ${shop.discount > 0 ? `<span class="off">−${shop.discount}%</span>` : ""}
        <span class="peek">${esc(t("view"))}${ARROW}</span>
      </div>
      <div class="meta"><h3>${esc(name)}</h3><span>${esc(t(p.cat))}</span></div>
      <div class="pr">${priceHtml(shop, p)}</div>
    </a>`;
}
function gridCards(shop, L, t, list) {
  const r = list.length % 3;
  return list.map((p, i) => card(shop, L, t, p, i + 1, (r && i === 0) || (r === 1 && i === list.length - 1))).join("\n");
}

// წლის რგოლები: ოდნავ გადაწეული ცენტრით და არათანაბარი დაშორებით, როგორც ნამდვილ ხის ჭრილში
const RINGS = Array.from({ length: 15 }, (_, i) => { const r = 96 - i * 4.6 - (i % 3) * 1.1; return `<ellipse cx="${100 - i * 0.5}" cy="${100 + i * 0.35}" rx="${r.toFixed(2)}" ry="${(r * (0.965 + (i % 4) * 0.008)).toFixed(2)}" transform="rotate(${i * 7} 100 100)"/>`; }).join("");

// ---------- მთავარი გვერდი ----------
function homePage({ shop, L, base, admin, assets }) {
  const t = textFor(shop, L), list = shop.products.filter((p) => !p.hidden), c = contactLinks(shop, t);
  const band = t("band").split("|").map((w) => `<span>${esc(w.trim()).replace(/\*(.+?)\*/g, "<i>$1</i>")}</span>`).join("");
  const walker = list.find((p) => p.id === "walker");
  const title = t("seoTitle"), desc = t("seoDesc");
  const jsonld = [
    { "@context": "https://schema.org", "@type": "Organization", name: "MOKU", url: base + "/", logo: base + "/icon-512.png" },
    { "@context": "https://schema.org", "@type": "WebSite", name: "MOKU", url: base + home(L), inLanguage: L },
    { "@context": "https://schema.org", "@type": "ItemList", itemListElement: list.map((p, i) => ({ "@type": "ListItem", position: i + 1, url: base + toyPath(L, p.id), name: p[L][0] || p.ka[0] })) },
  ];
  const body = `<main id="top">
  <div class="wrap hero">
    <div>
      <span class="eyebrow">${esc(t("heroEyebrow"))}</span>
      <h1>${emph(t("heroTitle"))}</h1>
      <p>${esc(t("heroText"))}</p>
      <div class="cta">
        <a class="btn" href="#collection"><span>${esc(t("heroCta"))}</span>${ARROW}</a>
        <a class="link" href="#story">${esc(t("heroLink"))}</a>
      </div>
    </div>
    <div class="hero-art">
      <div class="sun"></div>
      <div class="arch">${picture("driver", { alt: t("heroAlt"), sizes: "(max-width: 860px) 92vw, 46vw", eager: true })}</div>
      <div class="float">${picture("table", { sizes: "(max-width: 860px) 40vw, 20vw", cls: "cut" })}</div>
      <div class="seal" aria-hidden="true">
        <svg class="ring" viewBox="0 0 100 100"><defs><path id="c" d="M50 50m-38 0a38 38 0 1 1 76 0a38 38 0 1 1-76 0"/></defs><text><textPath href="#c">${esc(t("seal"))}</textPath></text></svg>
        <b>木</b>
      </div>
    </div>
  </div>

  <div class="band" aria-hidden="true"><div>${band + band + band + band}</div></div>

  <section id="collection">
    <div class="wrap">
      <div class="head rv">
        <div><span class="eyebrow">${esc(t("colEyebrow"))}</span><h2>${esc(t("colTitle"))}<sup>(${list.length})</sup></h2></div>
        <div class="chips" role="group" aria-label="${esc(t("all"))}">${["all", ...CATS].map((k) => `<button type="button" data-c2="${k}" aria-pressed="${k === "all"}">${esc(t(k))}</button>`).join("")}</div>
      </div>
      <div class="grid" id="grid">
${gridCards(shop, L, t, list)}
      </div>
    </div>
  </section>

  <section class="room">
    <div class="wrap">
      <div class="frame rv">${picture(walker && walker.imgs[1] ? walker.imgs[1][0] : "walker", { alt: t("roomAlt"), sizes: "(max-width: 820px) 92vw, 40vw" })}</div>
      <div class="rv">
        <span class="eyebrow">${esc(t("roomEyebrow"))}</span>
        <h2>${esc(t("roomTitle"))}</h2>
        <p>${esc(t("roomText"))}</p>
        <a class="btn ghost" href="${walker ? toyPath(L, "walker") : "#collection"}"><span>${esc(t("roomCta"))}</span>${ARROW}</a>
      </div>
    </div>
  </section>

  <section class="story" id="story">
    <div class="wrap">
      <div class="rings rv" aria-hidden="true">
        <svg viewBox="0 0 200 200">${RINGS}</svg>
        <span class="kanji">木</span><small>moku · wood · ხე</small>
      </div>
      <div class="rv">
        <span class="eyebrow">${esc(t("stEyebrow"))}</span>
        <h2>${esc(t("stTitle"))}</h2>
        <p>${esc(t("st1"))}</p>
        <p>${esc(t("st2"))}</p>
        <div class="facts">
          <div><svg viewBox="0 0 30 30" aria-hidden="true"><path d="M15 27V12M15 12c0-5 3-8 9-9 0 6-3 9-9 9ZM15 17c0-4-2.5-6-8-7 0 5 3 7 8 7Z"/></svg><b>${esc(t("n1t"))}</b><span>${esc(t("n1"))}</span></div>
          <div><svg viewBox="0 0 30 30" aria-hidden="true"><path d="M5 25h20M8 25V14l7-6 7 6v11M12.5 25v-6h5v6"/></svg><b>${esc(t("n2t"))}</b><span>${esc(t("n2"))}</span></div>
          <div><svg viewBox="0 0 30 30" aria-hidden="true"><path d="M4 10l11-5l11 5v11l-11 5l-11-5Z"/><path d="M4 10l11 5l11-5M15 15v11"/></svg><b>${esc(t("n3t"))}</b><span>${esc(t("n3"))}</span></div>
        </div>
      </div>
    </div>
  </section>

  <section class="order" id="order">
    <div class="wrap">
      <div class="head rv"><div><span class="eyebrow">${esc(t("orEyebrow"))}</span><h2>${esc(t("orTitle"))}</h2></div></div>
      <ol class="steps rv">
        <li><i>1</i><h3>${esc(t("s1t"))}</h3><p>${esc(t("s1"))}</p></li>
        <li><i>2</i><h3>${esc(t("s2t"))}</h3><p>${esc(t("s2"))}</p></li>
        <li><i>3</i><h3>${esc(t("s3t"))}</h3><p>${esc(t("s3"))}</p></li>
      </ol>
      <div class="contact rv">
        <div><b>WhatsApp</b><span>${c.wa}</span></div>
        <div><b>Instagram</b><span>${c.ig}</span></div>
        <div><b>${esc(t("phone"))}</b><span>${c.phone}</span></div>
      </div>
    </div>
  </section>
</main>`;
  return shell({ L, t, shop, base, path: home(L), alt: { ka: "/", en: "/en" }, title, desc, image: base + "/img/og.jpg", jsonld, body, admin, assets });
}

// ---------- სათამაშოს გვერდი ----------
function toyPage({ shop, L, base, p, avail, admin, assets }) {
  const t = textFor(shop, L), [name, desc, mat, size] = [0, 1, 2, 3].map((i) => p[L][i] || (i === 0 ? p.ka[0] : ""));
  const price = nowPrice(shop, p), msg = t("orderT").replace("{n}", name).replace("{p}", price);
  const wa = String(shop.contacts.wa || "").replace(/\D/g, "");
  const imgs = p.imgs.length ? p.imgs : [];
  const others = shop.products.filter((x) => !x.hidden && x.id !== p.id);
  const similar = [...others.filter((x) => x.cat === p.cat), ...others.filter((x) => x.cat !== p.cat)].slice(0, 3);
  const path = toyPath(L, p.id), url = base + path;
  const shortDesc = (desc || t("seoDesc")).slice(0, 158);
  const offer = { "@type": "Offer", price: String(price), priceCurrency: "GEL", url, itemCondition: "https://schema.org/NewCondition" };
  if (avail === true) offer.availability = "https://schema.org/InStock";
  if (avail === false) offer.availability = "https://schema.org/OutOfStock";
  const jsonld = [
    { "@context": "https://schema.org", "@type": "Product", name, description: desc || undefined, sku: p.id, brand: { "@type": "Brand", name: "MOKU" }, image: imgs.map((x) => ogUrl(base, x[0])), material: mat || undefined, offers: offer },
    { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [
      { "@type": "ListItem", position: 1, name: "MOKU", item: base + home(L) },
      { "@type": "ListItem", position: 2, name: t(p.cat), item: base + anchor(L, "collection") },
      { "@type": "ListItem", position: 3, name, item: url },
    ] },
  ];
  const thumbs = imgs.length > 1 ? `<div class="thumbs" role="group" aria-label="${L === "en" ? "Photos" : "ფოტოები"}">${imgs.map((x, k) =>
    `<button type="button" data-k="${k}" aria-pressed="${k === 0}" data-src="${imgUrl(x[0], 960)}" data-srcset="${WIDTHS.map((w) => `${imgUrl(x[0], w)} ${w}w`).join(", ")}" data-cut="${x[1] ? 1 : 0}" aria-label="${k + 1}">${picture(x[0], { sizes: "80px" })}</button>`).join("")}</div>` : "";
  const body = `<main id="top" class="pp">
  <div class="wrap">
    <a class="back" href="${anchor(L, "collection")}">← ${esc(t("back"))}</a>
    <div class="pp-grid">
      <div class="pp-gal">
        <div class="pp-shot" style="--tint:var(${esc(p.tint || "--birch")})">${imgs[0] ? picture(imgs[0][0], { alt: name, sizes: "(max-width: 860px) 92vw, 52vw", cls: imgs[0][1] ? "cut" : "", eager: true, extra: ' id="pp-main"' }) : ""}</div>
        ${thumbs}
      </div>
      <div class="pp-info">
        <span class="eyebrow">${esc(t(p.cat))}</span>
        <h1>${esc(name)}</h1>
        <div class="pp-price">${priceHtml(shop, p)}${shop.discount > 0 ? `<i>−${shop.discount}%</i>` : ""}</div>
        ${desc ? `<p>${esc(desc)}</p>` : ""}
        <dl>
          ${mat ? `<dt>${esc(t("material"))}</dt><dd>${esc(mat)}</dd>` : ""}
          ${size ? `<dt>${esc(t("size"))}</dt><dd>${esc(size)}</dd>` : ""}
          <dt>${esc(t("delivery"))}</dt><dd>${esc(t("deliveryV"))}</dd>
        </dl>
        <div class="msg" id="p-msg">${esc(msg)}</div>
        <div class="actions">
          ${wa ? `<a class="btn" href="https://wa.me/${wa}?text=${encodeURIComponent(msg)}" target="_blank" rel="noopener">${esc(t("waBtn"))}</a>` : ""}
          <button class="btn${wa ? " ghost" : ""}" type="button" id="copy" data-ok="${esc(t("copied"))}" data-fail="${esc(t("copyFail"))}">${esc(t("copy"))}</button>
          <a class="btn ghost" href="${anchor(L, "order")}">${esc(t("how"))}</a>
        </div>
        <div class="toast" id="toast" role="status"></div>
      </div>
    </div>
  </div>
  ${similar.length ? `<section class="similar"><div class="wrap"><div class="head"><div><h2>${esc(t("similar"))}</h2></div></div><div class="grid">${similar.map((x, i) => card(shop, L, t, x, shop.products.filter((y) => !y.hidden).indexOf(x) + 1, false)).join("\n")}</div></div></section>` : ""}
</main>`;
  return shell({ L, t, shop, base, path, alt: { ka: toyPath("ka", p.id), en: toyPath("en", p.id) }, title: `${name} · MOKU`, desc: shortDesc, image: imgs[0] ? ogUrl(base, imgs[0][0]) : base + "/img/og.jpg", type: "product", jsonld, body, admin, assets });
}

function notFound({ shop, L, base, assets }) {
  const t = textFor(shop, L);
  const body = `<main id="top" class="pp"><div class="wrap nf"><h1>404</h1><p>${L === "en" ? "This page does not exist." : "ეს გვერდი არ არსებობს."}</p><a class="btn" href="${anchor(L, "collection")}">${esc(t("back"))}</a></div></main>`;
  return shell({ L, t, shop, base, path: home(L), alt: { ka: "/", en: "/en" }, title: "404 · MOKU", desc: t("seoDesc"), image: base + "/img/og.jpg", body, admin: false, assets });
}

function sitemap({ shop, base }) {
  const last = shop.updatedAt ? `<lastmod>${shop.updatedAt.slice(0, 10)}</lastmod>` : "";
  const pair = (ka, en) => [ka, en].map((loc) => `<url><loc>${esc(base + loc)}</loc>${last}<xhtml:link rel="alternate" hreflang="ka" href="${esc(base + ka)}"/><xhtml:link rel="alternate" hreflang="en" href="${esc(base + en)}"/></url>`).join("");
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${pair("/", "/en")}
${shop.products.filter((p) => !p.hidden).map((p) => pair(toyPath("ka", p.id), toyPath("en", p.id))).join("\n")}
</urlset>`;
}

module.exports = { homePage, toyPage, notFound, sitemap, imgUrl };
