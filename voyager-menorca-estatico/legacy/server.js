// Servidor mínimo sin dependencias: sirve public/ y recibe formularios en POST /api/forms.
//   npm start                      -> http://localhost:8080
//   FORM_WEBHOOK_URL=https://...   -> reenvía cada envío (Zapier, Make, Formspree, etc.)
const http = require("http"), fs = require("fs"), path = require("path");
const ROOT = path.join(__dirname, "public"), DATA = path.join(__dirname, "data");
const PORT = process.env.PORT || 8080;
const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif",
  ".svg": "image/svg+xml", ".ico": "image/x-icon", ".woff": "font/woff", ".woff2": "font/woff2", ".ttf": "font/ttf", ".xml": "application/xml",
  ".mp4": "video/mp4", ".txt": "text/plain; charset=utf-8" };

function handleForm(req, res) {
  let body = "";
  req.on("data", c => { body += c; if (body.length > 100000) req.destroy(); });
  req.on("end", async () => {
    let j; try { j = JSON.parse(body); } catch { res.writeHead(400); return res.end("bad json"); }
    if (!j || typeof j.fields !== "object") { res.writeHead(400); return res.end("bad data"); }
    const rec = { received_at: new Date().toISOString(), ...j };
    try {
      fs.mkdirSync(DATA, { recursive: true });
      fs.appendFileSync(path.join(DATA, "submissions.jsonl"), JSON.stringify(rec) + "\n");
      if (process.env.FORM_WEBHOOK_URL) {
        const r = await fetch(process.env.FORM_WEBHOOK_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(rec) });
        if (!r.ok) console.error("webhook respondió", r.status);
      }
      res.writeHead(200, { "Content-Type": "application/json" }); res.end('{"ok":true}');
    } catch (e) { console.error(e); res.writeHead(500); res.end("error"); }
  });
}

http.createServer((req, res) => {
  const u = new URL(req.url, "http://x");
  if (u.pathname === "/api/forms" && req.method === "POST") return handleForm(req, res);
  let p = decodeURIComponent(u.pathname).replace(/\/{2,}/g, "/");
  let f = path.join(ROOT, p);
  if (!f.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
  try {
    if (fs.existsSync(f) && fs.statSync(f).isDirectory()) {
      if (!p.endsWith("/")) { res.writeHead(301, { Location: p + "/" + u.search }); return res.end(); }
      f = path.join(f, "index.html");
    }
    if (!fs.existsSync(f)) {
      res.writeHead(404, { "Content-Type": "text/html; charset=utf-8" });
      const nf = path.join(ROOT, "404.html");
      return res.end(fs.existsSync(nf) ? fs.readFileSync(nf) : "<h1>404</h1><p><a href='/'>Inicio</a></p>");
    }
    const ext = path.extname(f).toLowerCase();
    const type = TYPES[ext] || (f.includes("/wp-json/") ? "application/json" : "application/octet-stream");
    res.writeHead(200, { "Content-Type": type, "Cache-Control": /\.(html)$/.test(ext) ? "no-cache" : "public, max-age=86400" });
    fs.createReadStream(f).pipe(res);
  } catch (e) { res.writeHead(500); res.end("error"); }
}).listen(PORT, () => console.log("Voyager Menorca (estático) en http://localhost:" + PORT));
