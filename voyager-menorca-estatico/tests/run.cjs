// Pruebas del sitio nuevo. Requiere `npm run build` previo. Uso: npm test  (PORT=4400 por defecto)
const http = require('http'), fs = require('fs'), path = require('path'), assert = require('assert');
const { chromium } = require('playwright');
const DIST = path.join(__dirname, '..', 'dist'), PORT = process.env.PORT || 4400, BASE = `http://localhost:${PORT}`;
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.json': 'application/json', '.xml': 'application/xml', '.webmanifest': 'application/manifest+json', '.txt': 'text/plain' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); let f = path.join(DIST, p);
  if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
  if (!fs.existsSync(f)) { const nf = path.join(DIST, '404.html'); res.writeHead(404, { 'Content-Type': 'text/html' }); return res.end(fs.existsSync(nf) ? fs.readFileSync(nf) : '404'); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
});
let fails = 0, passes = 0; const warns = [];
async function step(name, fn) { try { await fn(); passes++; console.log('OK   ' + name); } catch (e) { fails++; console.log('FAIL ' + name + ' -> ' + String(e.message).split('\n').slice(0, 6).join(' | ')); } }
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
const htmlFiles = walk(DIST).filter((f) => (f.endsWith('index.html') || f.endsWith('404.html')) && !f.includes(path.sep + 'admin' + path.sep));
const urlOf = (f) => '/' + path.relative(DIST, f).replace(/index\.html$/, '').replace(/404\.html$/, '404/');
const read = (f) => fs.readFileSync(f, 'utf8');

(async () => {
  await new Promise((r) => server.listen(PORT, r));
  // ---------- análisis estático ----------
  await step(`build contiene ${htmlFiles.length} páginas HTML`, () => assert(htmlFiles.length > 350));
  await step('sin dependencias de WordPress / Elementor / CF7 / Jetpack', () => {
    const re = /(wp-content|wp-includes|wp-json|elementor|wpcf7|contact-form-7|jetpack|i0\.wp\.com|wordpress|complianz)/i;
    const bad = []; for (const f of htmlFiles.concat(walk(DIST).filter((x) => /\.(js|css)$/.test(x)))) { const m = read(f).match(re); if (m) bad.push(urlOf(f) + ' (' + m[1] + ')'); }
    assert(bad.length === 0, bad.slice(0, 5).join(', ') + ` … ${bad.length} archivos`);
  });
  await step('cada página: lang, title, canonical, un único h1, imágenes con alt', () => {
    const bad = [];
    for (const f of htmlFiles) {
      const h = read(f), u = urlOf(f);
      if (!/<html lang="(es|ca|en|fr)"/.test(h)) bad.push(u + ' lang');
      if (!/<title>[^<]{5,}/.test(h)) bad.push(u + ' title');
      if (!/rel="canonical" href="https:\/\/voyagermenorca\.com/.test(h)) bad.push(u + ' canonical');
      if ((h.match(/<h1[\s>]/g) || []).length !== 1) bad.push(u + ' h1=' + (h.match(/<h1[\s>]/g) || []).length);
      if (/<img(?![^>]*\balt[=\s>\/])[^>]*>/.test(h)) bad.push(u + ' img sin alt');
      if (!/name="description"/.test(h) && !/404/.test(u)) warns.push('sin meta description: ' + u);
    }
    assert(bad.length === 0, bad.slice(0, 8).join(', ') + ` … ${bad.length}`);
  });
  await step('enlaces y recursos internos resuelven (HTML estático)', () => {
    const bad = new Set();
    const exists = (u) => { const p = decodeURIComponent(u.split('#')[0].split('?')[0]); if (!p || p === '/') return true; const f = path.join(DIST, p); return fs.existsSync(f) && (fs.statSync(f).isFile() || fs.existsSync(path.join(f, 'index.html'))); };
    for (const f of htmlFiles) for (const m of read(f).matchAll(/(?:href|src|srcset)="(\/[^"#]*)/g)) for (const piece of m[1].split(',')) { const u = piece.trim().split(' ')[0]; if (u.startsWith('/') && !exists(u)) bad.add(`${urlOf(f)} → ${u}`); }
    assert(bad.size === 0, [...bad].slice(0, 6).join(' ; ') + ` … ${bad.size}`);
  });
  await step('hreflang recíproco (si A enlaza a B, B enlaza a A)', () => {
    const bad = []; const map = {};
    for (const f of htmlFiles) { const h = read(f); map[urlOf(f)] = [...h.matchAll(/rel="alternate" hreflang="(es|ca|en|fr)" href="https:\/\/voyagermenorca\.com([^"]*)"/g)].map((m) => [m[1], m[2]]); }
    for (const [u, alts] of Object.entries(map)) for (const [, t] of alts) { if (t === u) continue; if (!map[t]) { bad.push(`${u} → ${t} no existe`); continue; } if (!map[t].some(([, x]) => x === u)) bad.push(`${t} no devuelve a ${u}`); }
    assert(bad.length === 0, bad.slice(0, 5).join(' ; ') + ` … ${bad.length}`);
  });
  await step('inventario de URLs original cubierto (misma URL o 301)', () => {
    const cov = JSON.parse(read(path.join(DIST, 'url-coverage.json'))); assert.equal(cov.missing.length, 0, cov.missing.slice(0, 5).join(', ')); assert(cov.ok > 300);
    assert(fs.existsSync(path.join(DIST, '_redirects')));
  });
  await step('sitemap multilingüe + robots', () => {
    const idx = read(path.join(DIST, 'sitemap-index.xml')); assert(/sitemap-0\.xml/.test(idx)); const sm = read(path.join(DIST, 'sitemap-0.xml'));
    assert(/xhtml:link rel="alternate" hreflang="ca-ES"/.test(sm), 'sin hreflang en sitemap'); assert(!/solicitud-recibida|request-received/.test(sm)); assert(/Sitemap:/.test(read(path.join(DIST, 'robots.txt'))));
  });
  await step('datos estructurados válidos (JSON-LD parseable) en tours, posts e inicio', () => {
    for (const u of ['/', '/tour-privado-por-ciutadella/', '/en/private-tour-of-ciutadella/', '/atardecer-menorca-9-miradores/']) { const h = read(path.join(DIST, u, 'index.html')); const ld = [...h.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)].map((m) => JSON.parse(m[1])); assert(ld.length >= 1, u); }
    const t = read(path.join(DIST, 'tour-privado-por-ciutadella/index.html')); assert(/"@type":"TouristTrip"/.test(t) && /"@type":"FAQPage"/.test(t) && /"priceCurrency":"EUR"/.test(t));
  });

  // ---------- función de contacto ----------
  const { handle } = await import('../netlify/functions/contact.mjs');
  const mk = (b, ip = '1.1.1.' + Math.floor(Math.random() * 250)) => new Request('http://x/api/contact', { method: 'POST', headers: { 'x-nf-client-connection-ip': ip }, body: JSON.stringify(b) });
  const now = Date.now(), good = { name: 'Ana', email: 'ana@example.com', message: '<b>Hola</b>', accept: 'on', ts: String(now - 10000), tour: 'Tour', website: '' };
  const env = { RESEND_API_KEY: 'k', CONTACT_TO: 'info@voyagermenorca.com' };
  await step('función: envía e-mail (Resend) con datos escapados', async () => {
    let call; const r = await handle(mk(good), env, async (u, o) => { call = { u, o }; return new Response('{}', { status: 200 }); }, now);
    assert.equal(r.status, 200); const b = JSON.parse(call.o.body); assert(call.u.includes('resend.com')); assert.deepEqual(b.to, ['info@voyagermenorca.com']); assert(b.html.includes('&lt;b&gt;Hola') && !b.html.includes('<b>Hola</b>')); assert.equal(b.reply_to, 'ana@example.com');
  });
  await step('función: honeypot y envío demasiado rápido se descartan sin enviar', async () => {
    let n = 0; const f = async () => { n++; return new Response('{}'); };
    assert.equal((await handle(mk({ ...good, website: 'spam.com' }), env, f, now)).status, 200); assert.equal((await handle(mk({ ...good, ts: String(now - 500) }), env, f, now)).status, 200); assert.equal(n, 0);
  });
  await step('función: validación, método y tamaño', async () => {
    const f = async () => new Response('{}'); assert.equal((await handle(mk({ ...good, email: 'mal' }), env, f, now)).status, 400); assert.equal((await handle(mk({ ...good, accept: '' }), env, f, now)).status, 400);
    assert.equal((await handle(new Request('http://x', { method: 'GET' }), env, f, now)).status, 405); assert.equal((await handle(mk({ ...good, message: 'x'.repeat(30000) }), env, f, now)).status, 413);
  });
  await step('función: sin RESEND_API_KEY devuelve 503 (nunca finge éxito)', async () => assert.equal((await handle(mk(good), {}, async () => new Response('{}'), now)).status, 503));
  await step('función: Turnstile rechaza token inválido y límite por IP', async () => {
    const fail = async () => new Response(JSON.stringify({ success: false })); assert.equal((await handle(mk(good), { ...env, TURNSTILE_SECRET: 's' }, fail, now)).status, 400);
    const ok = async () => new Response('{}'); let last; for (let i = 0; i < 6; i++) last = await handle(mk(good, '9.9.9.9'), env, ok, now); assert.equal(last.status, 429);
  });

  // ---------- navegador ----------
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'es-ES' }); ctx.setDefaultTimeout(15000);
  const errors = [], failed = [];
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message)); page.on('requestfailed', (r) => { if (r.url().startsWith(BASE)) failed.push(r.url()); }); page.on('response', (r) => { if (r.status() >= 400 && r.url().startsWith(BASE)) failed.push(r.status() + ' ' + r.url()); });
  await step('banner de cookies: rechazar no carga analítica; aceptar sí y se recuerda', async () => {
    await page.goto(BASE + '/'); await page.waitForSelector('#consent:not([hidden])');
    assert(!(await page.evaluate(() => !!window.__gaLoaded)));
    await page.click('[data-consent="no"]'); assert(await page.locator('#consent').isHidden()); assert(!(await page.evaluate(() => !!window.__gaLoaded)));
    await page.reload(); assert(await page.locator('#consent').isHidden());
    await page.click('[data-open-consent]'); await page.waitForSelector('#consent:not([hidden])'); await page.click('[data-consent="yes"]'); assert(await page.evaluate(() => !!window.__gaLoaded));
  });
  const LANGS = { es: '/', ca: '/ca/', en: '/en/', fr: '/fr/' };
  for (const [l, u] of Object.entries(LANGS)) await step(`navegación por secciones en ${l}`, async () => {
    await page.goto(BASE + u); const links = await page.$$eval('header nav ul:first-of-type a', (a) => a.map((x) => x.getAttribute('href')));
    assert(links.length === 5, 'menú: ' + links.length);
    for (const h of links) { const r = await page.goto(BASE + h); assert.equal(r.status(), 200, h); assert.equal(await page.locator('h1').count(), 1, h); }
  });
  await step('selector de idioma lleva a la traducción de la misma página', async () => {
    await page.goto(BASE + '/tour-privado-por-ciutadella/'); await page.click('.langs a[hreflang="en"]'); await page.waitForURL(/private-tour-of-ciutadella/);
    await page.click('.langs a[hreflang="fr"]'); await page.waitForURL(/visite-privee-de-ciutadella/); assert.equal(await page.getAttribute('html', 'lang'), 'fr');
  });
  await step('inicio → ficha de excursión → CTA de reserva', async () => {
    await page.goto(BASE + '/'); await page.click('.tc >> nth=0'); await page.waitForURL(/ciutadella|mahon|talayot/); assert(await page.locator('#reservar').count() > 0); assert(await page.locator('.price').count() > 0);
  });
  const fillOk = async () => { await page.fill('#reservar [name=name]', 'Ana Prueba'); await page.fill('#reservar [name=email]', 'ana@example.com'); await page.fill('#reservar [name=message]', 'Hola'); await page.check('#reservar [name=accept]'); };
  await step('formulario: validación en cliente', async () => {
    await page.goto(BASE + '/contacto/'); await page.click('#reservar button[type=submit]'); await page.waitForSelector('#reservar .msg:not([hidden])'); assert(/obligatorios/.test(await page.textContent('#reservar .msg')));
    await page.fill('#reservar [name=name]', 'A'); await page.fill('#reservar [name=email]', 'mal'); await page.check('#reservar [name=accept]'); await page.click('#reservar button[type=submit]'); assert(/correo/i.test(await page.textContent('#reservar .msg')));
  });
  await step('formulario: envío correcto → página de gracias (payload completo, sin spam)', async () => {
    let posted; await page.route('**/api/contact', async (r) => { posted = JSON.parse(r.request().postData()); await r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }); });
    await page.goto(BASE + '/contacto/'); await page.waitForTimeout(300); await fillOk(); await page.click('#reservar button[type=submit]'); await page.waitForURL(/solicitud-recibida/);
    assert.equal(posted.name, 'Ana Prueba'); assert.equal(posted.website, ''); assert(Number(posted.ts) > 0); assert.equal(posted.page, '/contacto/'); assert.equal(await page.locator('meta[name=robots][content*=noindex]').count(), 1);
    await page.unroute('**/api/contact');
  });
  await step('formulario: error del servidor muestra aviso y permite reintentar', async () => {
    await page.route('**/api/contact', (r) => r.fulfill({ status: 503, body: '{}' })); await page.goto(BASE + '/en/contacto/'); await fillOk(); await page.click('#reservar button[type=submit]');
    await page.waitForSelector('#reservar .msg.err'); assert(/WhatsApp/.test(await page.textContent('#reservar .msg'))); assert(await page.locator('#reservar button[type=submit]').isEnabled()); await page.unroute('**/api/contact');
  });
  await step('menú móvil se abre, navega y se cierra con Escape', async () => {
    const m = await browser.newContext({ viewport: { width: 390, height: 844 } }); const p = await m.newPage(); await p.addInitScript(() => localStorage.setItem('vm_consent_v1', '{"analytics":false}'));
    await p.goto(BASE + '/'); assert(await p.locator('#nav').isHidden()); await p.click('.burger'); await p.locator('#nav').waitFor({ state: 'visible' }); await p.keyboard.press('Escape'); await p.locator('#nav').waitFor({ state: 'hidden' });
    await p.click('.burger'); await p.click('#nav >> text=Excursiones'); await p.waitForURL(/excursiones/); await m.close();
  });
  for (const [name, vp] of [['móvil 390', { width: 390, height: 844 }], ['tablet 820', { width: 820, height: 1100 }], ['escritorio 1440', { width: 1440, height: 900 }]])
    await step(`sin desbordamiento horizontal ni recursos rotos en ${name}`, async () => {
      const c = await browser.newContext({ viewport: vp }); const p = await c.newPage(); await p.addInitScript(() => localStorage.setItem('vm_consent_v1', '{"analytics":false}')); const bad = [];
      p.on('response', (r) => { if (r.status() >= 400 && r.url().startsWith(BASE)) bad.push(r.status() + r.url()); });
      for (const u of ['/', '/excursiones/', '/tour-privado-por-ciutadella/', '/excursion-talayotica-menorca/', '/blog/', '/atardecer-menorca-9-miradores/', '/contacto/', '/en/field-trips/', '/ca/', '/fr/quienes-somos/']) {
        await p.goto(BASE + u); await p.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 700) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 40)); } }); await p.waitForTimeout(200);
        const o = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth); assert(o <= 1, `${u} desborda ${o}px`);
        const broken = await p.evaluate(() => [...document.images].filter((i) => i.complete && i.naturalWidth === 0).map((i) => i.src)); assert.equal(broken.length, 0, `${u}: ${broken[0]}`);
      }
      assert.deepEqual(bad, []); await c.close();
    });
  const axeSrc = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
  await step('accesibilidad WCAG 2.2 AA (axe-core) en páginas clave', async () => {
    const c = await browser.newContext({ viewport: { width: 1280, height: 900 } }); const p = await c.newPage(); await p.addInitScript(() => localStorage.setItem('vm_consent_v1', '{"analytics":false}')); const bad = [];
    for (const u of ['/', '/excursiones/', '/tour-privado-por-ciutadella/', '/free-tour-ciutadella/', '/blog/', '/atardecer-menorca-9-miradores/', '/contacto/', '/ca/', '/en/', '/fr/', '/politica-de-cookies-ue/', '/en/field-trips/']) {
      await p.goto(BASE + u); await p.addScriptTag({ content: axeSrc });
      const r = await p.evaluate(() => axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } }));
      for (const v of r.violations) bad.push(`${u}: ${v.id} (${v.nodes.length}) ${v.nodes[0].target.join(' ')}`);
    }
    await c.close(); assert(bad.length === 0, bad.slice(0, 8).join(' ; ') + ` … ${bad.length}`);
  });
  await step('sin errores JS en consola ni respuestas 4xx internas', () => { assert.deepEqual(errors, []); assert.deepEqual(failed.filter((x) => !/favicon|\/api\/contact/.test(x)), []); });
  await browser.close(); server.close();
  console.log(`\n${passes} correctas, ${fails} fallidas` + (warns.length ? `, ${warns.length} avisos` : '')); if (warns.length) console.log(warns.slice(0, 8).join('\n'));
  process.exit(fails ? 1 : 0);
})();
