// Uso: npm start (otra terminal) y npm test. URL=http://localhost:8080/ por defecto.
const { chromium } = require("playwright"); const assert = require("assert"); const fs = require("fs");
const BASE = process.env.URL || "http://localhost:8080"; let fail = 0;
async function step(n, fn) { try { await fn(); console.log("OK   " + n); } catch (e) { fail++; console.log("FAIL " + n + " -> " + e.message.split("\n")[0]); } }
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, locale: "es-ES" });
  ctx.setDefaultTimeout(15000); const p = await ctx.newPage();
  const bad = []; p.on("response", r => { if (r.status() >= 400 && r.url().startsWith(BASE) && !/wp-json|admin-ajax/.test(r.url())) bad.push(r.status() + " " + r.url()); });
  const pageErrs = []; p.on("pageerror", e => { if (!/grecaptcha/.test(e.message)) pageErrs.push(e.message); });

  await step("inicio carga con título y menú", async () => { await p.goto(BASE + "/"); assert((await p.title()).length > 5); assert(await p.locator("a[href='/excursiones/']").count() > 0); });
  await step("imágenes del inicio cargan (sin rotas)", async () => {
    await p.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 700) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 100)); } });
    await p.waitForTimeout(1200);
    const broken = await p.evaluate(() => [...document.images].filter(i => i.complete && i.naturalWidth === 0 && i.currentSrc).map(i => i.currentSrc));
    assert.deepEqual(broken, [], broken.join(","));
  });
  await step("sin dependencias de WordPress en el HTML", async () => {
    const html = await p.content(); assert(!/https:\/\/voyagermenorca\.com\/wp-content/.test(html)); assert(!/i0\.wp\.com/.test(html));
  });
  for (const [nombre, ruta] of [["excursiones", "/excursiones/"], ["tour Ciutadella", "/tour-privado-por-ciutadella/"], ["blog", "/blog/"], ["quiénes somos", "/quienes-somos/"], ["catalán", "/ca/"], ["inglés", "/en/"], ["francés", "/fr/"]])
    await step("página " + nombre, async () => { const r = await p.goto(BASE + ruta); assert.equal(r.status(), 200); if (ruta !== "/blog/") assert(await p.locator("h1, h2").count() > 0); });
  await step("enlaces internos de /excursiones/ resuelven", async () => {
    await p.goto(BASE + "/excursiones/"); const hs = await p.$$eval("a[href^='/']", a => [...new Set(a.map(x => x.getAttribute("href").split("#")[0]))].filter(h => h && !/^\/(wp-|img)/.test(h)));
    const fails = []; for (const h of hs.slice(0, 60)) { const r = await ctx.request.get(BASE + h); if (r.status() >= 400) fails.push(h + " " + r.status()); } assert.deepEqual(fails, [], fails.join(","));
  });
  await step("formulario de contacto: validación", async () => {
    await p.goto(BASE + "/contacto/"); await p.locator("form.wpcf7-form [type=submit]").click(); await p.waitForSelector(".vm-form-msg");
    assert((await p.textContent(".vm-form-msg")).includes("obligatorios"));
  });
  await step("formulario de contacto: envío guardado", async () => {
    const before = fs.existsSync("data/submissions.jsonl") ? fs.readFileSync("data/submissions.jsonl", "utf8").split("\n").length : 0;
    await p.fill("[name=your-name]", "Prueba E2E"); await p.fill("[name=your-email]", "prueba@example.com"); await p.fill("[name=your-message]", "Hola");
    await p.check("input[type=checkbox]"); await p.locator("form.wpcf7-form [type=submit]").click();
    await p.waitForFunction(() => (document.querySelector(".vm-form-msg") || {}).textContent.includes("Gracias"));
    const lines = fs.readFileSync("data/submissions.jsonl", "utf8").trim().split("\n"); assert(lines.length > 0); assert(JSON.parse(lines[lines.length - 1]).fields["your-name"] === "Prueba E2E");
  });
  await step("formulario de reserva (Elementor) envía y redirige", async () => {
    await p.goto(BASE + "/tour-privado-por-ciutadella/"); const f = p.locator("form.elementor-form").first();
    await f.locator("[name='form_fields[nombre]']").fill("Reserva E2E"); await f.locator("[name='form_fields[email]']").fill("r@example.com");
    await f.locator("[name='form_fields[telefono]']").fill("600000000"); await f.locator("[name='form_fields[fecha]']").evaluate(e => { e.value = "2027-06-10"; });
    await f.locator("[name='form_fields[personas]']").fill("2"); await f.locator("[name='form_fields[idioma]']").selectOption({ index: 1 });
    await f.locator("[name='form_fields[acepto]']").evaluate(e => { e.checked = true; });
    await f.locator("[type=submit]").click(); await p.waitForURL(/solicitud-recibida/, { timeout: 15000 });
    const last = JSON.parse(fs.readFileSync("data/submissions.jsonl", "utf8").trim().split("\n").pop()); assert.equal(last.fields.nombre, "Reserva E2E");
  });
  await step("sin errores 4xx de recursos ni JS", async () => { const rb = bad.filter(x => !/googletagmanager|turitop/.test(x)); assert(rb.length === 0, "4xx: " + rb.slice(0, 5).join(" ; ")); assert(pageErrs.length === 0, "JS: " + pageErrs.slice(0, 3).join(" | ")); });
  await b.close(); process.exitCode = fail ? 1 : 0;
})();
