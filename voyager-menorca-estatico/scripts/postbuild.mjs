// Genera dist/_redirects (301) a partir del inventario de URLs del WordPress original y verifica cobertura.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const legacy = JSON.parse(readFileSync('src/data/legacy-urls.json', 'utf8'));
const redirects = JSON.parse(readFileSync('src/data/redirects.json', 'utf8'));
const has = (u) => existsSync(`dist${u}index.html`);
const rules = new Map(Object.entries(redirects));
const report = { ok: 0, redirected: 0, missing: [] };

for (const u of legacy) {
  if (has(u)) { report.ok++; continue; }
  if (rules.has(u)) { report.redirected++; continue; }
  // paginación de categorías que ya no existe -> categoría
  const base = u.replace(/page\/\d+\/$/, '');
  if (base !== u && has(base)) { rules.set(u, base); report.redirected++; continue; }
  report.missing.push(u);
}
const langs = ['', '/ca', '/en', '/fr'];
const generic = [];
for (const l of langs) {
  generic.push(`${l}/2025/* ${l || ''}/blog/ 301`, `${l}/2026/* ${l || ''}/blog/ 301`, `${l}/2024/* ${l || ''}/blog/ 301`, `${l}/author/* ${l || ''}/blog/ 301`, `${l}/tag/* ${l || ''}/blog/ 301`, `${l}/feed/ ${l || ''}/blog/ 301`, `${l}/comments/feed/ ${l || ''}/blog/ 301`);
}
generic.push('/wp-login.php /404/ 404', '/wp-admin/* /404/ 404', '/xmlrpc.php /404/ 404', '/wp-json/* /404/ 404');
const lines = ['# Generado por scripts/postbuild.mjs — redirecciones 301 desde el WordPress original', ...[...rules].map(([a, b]) => `${a} ${b} 301!`), ...generic, '/admin /admin/ 301'];
writeFileSync('dist/_redirects', lines.join('\n') + '\n');
writeFileSync('dist/url-coverage.json', JSON.stringify(report, null, 1));
console.log(`URLs heredadas: ${legacy.length} · mismas URL: ${report.ok} · redirigidas: ${report.redirected} · sin cobertura: ${report.missing.length}`);
if (report.missing.length) console.log(report.missing.slice(0, 20).join('\n'));
