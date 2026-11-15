// Servidor estático con gzip/brotli (aproxima la entrega de Netlify) para mediciones de rendimiento.
const http = require('http'), fs = require('fs'), path = require('path'), zlib = require('zlib');
const [,, dir, port] = process.argv; const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.json': 'application/json', '.xml': 'application/xml' };
http.createServer((req, res) => {
  let f = path.join(dir, decodeURIComponent(req.url.split('?')[0])); if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
  if (!fs.existsSync(f)) { res.writeHead(404); return res.end('404'); }
  const ext = path.extname(f), h = { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': /_img|_astro|\.woff2/.test(f) ? 'public, max-age=31536000, immutable' : 'no-cache' };
  const buf = fs.readFileSync(f), ae = req.headers['accept-encoding'] || '';
  if (/\.(html|css|js|svg|json|xml)$/.test(ext) && /br/.test(ae)) { h['Content-Encoding'] = 'br'; res.writeHead(200, h); return res.end(zlib.brotliCompressSync(buf)); }
  if (/\.(html|css|js|svg|json|xml)$/.test(ext) && /gzip/.test(ae)) { h['Content-Encoding'] = 'gzip'; res.writeHead(200, h); return res.end(zlib.gzipSync(buf)); }
  res.writeHead(200, h); res.end(buf);
}).listen(port);
