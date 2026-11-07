// Servidor estático mínimo (sin dependencias). Uso: npm start  -> http://localhost:8080
const http = require("http"), fs = require("fs"), path = require("path");
const root = __dirname, port = process.env.PORT || 8080;
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml" };
http.createServer(async (req, res) => {
  const u = new URL(req.url, "http://x");
  if (u.pathname === "/api/route") { // proxy a OSRM (evita CORS del navegador)
    const ok = /^-?\d+(\.\d+)?,-?\d+(\.\d+)?$/;
    const a = u.searchParams.get("from"), b = u.searchParams.get("to");
    if (!ok.test(a || "") || !ok.test(b || "")) { res.writeHead(400); return res.end("bad request"); }
    try {
      const r = await fetch(`https://router.project-osrm.org/route/v1/driving/${a};${b}?overview=full&geometries=geojson`, { signal: AbortSignal.timeout(8000) });
      res.writeHead(r.status, { "Content-Type": "application/json" }); return res.end(await r.text());
    } catch (e) { res.writeHead(502); return res.end("upstream error"); }
  }
  let p = decodeURIComponent(req.url.split("?")[0]); if (p === "/") p = "/index.html";
  const f = path.join(root, p);
  if (!f.startsWith(root) || f.includes("node_modules") || f.includes("tests") || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end("404"); }
  res.writeHead(200, { "Content-Type": types[path.extname(f)] || "application/octet-stream" }); fs.createReadStream(f).pipe(res);
}).listen(port, () => console.log("Taxis Menorca (copia local) en http://localhost:" + port));
