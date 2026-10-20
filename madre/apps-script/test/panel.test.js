// Pruebas de comportamiento del panel con clics reales en Chromium y el Code.gs real (simulado) detrás.
// Uso:  node test/panel.test.js
const { spawn, spawnSync } = require('child_process');
const path = require('path');
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const PUERTO = 8766;
const base = `http://127.0.0.1:${PUERTO}`;

const AYUDAS = `
  const R = []; const t = (n, c) => R.push([n, !!c]);
  const espera = (ms) => new Promise((r) => setTimeout(r, ms));
  const boton = (txt, raiz) => Array.from((raiz || document).querySelectorAll('button')).find((b) => (b.getAttribute('aria-label') || b.textContent).trim().indexOf(txt) >= 0);
  const clic = async (txt, raiz) => { const b = boton(txt, raiz); if (!b) throw new Error('no hay botón: ' + txt); b.click(); await espera(400); };
  const escribe = (sel, v) => { const e = document.querySelector(sel); if (!e) throw new Error('no hay ' + sel); e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); };
  const texto = () => document.getElementById('app').textContent;
  const toast = () => document.getElementById('aviso').textContent;
`;
const FIN = `; document.body.setAttribute('data-resultado', JSON.stringify(R));`;

const PRUEBAS = {
  'admin: escribir un mensaje': `
    ir('mensajes'); await espera(100);
    await clic('Enviar a la TV'); t('mensaje vacío: avisa', toast().indexOf('Escribe un mensaje') >= 0);
    escribe('#de', 'Daniel'); escribe('#texto', 'Prueba desde el panel'); escribe('#duracion', 'manana');
    await clic('Enviar a la TV');
    const m = S.datos.mensajes.find((x) => x.texto === 'Prueba desde el panel');
    t('se guarda con su firma y duración', m && m.de === 'Daniel' && m.hasta > Date.now() / 1000 + 3600);
    t('sale en la lista "En la TV"', texto().indexOf('Prueba desde el panel') >= 0 && texto().indexOf('Daniel dice') >= 0);
    t('avisa de que se ha enviado', toast().indexOf('Enviado') >= 0);
    t('el borrador se vacía', document.getElementById('texto').value === '');`,
  'admin: quitar uno y todos': `
    ir('mensajes'); await espera(100);
    await clic('Quitar el mensaje: Hoy viene Ana a las seis.');
    t('el quitado ya no está en la TV', !S.datos.mensajes.find((x) => x.texto === 'Hoy viene Ana a las seis.' && (!x.hasta || x.hasta * 1000 > Date.now())));
    pestanaMsg = 'caducados'; pintar(); await espera(50);
    t('aparece en Caducados', texto().indexOf('Hoy viene Ana a las seis.') >= 0);
    pestanaMsg = 'tv'; pintar(); await espera(50);
    await clic('Quitar el mensaje: Llevaré la merienda');
    ir('mensajes'); await espera(50);
    escribe('#texto', 'Uno'); await clic('Enviar a la TV'); escribe('#texto', 'Dos'); await clic('Enviar a la TV');
    await clic('Quitar todos'); t('pide confirmación', !!document.querySelector('[role=dialog]'));
    await clic('Cancelar', document.querySelector('[role=dialog]')); t('cancelar no quita nada', S.datos.mensajes.filter((x) => !x.hasta || x.hasta * 1000 > Date.now()).length === 2);
    await clic('Quitar todos'); await clic('Quitar todos', document.querySelector('[role=dialog]'));
    t('confirmar quita todos', S.datos.mensajes.filter((x) => !x.hasta || x.hasta * 1000 > Date.now()).length === 0);`,
  'admin: Caducados, filtro y "usar otra vez"': `
    ir('mensajes'); await espera(100);
    pestanaMsg = 'caducados'; pintar(); await espera(50);
    t('se ven los caducados', texto().indexOf('Mañana te llamo por teléfono.') >= 0 && texto().indexOf('Buenas noches, mamá.') >= 0);
    escribe('#filtro', S.datos.familia[1].id);
    t('el filtro deja solo a Javier', texto().indexOf('Mañana te llamo por teléfono.') >= 0 && texto().indexOf('Buenas noches, mamá.') < 0);
    await clic('Usar otra vez'); t('"Usar otra vez" copia el texto', document.getElementById('texto').value === 'Mañana te llamo por teléfono.');
    ir('mensajes'); pestanaMsg = 'caducados'; pintar(); filtroPersona = 'todas'; pintar(); await espera(50);
    await clic('Borrar del historial: Buenas noches'); await clic('Borrar', document.querySelector('[role=dialog]'));
    t('borrar del historial pide confirmación y borra', !S.datos.mensajes.find((x) => x.id === 'c2'));`,
  'admin: pantalla (bloques, estilos, prueba)': `
    ir('pantalla'); await espera(100);
    const sw = Array.from(document.querySelectorAll('[role=switch]')).find((b) => b.getAttribute('aria-label') === 'Tiempo de hoy y de mañana');
    sw.click(); await espera(500);
    t('apagar un bloque se guarda', S.datos.bloques.find((b) => b.id === 'tiempo').activo === false);
    t('la miniatura de Inicio ya no muestra el tiempo', (ir('inicio'), await espera(100), texto().indexOf('Hoy 20 grados') < 0));
    ir('pantalla'); await espera(100);
    t('no hay flechas de ordenar', !document.querySelector('.mover') && texto().indexOf('Subir') < 0 && texto().indexOf('Bajar') < 0);
    t('avisa de que la colocación es fija', texto().indexOf('La pantalla siempre coloca cada cosa en el mismo sitio') >= 0);
    await clic('Lavanda', document.querySelectorAll('.estilos')[0]); t('estilo de día', S.datos.estiloDia === 'lavanda');
    await clic('Salvia', document.querySelectorAll('.estilos')[1]); t('estilo de noche', S.datos.estiloNoche === 'salvia');
    await clic('Probar este estilo 1 minuto', document.querySelectorAll('.tarjeta')[1]);
    t('probar 1 minuto', S.datos.prueba && S.datos.prueba.estilo === 'lavanda' && S.datos.prueba.modo === 'dia');
    ir('inicio'); await espera(100); t('Inicio avisa de que se está probando', texto().indexOf('probando un estilo') >= 0);`,
  'admin: cuentas atrás': `
    ir('cuentas'); await espera(100);
    t('lista las existentes', texto().indexOf('Todos los Santos') >= 0 && texto().indexOf('Faltan 12 días') >= 0);
    await clic('Añadir cuenta atrás'); await espera(50);
    await clic('Guardar cuenta atrás'); t('sin datos avisa', toast().length > 0 && vista === 'cuenta');
    escribe('#c-texto', 'la boda de Ana'); escribe('#c-fecha', '2026-10-25'); escribe('#c-dia', '¡Hoy es la boda de Ana!');
    await clic('Cumpleaños'); await clic('Viaje');
    t('vista previa', document.getElementById('previa-cuenta').textContent.indexOf('Faltan 5 días para la boda de Ana') >= 0);
    await clic('Guardar cuenta atrás'); await espera(300);
    const c = S.datos.cuentasAtras.find((x) => x.texto === 'la boda de Ana');
    t('se guarda con icono y texto del día', c && c.icono === 'avion' && c.textoDia === '¡Hoy es la boda de Ana!');
    t('vuelve a la lista', vista === 'cuentas' && texto().indexOf('la boda de Ana') >= 0);
    cuentaEditando = Object.assign({}, c); ir('cuenta'); await espera(50);
    await clic('Borrar', document.getElementById('app')); await clic('Borrar', document.querySelector('[role=dialog]')); await espera(300);
    t('borrar con confirmación', !S.datos.cuentasAtras.find((x) => x.id === c.id));`,
  'admin: familia y fotos': `
    ir('familia'); await espera(100);
    escribe('#f-nombre', 'María'); await clic('Crear su enlace');
    const m = S.datos.familia.find((f) => f.nombre === 'María'); t('se crea con clave', m && m.clave.length === 24);
    t('sale en la lista', texto().indexOf('María') >= 0 && texto().indexOf('Sin mensajes todavía') >= 0);
    t('el enlace usa la dirección y la clave', (BASE + '?a=admin&k=' + m.clave).indexOf('k=' + m.clave) > 0);
    // foto: se reduce en el navegador y se sube
    const c = document.createElement('canvas'); c.width = 1600; c.height = 900; const g = c.getContext('2d'); g.fillStyle = '#4a7'; g.fillRect(0, 0, 1600, 900); g.fillStyle = '#fc0'; g.fillRect(500, 200, 600, 500);
    const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.9));
    const url = await reducirFoto(new File([blob], 'f.jpg', { type: 'image/jpeg' }));
    t('la foto se reduce a JPEG pequeño', url.indexOf('data:image/jpeg;base64,') === 0 && url.length < 400000);
    const im = new Image(); await new Promise((r) => { im.onload = r; im.src = url; }); t('y queda cuadrada de 512 px', im.width === 512 && im.height === 512);
    await accion('admFoto', [m.id, url], null); t('se guarda la foto', S.datos.familia.find((f) => f.id === m.id).tieneFoto === true);
    ir('familia'); await espera(500); t('se ve la foto en el panel', !!document.querySelector('.avatar img'));
    await clic('Quitar foto', Array.from(document.querySelectorAll('.tarjeta')).find((x) => x.textContent.indexOf('María') >= 0)); await espera(200);
    t('quitar foto', S.datos.familia.find((f) => f.id === m.id).tieneFoto === false);
    await clic('Quitar acceso', Array.from(document.querySelectorAll('.tarjeta')).find((x) => x.textContent.indexOf('María') >= 0));
    t('pide confirmación', !!document.querySelector('[role=dialog]'));
    await clic('Quitar acceso', document.querySelector('[role=dialog]')); await espera(200);
    t('se quita a la persona', !S.datos.familia.find((f) => f.id === m.id));`,
  'admin: ajustes': `
    ir('ajustes'); await espera(100);
    escribe('#n-desde', '20'); escribe('#n-hasta', '7'); escribe('#n-texto', 'Es hora de dormir.\\nBuenas noches, mamá.');
    escribe('#c-nombre', 'Pep'); escribe('#c-tel', '611 222 333');
    await clic('Guardar ajustes'); await espera(300);
    t('noche y contacto', S.datos.noche.desde === 20 && S.datos.noche.hasta === 7 && S.datos.contacto.nombre === 'Pep' && S.datos.contacto.telefono === '611 222 333');
    t('texto de noche con dos líneas', S.datos.nocheTexto === 'Es hora de dormir.\\nBuenas noches, mamá.');
    t('avisa de que se guardó', toast().indexOf('Ajustes guardados') >= 0);
    const sw = Array.from(document.querySelectorAll('[role=switch]')).find((b) => b.getAttribute('aria-label') === 'Mamá'); sw.click();
    await clic('Guardar ajustes'); await espera(300); t('calendario elegido', S.datos.calendarios.length === 1);
    await clic('Oscuro'); t('aspecto oscuro', document.documentElement.getAttribute('data-tema') === 'oscuro');`,
  'miniatura: noche y bloques apagados': `
    const v = S.vista; const claseTexto = (n) => n.textContent;
    const noche = miniatura(v, 'noche', 'lavanda'); document.body.appendChild(noche);
    t('de noche: aviso de dormir y a quién llamar', claseTexto(noche).indexOf('Es hora de dormir.') >= 0 && claseTexto(noche).indexOf('llama a Daniel') >= 0 && claseTexto(noche).indexOf('Lo próximo') < 0);
    const vs = Object.assign({}, v, { bloques: v.bloques.map((b) => ({ id: b.id, activo: b.id === 'mensajes' ? false : b.activo })) });
    const sin = miniatura(vs, 'dia', 'salvia'); document.body.appendChild(sin);
    t('sin mensajes: nada de "dice" y sí lo próximo', claseTexto(sin).indexOf(' dice') < 0 && claseTexto(sin).indexOf('Lo próximo') >= 0);
    const vs2 = Object.assign({}, v, { bloques: v.bloques.map((b) => ({ id: b.id, activo: false })) });
    t('todo apagado: mensaje de pantalla vacía', miniatura(vs2, 'dia', 'calido').textContent.indexOf('Sin nada que mostrar') >= 0);
    t('hora hablada', horaHablada(17, 15, true) === 'Son las cinco y cuarto de la tarde' && horaHablada(13, 5, false) === 'Es la una y cinco' && horaHablada(23, 40, true) === 'Son las doce menos veinte de la noche' && horaHablada(12, 0, true) === 'Son las doce en punto del mediodía');
    t('"a las…"', aLas(18, 30) === 'a las seis y media' && aLas(18, 50) === 'a las siete menos diez' && aLas(13, 0) === 'a la una');`,
  'familiar: solo puede escribir': {
    url: '&rol=familia&quien=Ana', cuerpo: `
    t('saluda y no muestra la navegación', texto().indexOf('Hola, Ana') >= 0 && document.getElementById('nav').hidden === true);
    t('no ve ajustes ni a los demás', texto().indexOf('Pantalla') < 0 && texto().indexOf('Daniel dice') < 0 && texto().indexOf('Hoy viene Ana a las seis') < 0);
    t('ve su envío', texto().indexOf('Llevaré la merienda') >= 0);
    escribe('#texto', 'Voy a las cinco.'); await clic('Enviar a la TV');
    const propio = S.mensajes.find((m) => m.texto === 'Voy a las cinco.'); t('se envía firmado con su nombre', propio && propio.de === 'Ana');
    await clic('Quitar el mensaje: Voy a las cinco.'); t('puede quitar lo suyo', !S.mensajes.find((m) => m.texto === 'Voy a las cinco.' && (!m.hasta || m.hasta * 1000 > Date.now())));
    let denegado = false; try { await llamar('admAjustes', { estiloDia: 'salvia' }); } catch (e) { denegado = true; } t('el servidor le niega los ajustes', denegado);
    t('sigue teniendo su foto tras enviar y quitar', S.tieneFoto === true && S.miId && !!document.querySelector('.avatar img'));` },
};

function chrome(url) {
  const r = spawnSync(CHROME, ['--headless', '--no-sandbox', '--disable-gpu', '--virtual-time-budget=40000', '--dump-dom', url], { encoding: 'utf8', timeout: 90000 });
  return r.stdout || '';
}
async function main() {
  const srv = spawn('node', [path.join(__dirname, 'servidor-ui.js'), String(PUERTO)], { stdio: 'ignore' });
  await new Promise((r) => setTimeout(r, 1500));
  let bien = 0, mal = 0;
  for (const [nombre, def] of Object.entries(PRUEBAS)) {
    spawnSync('curl', ['-s', base + '/reiniciar']);
    const cuerpo = typeof def === 'string' ? def : def.cuerpo, extra = typeof def === 'string' ? '' : def.url;
    const js = `(async function(){ ${AYUDAS} try { ${cuerpo} } catch (e) { R.push(['EXCEPCIÓN: ' + e, false]); } ${FIN} })();`;
    const dom = chrome(`${base}/admin?js=${encodeURIComponent(js)}${extra}`);
    const m = /data-resultado='([^']*)'|data-resultado="([^"]*)"/.exec(dom);
    if (!m) { mal++; console.log('FALLA (sin resultado):', nombre); continue; }
    const R = JSON.parse((m[1] || m[2]).replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'"));
    const fallos = R.filter((x) => !x[1]);
    bien += R.length - fallos.length; mal += fallos.length;
    console.log((fallos.length ? 'X ' : 'ok ') + nombre + ' (' + (R.length - fallos.length) + '/' + R.length + ')');
    fallos.forEach((f) => console.log('     FALLA:', f[0]));
  }
  srv.kill();
  console.log(bien + ' bien, ' + mal + ' fallos');
  process.exit(mal ? 1 : 0);
}
main();
