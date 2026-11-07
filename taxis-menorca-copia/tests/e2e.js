// Pruebas de extremo a extremo con Playwright. Uso: npm start (otra terminal) y npm test
const { chromium } = require("playwright");
const assert = require("assert");
const URL = process.env.URL || "http://localhost:8080/";
const OUT = process.env.SHOTS || __dirname + "/../shots";
const results = [];
async function step(name, fn) {
  try { await fn(); results.push("OK   " + name); console.log("OK   " + name); } catch (e) { results.push("FAIL " + name + " -> " + e.message.split("\n")[0]); console.log("FAIL " + name + " -> " + e.message.split("\n")[0]); process.exitCode = 1; }
}

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 430, height: 932 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
    geolocation: { latitude: 39.9356, longitude: 4.1397 }, permissions: ["geolocation"], locale: "es-ES"
  });
  ctx.setDefaultTimeout(12000); const page = await ctx.newPage();
  const errors = []; page.on("pageerror", e => errors.push(e.message));
  await page.goto(URL);
  const shot = n => page.screenshot({ path: `${OUT}/${n}.png` });

  await step("login visible con campos y botones", async () => {
    await page.waitForSelector("#continuar");
    assert(await page.locator("text=INICIAR SESIÓN").isVisible());
    assert(await page.locator("#alta").isVisible());
    await shot("m-01-login");
  });
  await step("login vacío muestra error", async () => {
    await page.click("#continuar");
    assert((await page.textContent("#err")).includes("Introduzca"));
  });
  await step("login con cuenta inexistente falla", async () => {
    await page.fill("#email", "nadie@example.com"); await page.fill("#pass", "secreto1"); await page.click("#continuar");
    await page.waitForFunction(() => document.querySelector("#err").textContent.includes("incorrectos"));
  });
  await step("ojo alterna visibilidad de contraseña", async () => {
    await page.click(".ojo"); assert.equal(await page.getAttribute("#pass", "type"), "text");
    await page.click(".ojo"); assert.equal(await page.getAttribute("#pass", "type"), "password");
  });
  await step("alta de cliente (validaciones + creación)", async () => {
    await page.click("#alta"); await page.waitForSelector("#crear");
    await page.fill("#nombre", "Cliente Prueba"); await page.fill("#email", "mal"); await page.fill("#p1", "abcdef"); await page.fill("#p2", "abcdef");
    await page.click("#crear"); assert((await page.textContent("#err")).includes("válido"));
    await page.fill("#email", "prueba@example.com"); await page.fill("#p2", "otra"); await page.click("#crear");
    assert((await page.textContent("#err")).includes("no coinciden"));
    await page.fill("#p2", "abcdef"); await page.click("#crear");
    await page.waitForSelector('[data-state="libre"]');
  });
  await step("home: ubicación por geolocalización", async () => {
    await page.waitForFunction(() => { const t = document.querySelector('[data-field="origin"]'); return t && !t.classList.contains("vacio"); }, null, { timeout: 15000 });
    await shot("m-02-home");
  });
  await step("buscar destino 'Aer' lista aeropuerto", async () => {
    await page.click('[data-field="dest"]'); await page.fill("#q", "Aer");
    await page.waitForSelector("text=Aeropuerto de Menorca (MAH)"); await page.waitForTimeout(900);
    assert(await page.locator(".res").count() >= 4);
    await shot("m-03-buscar");
  });
  await step("búsqueda sin resultados muestra estado vacío", async () => {
    await page.fill("#q", "zzzzqq"); await page.waitForSelector('[data-test="vacio"]');
    await page.fill("#q", "Aer");
  });
  await step("seleccionar destino abre ruta con km y precio", async () => {
    await page.click("text=Aeropuerto de Menorca (MAH)");
    await page.waitForSelector("#confirmar:not([disabled])", { timeout: 20000 });
    const t = await page.textContent('[data-test="ruta-info"]'); assert(/km aprox\. \/ .* € aprox\./.test(t), t);
    await page.waitForTimeout(2500); await shot("m-04-ruta");
  });
  await step("confirmar crea 'Taxi solicitado'", async () => {
    await page.click("#confirmar"); await page.waitForSelector('[data-state="solicitado"]');
    assert(await page.locator("h2.titulo:has-text('TAXI SOLICITADO')").isVisible()); await shot("m-05-solicitado");
  });
  await step("persiste tras recargar", async () => {
    await page.reload(); await page.waitForSelector('[data-state="solicitado"]');
    assert((await page.textContent('[data-test="importe"]')).includes("€"));
  });
  await step("resumen muestra modal con cancelar", async () => {
    await page.click("#resumen"); await page.waitForSelector("#cancelar"); await page.waitForTimeout(2500); await shot("m-06-resumen");
  });
  await step("cancelar reserva pide confirmación y la cancela", async () => {
    await page.click("#cancelar"); await page.click('.dlg [data-no]'); assert(await page.locator("#cancelar").isVisible());
    await page.click("#cancelar"); await page.click('.dlg [data-si]'); await page.waitForSelector('[data-state="libre"]');
  });
  await step("reservas lista la cancelada y persiste", async () => {
    await page.click('[data-tab="reservas"]'); await page.waitForSelector('[data-test="reserva"]');
    await page.reload(); await page.waitForSelector('[data-state="libre"]'); await page.click('[data-tab="reservas"]'); await page.waitForSelector('[data-test="reserva"]');
    assert((await page.textContent('[data-test="reserva"]')).includes("Cancelado")); await shot("m-07-reservas");
  });
  await step("menú: perfil guarda cambios tras recargar", async () => {
    await page.click('[data-act="menu"]'); await page.click('[data-nav="perfil"]');
    await page.fill("#nombre", "Cliente Editado"); await page.click("#guardar");
    await page.reload(); await page.click('[data-act="menu"]'); await page.click('[data-nav="perfil"]');
    assert.equal(await page.inputValue("#nombre"), "Cliente Editado");
  });
  await step("elegir destino en el mapa", async () => {
    await page.click('[data-act="menu"]'); await page.click('[data-nav="home"]');
    await page.click('[data-field="dest"]'); await page.click("#enmapa");
    await page.waitForSelector(".leaflet-container"); await page.waitForTimeout(1200);
    const box = await page.locator(".leaflet-container").boundingBox();
    await page.mouse.click(box.x + box.width * 0.45, box.y + box.height * 0.45);
    await page.waitForSelector("#confirmar-punto:not([disabled])", { timeout: 15000 }); await shot("m-08-elegir-mapa");
    await page.click("#confirmar-punto"); await page.waitForSelector("#confirmar:not([disabled])", { timeout: 20000 });
  });
  await step("cerrar ruta vuelve a home sin destino", async () => {
    await page.click('[data-act="back"]'); await page.waitForSelector('[data-state="libre"]');
    assert((await page.getAttribute('[data-field="dest"]', "class")).includes("vacio"));
  });
  await step("cerrar sesión y volver a entrar", async () => {
    await page.click('[data-act="menu"]'); await page.click('[data-nav="salir"]'); await page.click('.dlg [data-si]');
    await page.waitForSelector("#continuar");
    await page.fill("#email", "prueba@example.com"); await page.fill("#pass", "mala"); await page.click("#continuar");
    await page.waitForFunction(() => document.querySelector("#err").textContent.includes("incorrectos"));
    await page.fill("#pass", "abcdef"); await page.click("#continuar"); await page.waitForSelector('[data-state="libre"]');
  });
  await step("recuperar contraseña local", async () => {
    await page.click('[data-act="menu"]'); await page.click('[data-nav="salir"]'); await page.click('.dlg [data-si]');
    await page.click("#olvido"); await page.fill("#email", "prueba@example.com"); await page.fill("#p1", "nuevaclave"); await page.click("#restablecer");
    await page.waitForSelector("#continuar"); await page.fill("#email", "prueba@example.com"); await page.fill("#pass", "nuevaclave"); await page.click("#continuar");
    await page.waitForSelector('[data-state="libre"]');
  });

  // Escritorio
  const d = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: "es-ES" });
  const dp = await d.newPage(); await dp.goto(URL);
  await step("captura de escritorio (login)", async () => { await dp.waitForSelector("#continuar"); await dp.screenshot({ path: `${OUT}/d-01-login.png` }); });

  await step("sin errores JS", async () => assert.deepEqual(errors, [], errors.join(' / ')));
  console.log(results.join("\n"));
  await browser.close();
})();
