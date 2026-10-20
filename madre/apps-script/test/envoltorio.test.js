// Pruebas de la app del móvil en su propia página (web-app/index.html) con Playwright, Chromium real y el Code.gs real (simulado) detrás.
// Safari (iPhone) no se puede probar aquí: ver el README.
// Uso:  node test/envoltorio.test.js
const { spawn } = require('child_process');
const fs = require('fs'), path = require('path');
const { chromium } = require('/opt/node-tools/node_modules/playwright');
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const PUERTO = 8767, base = `http://127.0.0.1:${PUERTO}`;
const RAIZ = path.join(__dirname, '..', '..');
let bien = 0, mal = 0;
const t = (n, c) => { if (c) bien++; else { mal++; console.log('   FALLA:', n); } };
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const srv = spawn('node', [path.join(__dirname, 'servidor-ui.js'), String(PUERTO)], { stdio: 'ignore' });
  await espera(1500);
  const nav = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
  const nueva = async (permisos) => {
    const ctx = await nav.newContext({ viewport: { width: 430, height: 900 }, permissions: permisos || [] });
    const pag = await ctx.newPage();
    const peticiones = [];
    // La dirección de Google se desvía al simulador local (con la misma forma: POST text/plain a /exec?a=rpc)
    await pag.route('https://script.google.com/macros/s/**', async (ruta) => {
      const r = ruta.request(); peticiones.push({ url: r.url(), tipo: r.headers()['content-type'], cuerpo: r.postData() });
      const resp = await fetch(base + '/exec?a=rpc', { method: 'POST', body: r.postData() });
      await ruta.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'content-type': 'text/plain' }, body: await resp.text() });
    });
    pag._peticiones = peticiones;
    return pag;
  };
  const claveAna = async () => { const r = await fetch(base + '/rpc', { method: 'POST', body: JSON.stringify({ fn: 'leer_', args: [] }) }); return (await r.json()).valor.familia[0].clave; };
  await fetch(base + '/reiniciar');
  const ana = await claveAna();
  const url = (h) => `${base}/web-app/index.html${h}`;

  console.log('administrador con su enlace');
  let p = await nueva();
  await p.goto(url('#u=IDDEPRUEBA&k=ADMINKEY')); await p.waitForSelector('h1', { timeout: 15000 }); await espera(800);
  t('abre el panel de administrador', (await p.textContent('#app')).includes('Así se ve ahora en la TV'));
  t('habla con el script por POST text/plain y la dirección lleva el identificador', p._peticiones.length > 0 && p._peticiones.every((q) => q.url.startsWith('https://script.google.com/macros/s/IDDEPRUEBA/exec?a=rpc') && /text\/plain/.test(q.tipo)));
  t('la clave nunca va en la dirección, solo en el cuerpo', p._peticiones.every((q) => !/ADMINKEY/.test(q.url) && /ADMINKEY/.test(q.cuerpo)));
  const man = await p.evaluate(async () => { const r = await fetch(document.getElementById('manifiesto').href); return r.json(); });
  t('manifiesto: nombre, pantalla completa e iconos', man.name === 'La tele de mamá' && man.display === 'fullscreen' && man.icons.length === 3);
  t('el icono de Android abre con el enlace completo (con su clave)', man.start_url === url('#u=IDDEPRUEBA&k=ADMINKEY'));
  t('iconos para iPhone y nombre', await p.evaluate(() => !!document.querySelector('link[rel=apple-touch-icon]') && document.querySelector('meta[name=apple-mobile-web-app-title]').content === 'La tele de mamá' && document.querySelector('meta[name=apple-mobile-web-app-capable]').content === 'yes'));
  t('la imagen del icono existe', (await fetch(base + '/web-app/iconos/apple-touch-icon.png')).status === 200 && (await fetch(base + '/web-app/iconos/icono-512.png')).status === 200);
  t('no se indexa ni se manda la dirección a nadie', await p.evaluate(() => document.querySelector('meta[name=robots]').content.includes('noindex') && document.querySelector('meta[name=referrer]').content === 'no-referrer'));
  await p.evaluate(() => ir('familia')); await espera(300);
  const enlaces = await p.evaluate(() => S.datos.familia.map((f) => enlaceDe(f)));
  t('los enlaces de la familia apuntan a la app, con la clave tras el #', enlaces.length > 0 && enlaces.every((e) => e.startsWith(`${base}/web-app/index.html#u=IDDEPRUEBA&k=`)));
  await espera(500);
  t('la app le cuenta al script dónde está (en local es http y el script lo rechaza; en https lo guarda)', p._peticiones.some((q) => /admAjustes/.test(q.cuerpo) && /enlaceApp/.test(q.cuerpo)));
  await p.evaluate(() => ir('ajustes')); await espera(300);
  t('Ajustes explica el icono de la pantalla de inicio', (await p.textContent('#icono-inicio')).includes('Añadir a pantalla de inicio') && (await p.textContent('#icono-inicio')).includes('iPhone') && (await p.textContent('#icono-inicio')).includes('Samsung'));
  await p.context().close();

  console.log('familiar con su enlace');
  p = await nueva();
  await p.goto(url(`#u=IDDEPRUEBA&k=${ana}`)); await p.waitForSelector('h1', { timeout: 15000 }); await espera(800);
  t('abre la página de la familia', (await p.textContent('#app')).includes('Hola, Ana') && (await p.textContent('#app')).includes('Grabar audio'));
  t('y explica cómo añadir el icono', (await p.textContent('#app')).includes('Cómo poner el icono en la pantalla de inicio'));
  await p.fill('#texto', 'Desde la app'); await p.click('text=Enviar a la TV'); await espera(800);
  t('puede escribir un mensaje', await p.evaluate(() => S.mensajes.some((m) => m.texto === 'Desde la app')));
  // grabar un audio de verdad (micrófono simulado) y mandarlo
  await p.click('text=Grabar audio'); await p.click('[role=dialog] >> text=Empezar a grabar'); await espera(2500);
  await p.click('[role=dialog] >> text=Parar y revisar'); await p.waitForSelector('[role=dialog] audio', { timeout: 10000 });
  await p.click('[role=dialog] >> text=Mandar a la tele'); await espera(2500);
  t('graba con el micrófono y lo sube por POST', await p.evaluate(() => S.medios.lista.length === 1 && S.medios.lista[0].tipo === 'audio' && S.medios.lista[0].de === 'Ana'));
  t('ve su envío en Preparados', (await p.textContent('#preparados')).includes('Audio de Ana'));
  await p.click('text=Reproducir ahora'); await espera(1200);
  t('lo puede poner y ve Esperando a la TV…', (await p.textContent('#repro')).includes('Esperando a la TV…'));
  await p.context().close();

  console.log('sin enlace: pedirlo una vez');
  p = await nueva();
  await p.goto(url('')); await p.waitForSelector('#pegar-enlace', { timeout: 10000 });
  t('sin clave pide pegar el enlace', (await p.textContent('#app')).includes('Pega') || !!(await p.$('#pegar-enlace')));
  await p.fill('#pegar-enlace', 'esto no es un enlace'); await p.click('text=Entrar'); await espera(300);
  t('un texto que no vale se rechaza', (await p.textContent('#aviso')).includes('no vale'));
  await p.fill('#pegar-enlace', `${base}/web-app/index.html#u=IDDEPRUEBA&k=ADMINKEY`); await p.click('text=Entrar');
  await p.waitForFunction(() => document.body.textContent.includes('Así se ve ahora'), null, { timeout: 15000 });
  t('pegando el enlace entra', true);
  await p.goto(url('')); await p.waitForFunction(() => document.body.textContent.includes('Así se ve ahora'), null, { timeout: 15000 });
  t('y la próxima vez que se abre sin enlace, ya se acuerda', true);
  await p.context().close();

  console.log('el enlace antiguo de Google también vale');
  p = await nueva();
  await p.goto(url('')); await p.waitForSelector('#pegar-enlace');
  await p.fill('#pegar-enlace', 'https://script.google.com/macros/s/OTROID/exec?a=admin&k=ADMINKEY'); await p.click('text=Entrar'); await espera(1500);
  t('lo entiende y guarda su identificador', await p.evaluate(() => localStorage.getItem('pizarra_u') === 'OTROID' && localStorage.getItem('pizarra_k') === 'ADMINKEY'));
  await p.context().close();

  console.log('el repositorio no lleva claves ni direcciones del script');
  const archivos = []; (function rec(d) { for (const f of fs.readdirSync(d)) { const x = path.join(d, f); if (fs.statSync(x).isDirectory()) { if (f !== 'node_modules' && f !== '.git' && f !== 'build') rec(x); } else if (/\.(html|js|gs|md|json|py|java|xml)$/.test(f)) archivos.push(x); } })(RAIZ);
  const sospechosos = archivos.filter((f) => /AKfycb[\w-]{20,}|script\.google\.com\/macros\/s\/[A-Za-z0-9_-]{25,}\/exec/.test(fs.readFileSync(f, 'utf8')));
  t('no hay ninguna dirección /exec completa en el repositorio: ' + sospechosos.join(', '), sospechosos.length === 0);

  await nav.close(); srv.kill();
  console.log(bien + ' bien, ' + mal + ' fallos');
  process.exit(mal ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
