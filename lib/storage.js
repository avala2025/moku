// პანელიდან ატვირთული ფოტოები: Supabase-ის ფაილების საცავი (Storage), საჯარო საქაღალდე "products".
// საჭიროა Railway Variables: SUPABASE_URL და SUPABASE_SERVICE_ROLE_KEY.
const BASE = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const BUCKET = "products";

const ready = () => !!(BASE && KEY);
const publicBase = () => (ready() ? `${BASE}/storage/v1/object/public/${BUCKET}` : "");
const headers = (extra = {}) => ({ Authorization: "Bearer " + KEY, apikey: KEY, ...extra });

let bucketOk = false;
async function ensureBucket() {
  if (bucketOk) return;
  const r = await fetch(`${BASE}/storage/v1/bucket`, {
    method: "POST",
    headers: headers({ "Content-Type": "application/json" }),
    body: JSON.stringify({ id: BUCKET, name: BUCKET, public: true }),
    signal: AbortSignal.timeout(15000),
  });
  // უკვე არსებობს: ესეც ნორმალურია
  if (!r.ok && !/already exists|Duplicate/i.test(await r.text())) throw new Error("ფოტოების საქაღალდე ვერ შეიქმნა (" + r.status + ")");
  bucketOk = true;
}

async function upload(file, buffer, type) {
  if (!ready()) throw new Error("ფოტოების საცავი არ არის დაყენებული (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)");
  await ensureBucket();
  const r = await fetch(`${BASE}/storage/v1/object/${BUCKET}/${encodeURIComponent(file)}`, {
    method: "POST",
    headers: headers({ "Content-Type": type, "x-upsert": "true", "cache-control": "max-age=31536000" }),
    body: buffer,
    signal: AbortSignal.timeout(30000),
  });
  if (!r.ok) throw new Error("ფოტო ვერ აიტვირთა (" + r.status + ")");
}

module.exports = { ready, publicBase, upload };
