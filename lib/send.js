// ტექსტური პასუხების შეკუმშვა (gzip) და დიზაინის ფაილები ხანგრძლივი ქეშით.
const zlib = require("zlib");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

function sendText(req, res, body, type, cache = "no-cache", status = 200) {
  res.statusCode = status;
  res.setHeader("Content-Type", type);
  res.setHeader("Cache-Control", cache);
  res.setHeader("Vary", "Accept-Encoding, Cookie");
  const buf = Buffer.from(body);
  if (buf.length > 1024 && /\bgzip\b/.test(req.headers["accept-encoding"] || "")) {
    res.setHeader("Content-Encoding", "gzip");
    return res.end(zlib.gzipSync(buf, { level: 6 }));
  }
  res.end(buf);
}

// assets/ საქაღალდის ფაილები: მისამართში ვერსია (?v=...), ამიტომ ბრაუზერს შეუძლია ერთი წლით დაიმახსოვროს
const DIR = path.join(__dirname, "..", "assets");
const TYPES = { ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8" };
const files = {};
for (const f of fs.readdirSync(DIR)) {
  const data = fs.readFileSync(path.join(DIR, f));
  files[f] = { data, gz: zlib.gzipSync(data, { level: 9 }), v: crypto.createHash("sha1").update(data).digest("hex").slice(0, 10), type: TYPES[path.extname(f)] || "application/octet-stream" };
}
const assetUrl = (f) => `/a/${f}?v=${files[f].v}`;
function serveAsset(req, res) {
  const f = files[req.params.file];
  if (!f) { res.statusCode = 404; return res.end("404"); }
  res.setHeader("Content-Type", f.type);
  res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
  res.setHeader("Vary", "Accept-Encoding");
  if (/\bgzip\b/.test(req.headers["accept-encoding"] || "")) { res.setHeader("Content-Encoding", "gzip"); return res.end(f.gz); }
  res.end(f.data);
}

module.exports = { sendText, assetUrl, serveAsset };
