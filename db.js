// კავშირი Supabase-ის ბაზასთან. მისამართი მოდის მხოლოდ Railway Variables-დან (DATABASE_URL).
const { Pool } = require("pg");

const url = process.env.DATABASE_URL;

const pool = url
  ? new Pool({
      connectionString: url,
      ssl: process.env.DATABASE_SSL === "off" ? false : { rejectUnauthorized: false },
      max: 5,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    })
  : null;

// ბაზასთან დროებითი გაწყვეტა სერვერს არ უნდა აჩერებდეს
if (pool) pool.on("error", (err) => console.error("ბაზის შეცდომა:", err.message));

function need() {
  if (!pool) throw new Error("DATABASE_URL არ არის მითითებული");
  return pool;
}

// ყველა სტრიქონი; ციფრები, რომლებსაც Postgres ტექსტად აბრუნებს (count, sum), ჩვენ თვითონ ვაქცევთ რიცხვად
async function all(text, params = []) {
  return (await need().query(text, params)).rows;
}
async function one(text, params = []) {
  return (await need().query(text, params)).rows[0] || null;
}
async function run(text, params = []) {
  return need().query(text, params);
}

// რამდენიმე ჩანაწერი ერთად: ან ყველა შეინახება, ან არცერთი
async function tx(fn) {
  const client = await need().connect();
  try {
    await client.query("BEGIN");
    const out = await fn({
      one: async (t, p = []) => (await client.query(t, p)).rows[0] || null,
      run: (t, p = []) => client.query(t, p),
    });
    await client.query("COMMIT");
    return out;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

// ამოწმებს კავშირს და ცხრილებს; შეცდომის ტექსტი ადამიანურ ენაზე ბრუნდება
async function dbStatus() {
  if (!pool) return { ok: false, reason: "Railway-ში DATABASE_URL ჯერ არ არის ჩაწერილი" };
  try {
    await pool.query("select 1 from settings limit 1");
    await pool.query("select 1 from users limit 1");
    return { ok: true };
  } catch (err) {
    if (err.code === "42P01") return { ok: false, reason: "ბაზა დაკავშირდა, მაგრამ ცხრილები არ არის. გაუშვი SQL ფაილები" };
    if (err.code === "28P01") return { ok: false, reason: "ბაზის პაროლი არასწორია (DATABASE_URL)" };
    console.error("dbStatus:", err.code, err.message);
    return { ok: false, reason: "ბაზასთან კავშირი ვერ დამყარდა" };
  }
}

module.exports = { pool, all, one, run, tx, dbStatus };
