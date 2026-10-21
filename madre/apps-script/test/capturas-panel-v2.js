// Capturas planas del móvil rediseñado a 390×844 (y @2x), en claro y oscuro. Uso: node test/capturas-panel-v2.js carpeta_salida
const { spawn, spawnSync } = require('child_process');
const fs = require('fs'), path = require('path'), os = require('os');
const { chromium } = require('/opt/node-tools/node_modules/playwright');
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const PUERTO = 8769, base = `http://127.0.0.1:${PUERTO}`;
const sal = process.argv[2] || '/tmp/capturas-v2'; fs.mkdirSync(sal, { recursive: true });
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
const FICH = path.join(os.tmpdir(), 'pizarra-capturas'); fs.mkdirSync(FICH, { recursive: true });
const RES = path.join(__dirname, '..', '..', 'app-tv', 'app', 'src', 'test', 'resources');
const TV = process.env.TV_JPG || '';       // una captura real de la tele (JPEG de 640x360) para la vista previa
fs.copyFileSync(path.join(RES, 'foto-recordatorio.jpg'), path.join(FICH, 'cafe.jpg'));
fs.copyFileSync(path.join(RES, 'foto-familiar.jpg'), path.join(FICH, 'retrato.jpg'));
spawnSync('ffmpeg', ['-y', '-v', 'error', '-loop', '1', '-i', path.join(FICH, 'cafe.jpg'), '-f', 'lavfi', '-i', 'sine=frequency=330', '-t', '6', '-vf', 'scale=640:-2', '-c:v', 'libvpx', '-b:v', '400k', '-c:a', 'libopus', '-shortest', path.join(FICH, 'video.webm')]);
const rpc = async (fn, ...args) => (await (await fetch(base + '/rpc', { method: 'POST', body: JSON.stringify({ fn, args }) })).json()).valor;

(async () => {
  const srv = spawn('node', [path.join(__dirname, 'servidor-ui.js'), String(PUERTO)], { stdio: 'ignore', env: Object.assign({}, process.env, { FICHEROS: FICH }) });
  await espera(1500);
  const nav = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
  const datos = await rpc('leer_');
  const ana = datos.familia[0];
  if (TV && fs.existsSync(TV)) await rpc('doPost', { parameter: { a: 'captura', k: 'ADMINKEY' }, postData: { contents: fs.readFileSync(TV).toString('base64') } });
  await rpc('admVisitaGuardar', 'ADMINKEY', { fecha: '2026-10-20', hora: '18:00', persona: ana.id });
  await rpc('admVisitaGuardar', 'ADMINKEY', { fecha: '2026-10-22', texto: 'Viene el fontanero' });
  await rpc('admRutinaGuardar', 'ADMINKEY', { dia: 4, hora: '10:30', texto: 'Viene la asistenta' });
  await rpc('admRutinaGuardar', 'ADMINKEY', { dia: 2, texto: 'Hoy toca peluquería' });
  const id1 = datos.mensajes.find((m) => /Hoy viene Ana/.test(m.texto)).id;
  await rpc('admFijar', 'ADMINKEY', id1, true);

  const sembrar = async (p, quien) => {
    await p.evaluate(async (quien) => {
      borrador.de = 'Daniel';
      const blob = async (n, t) => new Blob([await (await fetch('/ficheros/' + n)).arrayBuffer()], { type: t });
      S = await subirMedio(await blob('cafe.jpg', 'image/jpeg'), 'foto', 'Mira qué buena merienda', () => {});
      S = await subirMedio(await blob('video.webm', 'video/webm'), 'video', '', () => {}, 6);
      const pcm = new Int16Array(16000 * 32); for (let i = 0; i < pcm.length; i++) pcm[i] = Math.sin(i / 9) * 2500;
      S = await subirMedio(wavDe(pcm, 16000), 'audio', '', () => {}, 32);
    }, quien);
  };
  const abrir = async (esquema, query) => {
    const ctx = await nav.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, colorScheme: esquema });
    const p = await ctx.newPage(); p.on('pageerror', (e) => console.log('[error]', e.message));
    await p.goto(`${base}/admin?js=1${query || ''}`); await p.waitForSelector('#barra .t'); await espera(1500);
    return { ctx, p };
  };
  const foto = async (p, nombre, esquema) => {
    await p.evaluate(() => window.scrollTo(0, 0)); await espera(300);
    const f = `${nombre}-${esquema === 'dark' ? 'oscuro' : 'claro'}`;
    await p.screenshot({ path: `${sal}/${f}.png` }); console.log(f);
  };
  for (const esquema of ['light', 'dark']) {
    // administrador
    let { ctx, p } = await abrir(esquema); await sembrar(p);
    await p.evaluate(() => ir('inicio')); await espera(1500);
    await foto(p, '1-inicio', esquema);
    await p.evaluate(async (c) => { await llamar('admMedioReproducir', S.medios.lista.find((m) => m.tipo === 'audio').id, 0); await sondearMedios(); }); await espera(500);
    const orden = await p.evaluate(() => S.medios.repro.orden);
    await rpc('medioEstadoDeLaTV_', String(orden), 'reproduciendo', ''); await p.evaluate(() => sondearMedios()); await espera(800);
    await foto(p, '1b-inicio-reproduciendo', esquema);
    await rpc('medioEstadoDeLaTV_', String(orden), 'terminado', ''); await p.evaluate(() => sondearMedios());
    await p.evaluate(() => ir('mandar')); await espera(500); await foto(p, '2-mandar', esquema);
    await p.evaluate(() => { window.scrollTo(0, 700); }); await espera(300);
    await p.screenshot({ path: `${sal}/2b-mandar-abajo-${esquema === 'dark' ? 'oscuro' : 'claro'}.png` });
    await p.evaluate(() => ir('enviados')); await espera(1200); await foto(p, '3-enviados', esquema);
    await p.evaluate(() => ir('gestion')); await espera(400); await foto(p, '4-engranaje', esquema);
    if (esquema === 'light') {
      await p.evaluate(() => ir('pantalla')); await espera(400); await foto(p, '5-pantalla', esquema);
      await p.evaluate(() => ir('ajustes')); await espera(500);
      await foto(p, '6-ajustes', esquema);
      await p.evaluate(() => document.getElementById('icloud-tarjeta').scrollIntoView()); await espera(300); await p.screenshot({ path: `${sal}/6b-ajustes-icloud-y-avisos-claro.png` });
      await p.evaluate(() => document.getElementById('espacio').scrollIntoView()); await espera(300); await p.screenshot({ path: `${sal}/6c-ajustes-espacio-y-consultas-claro.png` });
      await p.evaluate(() => ir('visitas')); await espera(400); await foto(p, '7-visitas-y-rutina', esquema);
      await p.evaluate(() => ir('mandar')); await espera(300);
      await p.evaluate(() => procesarArchivo(new File([new Uint8Array(10)], 'v.mkv', { type: 'video/x-matroska' }))); await espera(500); await p.screenshot({ path: `${sal}/8-error-junto-a-lo-que-fallo-claro.png` });
      await p.evaluate(() => { borrador.cuando = 'hora'; borrador.fecha = '2026-10-23'; borrador.hora = '09:00'; pintar(); window.scrollTo(0, 380); }); await espera(400); await p.screenshot({ path: `${sal}/9-programar-claro.png` });
      await p.evaluate(() => ir('enviados')); await espera(800);
      await p.click('text=Volver a mandar >> nth=0'); await espera(800); await p.screenshot({ path: `${sal}/10-deshacer-claro.png` });
    }
    await ctx.close();
    // nota de voz en curso
    ({ ctx, p } = await abrir(esquema)); await p.evaluate(() => ir('mandar')); await espera(500);
    const caja = await (await p.$('#mic')).boundingBox(); await p.mouse.move(caja.x + 28, caja.y + 28); await p.mouse.down(); await espera(2500);
    await p.screenshot({ path: `${sal}/2c-mandar-nota-de-voz-${esquema === 'dark' ? 'oscuro' : 'claro'}.png` }); await p.mouse.up(); await espera(500);
    await ctx.close();
    // familiar (Ana)
    ({ ctx, p } = await abrir(esquema, '&rol=familia&quien=Ana')); await sembrar(p);
    await p.evaluate(() => ir('inicio')); await espera(1500); await foto(p, '11-familiar-inicio', esquema);
    await p.evaluate(() => ir('mandar')); await espera(500); await foto(p, '12-familiar-mandar', esquema);
    await p.evaluate(() => ir('enviados')); await espera(1200); await foto(p, '13-familiar-enviados', esquema);
    await ctx.close();
  }
  await nav.close(); srv.kill();
  // las mismas a 2x
  const d2 = path.join(sal, 'a-2x'); fs.mkdirSync(d2, { recursive: true });
})().catch((e) => { console.error(e); process.exit(1); });
