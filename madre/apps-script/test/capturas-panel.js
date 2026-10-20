// Capturas del panel en el móvil para la fase 5 y 6 (audios y vídeos, reproduciendo, familia, icono). Uso: node test/capturas-panel.js carpeta_salida
const { spawn } = require('child_process');
const fs = require('fs'), path = require('path');
const { chromium } = require('/opt/node-tools/node_modules/playwright');
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const PUERTO = 8768, base = `http://127.0.0.1:${PUERTO}`;
const sal = process.argv[2] || '/tmp/capturas-panel'; fs.mkdirSync(sal, { recursive: true });
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
const rpcSrv = async (fn, ...args) => (await (await fetch(base + '/rpc', { method: 'POST', body: JSON.stringify({ fn, args }) })).json()).valor;

(async () => {
  const srv = spawn('node', [path.join(__dirname, 'servidor-ui.js'), String(PUERTO)], { stdio: 'ignore' });
  await espera(1500);
  const nav = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
  const abrir = async (query, tema) => {
    const ctx = await nav.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: tema || 'light' });
    const p = await ctx.newPage();
    await p.goto(`${base}/admin?js=1${query || ''}`); await p.waitForSelector('h1'); await espera(900);
    return p;
  };
  const foto = async (p, nombre, completa = true) => { await p.evaluate(() => window.scrollTo(0, 0)); await p.screenshot({ path: `${sal}/${nombre}.png`, fullPage: completa }); console.log(nombre); };
  // Contenido de prueba: una foto de verdad, un vídeo y un audio
  const sembrar = async (p) => {
    await p.evaluate(async () => {
      borrador.de = 'Daniel';
      const cv = document.createElement('canvas'); cv.width = 1200; cv.height = 800; const c = cv.getContext('2d');
      const g = c.createLinearGradient(0, 0, 1200, 800); g.addColorStop(0, '#f5c26b'); g.addColorStop(1, '#8c5a3c'); c.fillStyle = g; c.fillRect(0, 0, 1200, 800);
      c.fillStyle = '#fff8'; c.beginPath(); c.arc(600, 400, 220, 0, 7); c.fill();
      const jpg = await new Promise((ok) => cv.toBlob(ok, 'image/jpeg', 0.8));
      S = await subirMedio(jpg, 'foto', 'Mira qué bonito está el jardín', () => {});
      S = await subirMedio(new Blob([new Uint8Array(900000)], { type: 'video/mp4' }), 'video', '', () => {});
      S = await subirMedio(new Blob([new Uint8Array(480000)], { type: 'audio/wav' }), 'audio', '', () => {});
    });
  };

  let p = await abrir('&js=' + encodeURIComponent("ir('pantalla')"));
  await p.click('.dist[data-dist=lista]'); await espera(500);
  await foto(p, 'panel-pantalla-distribucion');
  await p.context().close();

  p = await abrir(); await sembrar(p);
  await p.evaluate(() => ir('medios')); await espera(400);
  await foto(p, 'panel-audios-y-videos');
  await p.click('text=Reproducir ahora >> nth=0'); await espera(900);
  await foto(p, 'panel-esperando-a-la-tv');
  const orden = await p.evaluate(() => S.medios.repro.orden);
  await rpcSrv('medioEstadoDeLaTV_', String(orden), 'reproduciendo', ''); await p.evaluate(() => sondearMedios()); await espera(600);
  await foto(p, 'panel-reproduciendo');
  await rpcSrv('medioEstadoDeLaTV_', String(orden), 'terminado', ''); await p.evaluate(() => sondearMedios()); await espera(600);
  await foto(p, 'panel-terminado-e-historial');
  await p.click('text=Mostrar ahora en la TV'); await espera(800);
  await foto(p, 'panel-foto-en-la-tele');
  await p.context().close();

  // grabando (micrófono y cámara simulados)
  p = await abrir();
  await p.evaluate(() => ir('medios')); await espera(300);
  await p.click('text=Grabar audio'); await p.click('[role=dialog] >> text=Empezar a grabar'); await espera(3200);
  await foto(p, 'panel-grabando-audio', false);
  await p.click('[role=dialog] >> text=Parar y revisar'); await p.waitForSelector('[role=dialog] audio'); await espera(500);
  await foto(p, 'panel-revisar-audio', false);
  await p.click('[role=dialog] >> text=Cancelar'); await espera(300);
  await p.click('text=Grabar vídeo'); await p.click('[role=dialog] >> text=Empezar a grabar'); await espera(3500);
  await foto(p, 'panel-grabando-video', false);
  await p.context().close();

  // un vídeo HEVC: el aviso
  p = await abrir();
  await p.evaluate(() => ir('medios')); await espera(300);
  await p.evaluate(() => { const b = new Uint8Array(4000); [0, 0, 0, 24, 102, 116, 121, 112].forEach((x, i) => (b[i] = x)); 'hvc1'.split('').forEach((c, i) => (b[2000 + i] = c.charCodeAt(0))); procesarArchivo(new File([b], 'IMG_0001.MOV', { type: 'video/quicktime' })); });
  await espera(800);
  await foto(p, 'panel-aviso-video-hevc', false);
  await p.context().close();

  // familia (Ana)
  p = await abrir('&rol=familia&quien=Ana');
  await sembrar(p); await p.evaluate(() => pintar()); await espera(400);
  await foto(p, 'familiar-pagina');
  await p.context().close();

  // ajustes: icono de la pantalla de inicio
  p = await abrir();
  await p.evaluate(() => ir('ajustes')); await espera(400);
  await (await p.$('#icono-inicio')).screenshot({ path: `${sal}/panel-ajustes-icono.png` }); console.log('panel-ajustes-icono');
  await p.context().close();

  // la app sin enlace
  const ctx = await nav.newContext({ viewport: { width: 390, height: 700 }, deviceScaleFactor: 2 });
  p = await ctx.newPage(); await p.goto(`${base}/web-app/index.html`); await p.waitForSelector('#pegar-enlace'); await espera(300);
  await foto(p, 'app-sin-enlace', false);
  await ctx.close();
  await nav.close(); srv.kill();
})().catch((e) => { console.error(e); process.exit(1); });
