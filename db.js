// კავშირი Supabase-ის ბაზასთან. მისამართი მოდის მხოლოდ Railway Variables-დან (DATABASE_URL).
const { Pool } = require("pg");

const url = process.env.DATABASE_URL;

const pool = url
  ? new Pool({
      connectionString: url,
      ssl: { rejectUnauthorized: false },
      max: 5,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    })
  : null;

// ბაზასთან დროებითი გაწყვეტა სერვერს არ უნდა აჩერებდეს
if (pool) pool.on("error", (err) => console.error("ბაზის შეცდომა:", err.message));

function query(text, params) {
  if (!pool) throw new Error("DATABASE_URL არ არის მითითებული");
  return pool.query(text, params);
}

// ამოწმებს კავშირს და პირველ ცხრილს; შეცდომის ტექსტი ადამიანურ ენაზე ბრუნდება
async function dbStatus() {
  if (!pool) return { ok: false, reason: "Railway-ში DATABASE_URL ჯერ არ არის ჩაწერილი" };
  try {
    const r = await pool.query("select value from settings where key = 'site_name'");
    return { ok: true, siteName: r.rows[0] ? r.rows[0].value : null };
  } catch (err) {
    if (err.code === "42P01") return { ok: false, reason: "ბაზა დაკავშირდა, მაგრამ ცხრილი არ არის. გაუშვი sql/001_settings.sql" };
    if (err.code === "28P01") return { ok: false, reason: "ბაზის პაროლი არასწორია (DATABASE_URL)" };
    console.error("dbStatus:", err.code, err.message);
    return { ok: false, reason: "ბაზასთან კავშირი ვერ დამყარდა" };
  }
}

module.exports = { pool, query, dbStatus };
