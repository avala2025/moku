// TEST ONLY: a stand-in for the Postgres driver that runs the same SQL on Node's built-in SQLite.
const { DatabaseSync } = require("node:sqlite");
function pgToSqlite(sql) {
  return sql
    .replace(/--[^\n]*/g, "")
    .replace(/alter table \w+\s+enable row level security;/gi, "")
    .replace(/\bserial primary key\b/gi, "integer primary key autoincrement")
    .replace(/\btimestamptz\b/gi, "text").replace(/\bjsonb\b/gi, "text").replace(/\bboolean\b/gi, "integer")
    .replace(/default now\(\)/gi, "default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))")
    .replace(/\$(\d+)/g, "?$1");
}
class Pool {
  constructor() { this.db = new DatabaseSync(process.env.TEST_SQLITE || ":memory:"); this.db.exec("PRAGMA foreign_keys = ON"); }
  on() {}
  async query(text, params = []) {
    const sql = pgToSqlite(text).trim(), args = params.map((v) => (v === true ? 1 : v === false ? 0 : v === undefined ? null : v));
    try {
      if (!args.length && /;\s*\S/.test(sql)) { this.db.exec(sql); return { rows: [] }; }
      if (/^(begin|commit|rollback)/i.test(sql)) { this.db.exec(sql); return { rows: [] }; }
      const st = this.db.prepare(sql);
      if (/^\s*(select|with)\b|\breturning\b/i.test(sql)) return { rows: st.all(...args).map((r) => ({ ...r })) };
      const r = st.run(...args); return { rows: [], rowCount: r.changes };
    } catch (e) { if (/no such table/.test(e.message)) e.code = "42P01"; throw e; }
  }
  async connect() { return { query: (t, p) => this.query(t, p), release() {} }; }
}
module.exports = { Pool };
