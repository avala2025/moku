// პაროლები და შესვლა. პაროლი ბაზაში დაშიფრულად ინახება (scrypt), შესვლა კი ხელმოწერილი cookie-ით მოწმდება.
const crypto = require("crypto");

const PROD = process.env.NODE_ENV === "production";
const SECRET = process.env.SESSION_SECRET || "";
if (PROD && SECRET.length < 24) {
  console.error("SESSION_SECRET არ არის ან ძალიან მოკლეა (მინიმუმ 24 სიმბოლო). დაამატე Railway Variables-ში.");
  process.exit(1);
}
const secret = SECRET || crypto.randomBytes(32).toString("hex");
const COOKIE = "moku";
const DAYS = 14;

function hash(pw, salt = crypto.randomBytes(16).toString("hex")) {
  return salt + ":" + crypto.scryptSync(String(pw), salt, 32).toString("hex");
}
function verify(pw, stored) {
  const [salt, h] = String(stored || "").split(":");
  if (!salt || !h) return false;
  const a = Buffer.from(h, "hex");
  const b = crypto.scryptSync(String(pw), salt, 32);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

const sign = (s) => crypto.createHmac("sha256", secret).update(s).digest("base64url");
function makeToken(uid, ver = 0) {
  const body = Buffer.from(JSON.stringify({ uid, v: ver, exp: Date.now() + DAYS * 864e5 })).toString("base64url");
  return body + "." + sign(body);
}
function readToken(t) {
  const [body, sig] = String(t || "").split(".");
  if (!body || !sig) return null;
  const good = sign(body);
  if (sig.length !== good.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(good))) return null;
  try {
    const d = JSON.parse(Buffer.from(body, "base64url"));
    return d.exp > Date.now() ? { uid: d.uid, v: Number(d.v) || 0 } : null;
  } catch {
    return null;
  }
}

function readCookie(req) {
  const c = (req.headers.cookie || "").split(/;\s*/).find((x) => x.startsWith(COOKIE + "="));
  return c ? decodeURIComponent(c.slice(COOKIE.length + 1)) : "";
}
function setCookie(res, value, maxAge) {
  res.setHeader("Set-Cookie", `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${PROD ? "; Secure" : ""}`);
}
const login = (res, uid, ver = 0) => setCookie(res, makeToken(uid, ver), DAYS * 86400);
const logout = (res) => setCookie(res, "", 0);
// შესვლის ჩანაწერი: { uid, v }. v = "სესიის ვერსია": „ყველგან გამოსვლა“, გათიშვა ან პაროლის შეცვლა მას ზრდის და ძველი შესვლები უქმდება
const sessionFrom = (req) => readToken(readCookie(req));
const userIdFrom = (req) => (sessionFrom(req) || {}).uid || null;

// შესვლის მცდელობების შეზღუდვა: 10 წარუმატებელი ცდა 10 წუთში ერთი მისამართიდან
const tries = new Map();
function throttled(ip) {
  const recent = (tries.get(ip) || []).filter((x) => Date.now() - x < 10 * 60e3);
  tries.set(ip, recent);
  return recent.length >= 10;
}
const failed = (ip) => (tries.get(ip) || tries.set(ip, []).get(ip)).push(Date.now());

module.exports = { sessionFrom, hash, verify, login, logout, userIdFrom, throttled, failed };
