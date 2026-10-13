// TEST ONLY: a tiny stand-in for Express, so the real server.js runs here without downloading packages.
// It covers only what MOKU uses. Production always uses real Express from npm.
const http = require("http"), fs = require("fs"), path = require("path");
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".jpg": "image/jpeg", ".png": "image/png", ".svg": "image/svg+xml", ".json": "application/json" };
function match(pattern, p) {
  const pats = Array.isArray(pattern) ? pattern : [pattern];
  for (const pat of pats) {
    const a = pat.split("/"), b = p.split("/");
    if (a.length !== b.length) continue;
    const params = {}; let ok = true;
    a.forEach((seg, i) => { if (seg.startsWith(":")) params[seg.slice(1)] = decodeURIComponent(b[i]); else if (seg !== b[i]) ok = false; });
    if (ok) return params;
  }
  return null;
}
function express() {
  const stack = [];
  const app = (req, res) => {
    const u = new URL(req.url, "http://x"); req.path = u.pathname; req.query = Object.fromEntries(u.searchParams); req.body = req.body || {};
    res.status = (c) => { res.statusCode = c; return res; };
    res.json = (d) => { if (!res.getHeader("Content-Type")) res.setHeader("Content-Type", "application/json; charset=utf-8"); res.end(JSON.stringify(d)); };
    res.send = (d) => { if (!res.getHeader("Content-Type")) res.setHeader("Content-Type", "text/html; charset=utf-8"); res.end(d); };
    res.sendFile = (f) => fs.readFile(f, (e, data) => { if (e) { res.statusCode = 404; return res.end(); } res.setHeader("Content-Type", TYPES[path.extname(f)] || "application/octet-stream"); res.end(data); });
    let i = 0;
    const next = (err) => {
      if (err) { console.error(err); res.statusCode = 500; return res.end("error"); }
      const l = stack[i++]; if (!l) { res.statusCode = 404; return res.end("404"); }
      if (l.method && l.method !== req.method) return next();
      if (l.prefix !== undefined) { if (!(req.path === l.prefix || req.path.startsWith(l.prefix === "/" ? "/" : l.prefix + "/"))) return next(); }
      else { const ps = match(l.route, req.path); if (!ps) return next(); req.params = ps; }
      try { const r = l.fn(req, res, next); if (r && r.catch) r.catch(next); } catch (e) { next(e); }
    };
    next();
  };
  app.use = (a, b) => (typeof a === "function" ? stack.push({ prefix: "/", fn: a }) : stack.push({ prefix: a, fn: b }));
  // a route may have several handlers (e.g. express.raw(), then the handler): chain them
  const chain = (fns) => (req, res, next) => { let k = 0; const step = (err) => { if (err) return next(err); const f = fns[k++]; if (!f) return next(); try { const r = f(req, res, step); if (r && r.catch) r.catch(next); } catch (e) { next(e); } }; step(); };
  app.get = (route, ...fns) => stack.push({ method: "GET", route, fn: chain(fns) });
  app.post = (route, ...fns) => stack.push({ method: "POST", route, fn: chain(fns) });
  app.disable = app.set = () => {};
  app.listen = (port, cb) => http.createServer(app).listen(port, cb);
  return app;
}
express.json = () => (req, res, next) => {
  if (req.method === "GET" || !/json/.test(req.headers["content-type"] || "")) return next();
  let s = ""; req.on("data", (c) => (s += c)); req.on("end", () => { try { req.body = s ? JSON.parse(s) : {}; next(); } catch (e) { res.statusCode = 400; res.end("bad json"); } });
};
express.raw = (opts = {}) => (req, res, next) => {
  const types = [].concat(opts.type || []), ct = String(req.headers["content-type"] || "").split(";")[0];
  if (!types.includes(ct)) return next();
  const parts = []; req.on("data", (c) => parts.push(c)); req.on("end", () => { req.body = Buffer.concat(parts); next(); });
};
express.static = (dir, opts = {}) => (req, res, next) => {
  if (req.method !== "GET") return next();
  const f = path.normalize(path.join(dir, decodeURIComponent(req.path)));
  if (!f.startsWith(dir + path.sep)) return next();
  fs.stat(f, (e, st) => { if (e || !st.isFile()) return next(); res.setHeader("Cache-Control", "public, max-age=2592000"); if (opts.setHeaders) opts.setHeaders(res, f); res.sendFile(f); });
};
module.exports = express;
