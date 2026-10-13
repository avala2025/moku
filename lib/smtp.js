// Minimal SMTP sender (no dependencies). Port 465: TLS from the start. Port 587/25: STARTTLS.
// Certificates are always verified. Plain, unencrypted login is allowed only to localhost (tests).
"use strict";
const net = require("node:net");
const tls = require("node:tls");
const crypto = require("node:crypto");

const b64 = s => Buffer.from(String(s), "utf8").toString("base64");
const word = s => /^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${b64(s)}?=`; // non-ASCII header text
const wrap = s => s.replace(/.{1,76}/g, "$&\r\n");
const clean = s => String(s).replace(/[\r\n<>]/g, "").trim();

function sendSmtp({ host, port, user, pass, fromName, fromAddr, to, subject, html, timeout = 20000 }) {
  port = +port || 465;
  const local = host === "localhost" || host === "127.0.0.1";
  return new Promise((resolve, reject) => {
    let sock, buf = "", waiter = null, done = false;
    const fail = e => { if (done) return; done = true; try { sock && sock.destroy(); } catch {} reject(e instanceof Error ? e : new Error(String(e))); };
    const timer = setTimeout(() => fail(new Error("SMTP: დრო ამოიწურა")), timeout);
    const onData = d => { buf += d; const lines = buf.split("\r\n"); // a reply ends with a line "NNN text"
      for (let i = 0; i < lines.length - 1; i++) if (/^\d{3} /.test(lines[i])) { const reply = lines.slice(0, i + 1).join("\n"); buf = lines.slice(i + 1).join("\r\n"); const w = waiter; waiter = null; w && w(reply); return; } };
    const attach = s => { sock = s; s.setEncoding("utf8"); s.on("data", onData); s.on("error", fail); s.on("close", () => fail(new Error("SMTP: კავშირი გაწყდა"))); };
    const read = () => new Promise(r => { waiter = r; onData(""); });
    const cmd = async (line, ok) => { if (line !== null) sock.write(line + "\r\n"); const r = await read(), code = +r.slice(0, 3);
      if (!ok.includes(code)) throw new Error("SMTP " + r.replace(/\s+/g, " ").slice(0, 200).replace(b64(pass), "***")); return r; };
    const run = async () => {
      await cmd(null, [220]);
      let ehlo = await cmd("EHLO moku", [250]);
      if (!(sock instanceof tls.TLSSocket)) {
        if (/STARTTLS/i.test(ehlo)) {
          await cmd("STARTTLS", [220]); sock.removeAllListeners("data"); sock.removeAllListeners("close"); sock.removeAllListeners("error");
          await new Promise((ok, no) => { const t = tls.connect({ socket: sock, servername: host }, ok); t.on("error", no); attach(t); });
          ehlo = await cmd("EHLO moku", [250]);
        } else if (!local) throw new Error("SMTP სერვერი დაცულ კავშირს არ გვთავაზობს");
      }
      if (user) { await cmd("AUTH LOGIN", [334]); await cmd(b64(user), [334]); await cmd(b64(pass), [235]); }
      await cmd(`MAIL FROM:<${clean(fromAddr)}>`, [250]);
      await cmd(`RCPT TO:<${clean(to)}>`, [250, 251]);
      await cmd("DATA", [354]);
      const msg = [`From: ${word(clean(fromName))} <${clean(fromAddr)}>`, `To: <${clean(to)}>`, `Subject: ${word(clean(subject))}`,
        `Date: ${new Date().toUTCString()}`, `Message-ID: <${crypto.randomUUID()}@${clean(fromAddr).split("@")[1] || "moku"}>`,
        "MIME-Version: 1.0", "Content-Type: text/html; charset=UTF-8", "Content-Transfer-Encoding: base64", "", wrap(b64(html))].join("\r\n");
      await cmd(msg + "\r\n.", [250]);
      sock.write("QUIT\r\n"); done = true; clearTimeout(timer); sock.end(); resolve();
    };
    const go = () => run().catch(e => { clearTimeout(timer); fail(e); });
    if (port === 465) attach(tls.connect({ host, port, servername: host }, go));
    else { const s = net.connect({ host, port }, go); attach(s); }
  });
}
module.exports = { sendSmtp };
