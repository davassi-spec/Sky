// Pruebas de comportamiento del panel con clics reales en Chromium y el Code.gs real (simulado) detrás.
// Uso:  node test/panel.test.js
const { spawn, spawnSync } = require('child_process');
const path = require('path');
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const PUERTO = 8766;
const base = `http://127.0.0.1:${PUERTO}`;

const AYUDAS = `
  const R = []; const t = (n, c) => { R.push([n, !!c]); document.body.setAttribute('data-resultado', JSON.stringify(R)); };
  const espera = (ms) => new Promise((r) => setTimeout(r, ms));
  const boton = (txt, raiz) => Array.from((raiz || document).querySelectorAll('button')).find((b) => (b.getAttribute('aria-label') || b.textContent).trim().indexOf(txt) >= 0);
  const clic = async (txt, raiz) => { const b = boton(txt, raiz); if (!b) throw new Error('no hay botón: ' + txt); b.click(); await espera(400); };
  const escribe = (sel, v) => { const e = document.querySelector(sel); if (!e) throw new Error('no hay ' + sel); e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); };
  const texto = () => document.getElementById('app').textContent;
  const toast = () => document.getElementById('aviso').textContent;
  const rpc = (fn, ...args) => new Promise((ok, ko) => google.script.run.withSuccessHandler(ok).withFailureHandler(ko)[fn](...args));
`;
const FIN = `; document.body.setAttribute('data-resultado', JSON.stringify(R)); document.body.setAttribute('data-fin', '1');`;

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
    t('hay cuatro distribuciones con miniatura real', document.querySelectorAll('.dist').length === 4 && Array.from(document.querySelectorAll('.dist img')).every((i) => i.src.indexOf('data:image/jpeg;base64,') === 0));
    t('la distribución va antes que los colores', document.querySelector('.dists').compareDocumentPosition(document.querySelector('.estilos')) & 4);
    t('por defecto la clásica', document.querySelector('.dist[aria-pressed=true]').getAttribute('data-dist') === 'clasica');
    await clic('Lista', document.querySelector('.dists')); await espera(300);
    t('elegir distribución', S.datos.distribucion === 'lista' && document.querySelector('.dist[aria-pressed=true]').getAttribute('data-dist') === 'lista');
    await clic('Probar 1 minuto con esta distribución', document.querySelectorAll('.tarjeta')[2]);
    t('probar 1 minuto', S.datos.prueba && S.datos.prueba.estilo === 'lavanda' && S.datos.prueba.modo === 'dia' && S.datos.prueba.distribucion === 'lista');
    ir('inicio'); await espera(100); t('Inicio avisa de que se está probando', texto().indexOf('probando un estilo') >= 0);`,
  'admin: audios y vídeos (preparar, subir, reproducir y controlar)': { real: 30000, url: '', cuerpo: `
    ir('medios'); await espera(100);
    t('hay tres formas de mandar', !!boton('Grabar audio') && !!boton('Grabar vídeo') && !!boton('Elegir foto, vídeo o audio'));
    t('está en el menú Más y en Inicio', (ir('mas'), await espera(50), texto().indexOf('Audios y vídeos') >= 0) && (ir('inicio'), await espera(50), texto().indexOf('Mandar audio, vídeo o foto') >= 0));
    ir('medios'); await espera(50);
    // audio: de 44,1 kHz a WAV mono de 16 kHz
    const pcm = new Int16Array(44100 * 2); for (let i = 0; i < pcm.length; i++) pcm[i] = Math.sin(i / 20) * 3000;
    const w = await aWav(wavDe(pcm, 44100));
    t('el audio se pasa a WAV de 16 kHz (2 s = 64 KB)', w.type === 'audio/wav' && Math.abs(w.size - (44 + 32000 * 2)) < 100);
    const cab = new DataView(await new Response(w).arrayBuffer());
    t('cabecera WAV correcta: mono, 16 kHz, 16 bits', cab.getUint16(22, true) === 1 && cab.getUint32(24, true) === 16000 && cab.getUint16(34, true) === 16);
    MAX_AUDIO_S = 1; t('un audio más largo que el máximo se rechaza', await aWav(wavDe(Int16Array.from({ length: 16000 * 4 }, (_, i) => Math.sin(i / 7) * 3000), 16000)).then(() => false, (e) => /minuto/.test(e.message))); MAX_AUDIO_S = 60;
    // vídeo
    const falso = (cod) => { const b = new Uint8Array(5000); [0, 0, 0, 24, 102, 116, 121, 112].forEach((x, i) => (b[i] = x)); Array.from(cod).forEach((c, i) => (b[3000 + i] = c.charCodeAt(0))); return new File([b], 'v.mov', { type: 'video/quicktime' }); };
    t('detecta un vídeo HEVC', await esHEVC(falso('hvc1')) && await esHEVC(falso('hev1')) && !(await esHEVC(falso('avc1'))));
    t('el HEVC se rechaza con una explicación clara', await comprobarVideo(falso('hvc1')).then(() => false, (e) => /HEVC/.test(e.message) && /Más compatible/.test(e.message)));
    t('un formato raro se rechaza', await comprobarVideo(new File([new Uint8Array(10)], 'v.mkv', { type: 'video/x-matroska' })).then(() => false, (e) => /no lo entiende/.test(e.message)));
    t('un vídeo demasiado grande se rechaza', await comprobarVideo({ type: 'video/mp4', name: 'v.mp4', size: 500000000 }).then(() => false, (e) => /pesa demasiado/.test(e.message)));
    // foto
    const cv = document.createElement('canvas'); cv.width = 3000; cv.height = 2000; cv.getContext('2d').fillRect(0, 0, 3000, 2000);
    const jpg = await new Promise((ok) => cv.toBlob(ok, 'image/jpeg', 0.9));
    const pf = await prepararArchivo(new File([jpg], 'f.jpg', { type: 'image/jpeg' }));
    const im = await createImageBitmap(pf.blob);
    t('la foto se reduce a 1920 px y es JPEG', pf.tipo === 'foto' && pf.blob.type === 'image/jpeg' && im.width === 1920 && im.height === 1280);
    // subida por trozos (2,5 MB = 3 partes)
    const prog = []; const grande = new Blob([new Uint8Array(2100000)], { type: 'audio/wav' });
    borrador.de = 'Daniel';
    const r1 = await subirMedio(grande, 'audio', '', (f) => prog.push(f));
    S = r1;
    t('la subida va por trozos y avisa del avance', prog.length === 3 && prog[2] === 1);
    t('queda en Preparados', S.medios.lista.length === 1 && S.medios.lista[0].tipo === 'audio');
    await subirMedio(new Blob([pf.blob], { type: 'image/jpeg' }), 'foto', 'Mira el jardín', () => {}).then((r) => { S = r; });
    pintar(); await espera(100);
    t('se ve quién lo envió y el mensaje de la foto', texto().indexOf('Mira el jardín') >= 0 && S.medios.lista.length === 2);
    // reproducir el audio
    await clic('Reproducir ahora'); await espera(300);
    t('al pulsar Reproducir ahora: Esperando a la TV…', texto().indexOf('Esperando a la TV…') >= 0 && S.medios.repro.estado === 'esperando');
    const orden = S.medios.repro.orden;
    await rpc('medioEstadoDeLaTV_', String(orden), 'reproduciendo', '');
    await sondearMedios(); await espera(200);
    t('Reproduciendo, con repetir, parar y volumen', texto().indexOf('Reproduciendo') >= 0 && !!boton('Repetir') && !!boton('Parar') && !!boton('Subir el volumen') && !!boton('Bajar el volumen'));
    await clic('Subir el volumen'); await clic('Repetir');
    const tv = await rpc('estado_'); 
    t('las órdenes llegan a la TV', tv.medio.cmd.c === 'subir' && tv.medio.rep === 1);
    await clic('Parar'); await espera(300);
    t('Parar: la tele vuelve a la pizarra', (await rpc('estado_')).medio === null);
    await rpc('medioEstadoDeLaTV_', String(orden), 'terminado', ''); await sondearMedios(); await espera(100);
    t('Terminado', texto().indexOf('Terminado') >= 0);
    // foto: tiempo
    const sel = document.querySelector('#preparados select'); sel.value = '15'; sel.dispatchEvent(new Event('change'));
    await clic('Mostrar ahora en la TV'); await espera(300);
    t('la foto se queda el tiempo elegido', (await rpc('estado_')).medio.segundos === 900 && (await rpc('estado_')).medio.texto === 'Mira el jardín');
    await clic('Quitar de la tele'); await espera(200);
    // error de la TV
    await clic('Reproducir ahora'); await espera(200);
    await rpc('medioEstadoDeLaTV_', String(S.medios.repro.orden), 'error', 'Esta tele no puede reproducir ese vídeo (formato no compatible).'); await sondearMedios(); await espera(150);
    t('si la tele no puede, el móvil lo explica', texto().indexOf('No se ha podido poner') >= 0 && texto().indexOf('formato no compatible') >= 0);
    // historial y borrar
    ir('medios'); await espera(100);
    t('el historial dice quién lo puso', document.getElementById('historial-medios').textContent.indexOf('Lo puso el administrador') >= 0);
    await clic('Borrar: Audio de Daniel'); await clic('Borrar', document.querySelector('[role=dialog]')); await espera(300);
    t('borrar pide confirmación y borra', S.medios.lista.length === 1 && S.medios.lista[0].tipo === 'foto');` },
  'familiar: manda su audio y solo ve lo suyo': {
    url: '&rol=familia&quien=Ana', real: 15000,
    cuerpo: `
    await espera(100);
    t('en su página hay dónde mandar', !!boton('Grabar audio') && !!boton('Grabar vídeo') && texto().indexOf('Preparados') >= 0);
    borrador.de = '';
    S = await subirMedio(new Blob([new Uint8Array(1200000)], { type: 'audio/wav' }), 'audio', '', () => {}); pintar(); await espera(100);
    t('lo suyo aparece con su nombre', S.medios.lista.length === 1 && S.medios.lista[0].de === 'Ana' && texto().indexOf('Audio de Ana') >= 0);
    await clic('Reproducir ahora'); await espera(300);
    t('lo puede poner en la tele', S.medios.repro && S.medios.repro.estado === 'esperando' && texto().indexOf('Esperando a la TV…') >= 0);
    await clic('Parar'); await espera(200);
    t('y pararlo', (await rpc('estado_')).medio === null);
    t('no ve el historial de la casa', texto().indexOf('Historial') < 0);
    await clic('Borrar: Audio de Ana'); await clic('Borrar', document.querySelector('[role=dialog]')); await espera(300);
    t('y borrarlo', S.medios.lista.length === 0);`
  },
  'admin: grabar audio y vídeo con micrófono y cámara (dispositivos simulados)': { real: 40000, url: '', cuerpo: `
    ir('medios'); await espera(100);
    await clic('Grabar audio'); t('se abre el grabador', !!document.querySelector('[role=dialog]') && texto().indexOf('Preparados') >= 0);
    await clic('Empezar a grabar', document.querySelector('[role=dialog]')); await espera(2600);
    t('graba y cuenta los segundos', /Grabando: [1-9]/.test(document.querySelector('.cuenta-grab').textContent));
    await clic('Parar y revisar', document.querySelector('[role=dialog]')); await espera(2500);
    t('se puede escuchar antes de mandar', !!document.querySelector('[role=dialog] audio') && !!boton('Mandar a la tele'));
    await clic('Mandar a la tele'); await espera(1500);
    const a = S.medios.lista.find((m) => m.tipo === 'audio');
    t('se manda ya convertido a WAV (pesa lo que 16 kHz mono)', !!a && a.bytes > 20000 && a.bytes < 200000);
    await clic('Grabar vídeo'); await clic('Empezar a grabar', document.querySelector('[role=dialog]')); await espera(3000);
    t('el vídeo se ve en pantalla mientras graba', !!document.querySelector('[role=dialog] video') && !document.querySelector('[role=dialog] video').hidden);
    await clic('Parar y revisar', document.querySelector('[role=dialog]')); await espera(1500);
    t('se puede ver antes de mandar', !!document.querySelector('[role=dialog] video[controls]'));
    await clic('Mandar a la tele'); await espera(3000);
    const v = S.medios.lista.find((m) => m.tipo === 'video');
    t('el vídeo queda preparado', !!v && v.bytes > 1000);
    // sin permiso: se explica y se ofrece otra vía
    navigator.mediaDevices.getUserMedia = () => Promise.reject({ name: 'NotAllowedError', message: 'Permission denied' });
    await clic('Grabar audio'); await clic('Empezar a grabar', document.querySelector('[role=dialog]')); await espera(300);
    t('sin permiso: lo explica y ofrece elegir un audio del móvil', texto().indexOf('No hay permiso') >= 0 || document.querySelector('[role=dialog]').textContent.indexOf('No hay permiso') >= 0);
    t('y ofrece usar lo que ya hay en el móvil', !!boton('Elegir un audio del móvil', document.querySelector('[role=dialog]')));` },
  'admin y familia: programar un mensaje y su duración': `
    ir('mensajes'); await espera(100);
    t('hay "Ahora" y "A una hora concreta"', Array.from(document.querySelectorAll('#cuando option')).map((o) => o.textContent).join() === 'Ahora,A una hora concreta' && document.getElementById('fila-hora').hidden);
    t('duraciones: una hora, tres horas, hoy, mañana, siempre', Array.from(document.querySelectorAll('#duracion option')).map((o) => o.value).join() === '1h,3h,hoy,manana,siempre');
    escribe('#texto', 'Sin hora'); escribe('#cuando', 'hora'); await espera(100);
    t('al elegir hora aparecen día y hora', !document.getElementById('fila-hora').hidden && !!document.getElementById('hora-prog') && !!document.getElementById('dia-prog'));
    await clic('Programar para la TV'); t('sin hora avisa', toast().indexOf('Elige la hora') >= 0 && !S.datos.mensajes.find((m) => m.texto === 'Sin hora'));
    escribe('#hora-prog', '23:30'); await espera(100);
    t('una hora de noche avisa de que se verá al amanecer', document.getElementById('aviso-hora').textContent.indexOf('cuando empiece el día (06:00)') >= 0);
    escribe('#duracion', '3h');
    await clic('Programar para la TV'); await espera(500);
    const m = S.datos.mensajes.find((x) => x.texto === 'Sin hora');
    t('queda programado para el día siguiente a las 6:00 y dura 3 horas', m && m.desde && new Date(m.desde * 1000).getHours() === 6 && m.hasta - m.desde === 10800);
    t('el aviso dice cuándo saldrá', toast().indexOf('Programado') >= 0);
    pestanaMsg = 'tv'; pintar(); await espera(100);
    t('en la lista sale marcado como programado', document.querySelector('.programado') && document.querySelector('.programado').textContent.indexOf('Programado: saldrá') >= 0 && document.querySelector('.programado').textContent.indexOf('al amanecer') >= 0);
    t('la TV todavía no lo recibe', !(await rpc('estado_')).mensajes.some((x) => x.texto === 'Sin hora'));
    await clic('Quitar el mensaje: Sin hora'); await espera(300);
    t('se puede cancelar', !(await rpc('estado_')).mensajes.some((x) => x.texto === 'Sin hora') && !activo(S.datos.mensajes.find((x) => x.texto === 'Sin hora')));`,
  'familiar: programar un mensaje': {
    url: '&rol=familia&quien=Ana',
    cuerpo: `
    await espera(100);
    t('en su página también elige cuándo y cuánto', !!document.getElementById('cuando') && !!document.getElementById('duracion'));
    escribe('#texto', 'Te llamo luego'); escribe('#cuando', 'hora'); escribe('#hora-prog', '18:45'); escribe('#duracion', '1h'); await espera(100);
    t('una hora de día no avisa de noche', document.getElementById('aviso-hora').textContent.indexOf('Saldrá en la tele a esa hora') >= 0);
    await clic('Programar para la TV'); await espera(500);
    const m = S.mensajes.find((x) => x.texto === 'Te llamo luego');
    t('queda programado con su hora y una hora de duración', m && m.desde && m.hasta - m.desde === 3600);
    t('en sus envíos sale como programado', document.querySelector('.programado') && document.querySelector('.programado').textContent.indexOf('Programado: saldrá') >= 0);` },
  'admin: vídeos y audios reales (HEVC, largo, nota de voz, abrir la app)': { real: 120000, url: '', cuerpo: `
    const traer = async (n, tipo) => new File([await (await fetch('/ficheros/' + n)).arrayBuffer()], n, { type: tipo });
    ir('medios'); await espera(100);
    const hevc = await traer('hevc.mp4', 'video/mp4');
    t('un MP4 de HEVC de verdad (x265, hvc1) se detecta', await esHEVC(hevc) === true);
    t('un vídeo normal no se toma por HEVC', await esHEVC(await traer('corto.webm', 'video/webm')) === false);
    t('el HEVC que este navegador no puede convertir da la explicación del iPhone', await comprobarVideo(hevc).then(() => false, (e) => /HEVC/.test(e.message) && /Más compatible/.test(e.message)));
    // vídeo de 36 s: se acorta a 30 s
    const largo = await traer('largo.webm', 'video/webm'); const avances = [];
    const cortado = await comprobarVideo(largo).then((b) => b, (e) => e);
    t('un vídeo de 36 s se acorta (sin error)', cortado instanceof Blob && cortado.size > 20000 && cortado.size < 12000000);
    t('el aviso de conversión se cierra al acabar', !document.querySelector('[role=dialog]'));
    // lo que sale se puede ver y su duración es la de 30 s
    const dur = await Promise.race([new Promise((r) => setTimeout(() => r(-2), 10000)), new Promise((ok) => { const v = document.createElement('video'); v.src = URL.createObjectURL(cortado); v.onloadedmetadata = () => { if (v.duration === Infinity) { v.currentTime = 1e9; v.ontimeupdate = () => { v.ontimeupdate = null; ok(v.duration); }; } else ok(v.duration); }; v.onerror = () => ok(-1); })]);
    t('el resultado dura unos 30 s, no 36 (' + Math.round(dur) + ' s)', dur === -2 ? cortado.size > 1000000 : dur > 27 && dur < 33.5);
    // notas de voz
    const ogg = await aWav(await traer('nota.ogg', 'audio/ogg')).then((b) => b, (e) => e);
    t('una nota de audio (ogg/opus) se pasa a WAV de 3 s', ogg instanceof Blob && ogg.type === 'audio/wav' && Math.abs(ogg.size - (44 + 16000 * 2 * 3)) < 3000);
    const m4a = await prepararArchivo(await traer('nota.m4a', 'audio/x-m4a')).then((r) => r.tipo, (e) => 'ERR ' + e.message);
    t('una nota de voz .m4a se entiende (' + m4a + ')', m4a === 'audio' || /leer/.test(m4a));
    // abrir la app: botón cuando no hay permiso
    navigator.mediaDevices.getUserMedia = () => Promise.reject({ name: 'NotAllowedError', message: 'Permission denied' });
    await clic('Grabar audio'); await clic('Empezar a grabar', document.querySelector('[role=dialog]')); await espera(300);
    const a = document.querySelector('[role=dialog] a');
    t('sin permiso: botón grande Abrir la app para grabar', !!a && a.textContent.indexOf('Abrir la app para grabar') >= 0);
    t('que abre la app con mi enlace (clave tras el #)', a.target === '_blank' && a.href.indexOf('github.io/Sky/tele/#u=') >= 0 && a.href.endsWith('&k=ADMINKEY'));
    cerrarDialogo(); ir('familia'); await espera(200);
    t('cada familiar tiene su botón de WhatsApp', !!boton('Enviar por WhatsApp a Ana'));
    ir('ajustes'); await espera(200);
    t('Ajustes: copiar mi enlace y mandármelo por WhatsApp', !!boton('Copiar mi enlace de la app') && !!boton('Enviármelo por WhatsApp'));` },
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
  'admin: recordatorios (crear, foto, días, confirmar, probar, borrar)': `
    ir('recordatorios'); await espera(100);
    t('empieza vacío', texto().indexOf('Todavía no hay ninguno') >= 0);
    await clic('Añadir recordatorio'); await espera(50);
    await clic('Guardar recordatorio'); t('sin texto avisa', toast().indexOf('Escribe qué hay que hacer') >= 0 && vista === 'recordatorio');
    escribe('#r-texto', 'Salir a pasear'); await clic('Guardar recordatorio'); t('sin hora avisa', toast().indexOf('Elige la hora') >= 0);
    escribe('#r-texto2', 'Con calma'); escribe('#r-hora', '17:00'); escribe('#r-dur', '30');
    await clic('Sábado'); await clic('Domingo');
    t('los días se pueden desmarcar', recEditando.dias.join() === '1,2,3,4,5' && texto().indexOf('De lunes a viernes') >= 0);
    await clic('Hay que confirmarlo'); t('confirmar avisa de que faltan los avisos por correo', recEditando.confirmar === true && texto().indexOf('todavía no están activados') >= 0);
    const c = document.createElement('canvas'); c.width = 1600; c.height = 900; const g = c.getContext('2d'); g.fillStyle = '#4a7'; g.fillRect(0, 0, 1600, 900);
    const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.9));
    const url = await reducirFotoLibre(new File([blob], 'f.jpg', { type: 'image/jpeg' }), 900);
    const im = new Image(); await new Promise((r) => { im.onload = r; im.src = url; });
    t('la foto del recordatorio no se deforma y se reduce', im.width === 900 && im.height === 506 && url.length < 400000);
    recEditando._foto = url;
    await clic('Guardar recordatorio'); await espera(300);
    const r = S.datos.recordatorios[0];
    t('se guarda con todos sus datos', r && r.texto === 'Salir a pasear' && r.texto2 === 'Con calma' && r.hora === '17:00' && r.dias.join() === '1,2,3,4,5' && r.duracion === 30 && r.confirmar === true && r.tieneFoto === true);
    t('vuelve a la lista con el resumen', vista === 'recordatorios' && texto().indexOf('Salir a pasear') >= 0 && texto().indexOf('De lunes a viernes') >= 0 && texto().indexOf('hay que confirmarlo') >= 0);
    await espera(500); t('se ve la miniatura de su foto', !!document.querySelector('.mini-foto img'));
    ir('inicio'); await espera(100);
    t('Inicio enseña lo pendiente, con el botón', texto().indexOf('Pendiente de confirmar') >= 0 && texto().indexOf('Salir a pasear') >= 0 && !!boton('Confirmar que lo ha tomado'));
    t('la TV lo estaría enseñando ahora', (await llamar('estado_')).recordatorio.texto === 'Salir a pasear');
    await clic('Confirmar que lo ha tomado'); await espera(300);
    t('al confirmar desaparece de Inicio', S.pendientes.length === 0 && texto().indexOf('Pendiente de confirmar') < 0);
    t('y la TV vuelve a la pizarra', (await llamar('estado_')).recordatorio === null);
    ir('recordatorios'); await espera(100);
    Array.from(document.querySelectorAll('[role=switch]')).find((b) => b.getAttribute('aria-label') === 'Activar: Salir a pasear').click(); await espera(400);
    t('se puede apagar sin borrarlo', S.datos.recordatorios[0].activo === false && S.datos.recordatorios.length === 1);
    recEditando = Object.assign({}, S.datos.recordatorios[0]); ir('recordatorio'); await espera(500);
    t('al editar se carga la foto actual', !!document.querySelector('#r-foto img'));
    await clic('Guardar y probar 1 minuto'); await espera(600);
    const tv = (await llamar('estado_')).recordatorio;
    t('probar 1 minuto lo enseña en la TV', tv && tv.prueba === true && tv.texto === 'Salir a pasear');
    recEditando = Object.assign({}, S.datos.recordatorios[0]); ir('recordatorio'); await espera(100);
    await clic('Quitar foto'); await clic('Guardar recordatorio'); await espera(300);
    t('se puede quitar la foto', S.datos.recordatorios[0].tieneFoto === false);
    recEditando = Object.assign({}, S.datos.recordatorios[0]); ir('recordatorio'); await espera(100);
    await clic('Borrar', document.getElementById('app')); t('borrar pide confirmación', !!document.querySelector('[role=dialog]'));
    await clic('Borrar', document.querySelector('[role=dialog]')); await espera(300);
    t('se borra', S.datos.recordatorios.length === 0 && vista === 'recordatorios');`,
  'admin: avisos por correo en Ajustes': `
    ir('ajustes'); await espera(100);
    t('avisa de que aún no están activados', texto().indexOf('Todavía no están activados') >= 0 && texto().indexOf('autorizar') >= 0);
    t('enseña el correo real, ya puesto', document.querySelector('#a-correo').value === 'yo@ejemplo.com' && texto().indexOf('Ahora mismo los avisos llegan a yo@ejemplo.com') >= 0);
    await clic('Guardar correo'); await espera(200); t('guardarlo tal cual no fija ninguno (sigue el de la cuenta)', S.datos.correoAviso === '');
    escribe('#a-correo', 'esto no es un correo'); await clic('Guardar correo'); t('rechaza un correo mal escrito', toast().indexOf('no parece válido') >= 0);
    escribe('#a-correo', 'dani@ejemplo.com'); await clic('Guardar correo'); await espera(200);
    t('guarda el correo', S.datos.correoAviso === 'dani@ejemplo.com' && toast().indexOf('Correo guardado') >= 0);
    await clic('Enviar un correo de prueba'); await espera(300); t('envía el de prueba', toast().indexOf('Correo de prueba enviado a dani@ejemplo.com') >= 0);`,
  'admin: encuadrar la foto en un círculo': `
    const mk = async () => {
      const c = document.createElement('canvas'); c.width = 1600; c.height = 900; const g = c.getContext('2d'); g.fillStyle = '#44aa77'; g.fillRect(0, 0, 1600, 900); g.fillStyle = '#ffcc00'; g.fillRect(500, 200, 600, 500);
      return new File([await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.95))], 'f.jpg', { type: 'image/jpeg' });
    };
    const pixel = async (url, x, y) => { const im = new Image(); await new Promise((r) => { im.onload = r; im.src = url; }); const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; const g = c.getContext('2d'); g.drawImage(im, 0, 0); return Array.from(g.getImageData(x, y, 1, 1).data); };
    const amarillo = (p) => p[0] > 200 && p[1] > 150 && p[2] < 90, verde = (p) => p[0] < 120 && p[1] > 130 && p[2] > 80;
    let p1 = recortarCirculo(await mk()); await espera(500);
    t('abre el diálogo de encuadre con deslizador', !!document.querySelector('[role=dialog] .recorte canvas') && !!document.getElementById('recorte-zoom'));
    await clic('Usar esta foto'); const u1 = await p1;
    const im1 = new Image(); await new Promise((r) => { im1.onload = r; im1.src = u1; });
    t('sale un JPEG cuadrado de 512 px', u1.indexOf('data:image/jpeg;base64,') === 0 && im1.width === 512 && im1.height === 512 && u1.length < 400000);
    t('sin acercar se ve todo el lado menor (centro amarillo, borde verde)', amarillo(await pixel(u1, 256, 256)) && verde(await pixel(u1, 40, 256)));
    t('el diálogo se cierra', !document.querySelector('[role=dialog]'));
    let p2 = recortarCirculo(await mk()); await espera(500);
    escribe('#recorte-zoom', '3');
    await clic('Usar esta foto'); const u2 = await p2;
    t('acercado: el borde izquierdo ya es amarillo', amarillo(await pixel(u2, 40, 256)));
    let p3 = recortarCirculo(await mk()); await espera(500);
    escribe('#recorte-zoom', '3');
    const cv = document.querySelector('.recorte canvas'); const ev = (tipo, x) => cv.dispatchEvent(new PointerEvent(tipo, { clientX: x, clientY: 100, pointerId: 1, bubbles: true }));
    ev('pointerdown', 50); ev('pointermove', 350); ev('pointerup', 350);
    await clic('Usar esta foto'); const u3 = await p3;
    t('arrastrando la foto cambia el encuadre (el borde izquierdo vuelve a ser verde)', verde(await pixel(u3, 37, 256)));
    let p4 = recortarCirculo(await mk()); await espera(500);
    await clic('Cancelar', document.querySelector('[role=dialog]')); let cancelado = false; try { await p4; } catch (e) { cancelado = e.message === 'cancelado'; }
    t('cancelar no guarda nada', cancelado && !document.querySelector('[role=dialog]'));`,
  'admin: ve quién confirmó un recordatorio': `
    await accion('admRecordatorioGuardar', [{ texto: 'Comer con calma', hora: '17:00', dias: [], duracion: 30, confirmar: true }, null, false], null);
    const ana = S.datos.familia.find((f) => f.nombre === 'Ana');
    const clave = S.pendientes[0].clave;
    await rpc('admRecordatorioConfirmar', ana.clave, clave); await cargar(false); await espera(300);
    ir('inicio'); await espera(200);
    t('Inicio dice quién lo confirmó y cuándo', texto().indexOf('Confirmados hoy') >= 0 && texto().indexOf('Confirmado por Ana a las 17:15') >= 0);
    t('ya no está pendiente', S.pendientes.length === 0 && texto().indexOf('Pendiente de confirmar') < 0);
    ir('recordatorios'); await espera(200); t('la lista también lo dice', texto().indexOf('Confirmado por Ana a las 17:15') >= 0);`,
  'admin: la vista previa es una captura real de la TV': `
    ir('inicio'); await espera(300);
    t('sin captura enseña la aproximada y lo dice', !!document.querySelector('#vista-tv .miniatura') && texto().indexOf('Vista aproximada') >= 0);
    t('y le pide a la TV que mande una', (await llamar('estado_')).captura === true);
    const c = document.createElement('canvas'); c.width = 64; c.height = 36; c.getContext('2d').fillRect(0, 0, 64, 36);
    const b64 = c.toDataURL('image/jpeg', 0.5).split(',')[1];
    const r = await rpc('doPost', { parameter: { a: 'captura', k: 'ADMINKEY' }, postData: { contents: b64 } });
    t('la TV sube su captura', JSON.parse(r.s).ok === true);
    await cargarCaptura(); await espera(300);
    t('ahora se ve la imagen real de la TV y no la aproximada', !!document.querySelector('#vista-tv img.captura') && !document.querySelector('#vista-tv .miniatura'));
    t('y dice de cuándo es', texto().indexOf('Captura de la tele, hace') >= 0);
    t('la foto cabe a todo el ancho de la tarjeta en 16:9', document.querySelector('#vista-tv img.captura').getBoundingClientRect().width > 250);`,
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
    t('sigue teniendo su foto tras enviar y quitar', S.tieneFoto === true && S.miId && !!document.querySelector('.avatar img'));
    t('la vista previa de la tele no se enseña hasta que se pide', !document.querySelector('.miniatura') && texto().indexOf('Ver cómo se ve la tele') >= 0);
    await rpc('admRecordatorioGuardar', 'ADMINKEY', { texto: 'Comer con calma', hora: '17:00', dias: [], duracion: 30, confirmar: true }, null, false); await cargar(false); await espera(300);
    t('el familiar ve lo pendiente de confirmar', texto().indexOf('Pendiente de confirmar') >= 0 && texto().indexOf('Comer con calma') >= 0);
    await clic('Confirmar que lo ha tomado'); await espera(500);
    t('y lo puede confirmar', S.pendientes.length === 0 && texto().indexOf('Pendiente de confirmar') < 0);
    await clic('Ver cómo se ve la tele'); await espera(600);
    t('el familiar puede previsualizar la pantalla de la tele', !!document.querySelector('#previa-tv .miniatura') && texto().indexOf('Es solo para mirar') >= 0);
    t('y ve lo que hay ahora en la tele', document.querySelector('#previa-tv .miniatura').textContent.indexOf('Hoy viene Ana a las seis.') >= 0 && document.querySelector('#previa-tv .miniatura').textContent.indexOf('Merienda con Ana') >= 0);
    await clic('Actualizar'); await espera(500); t('se puede actualizar', !!document.querySelector('#previa-tv .miniatura'));
    await clic('Ocultar'); t('y ocultar', !document.querySelector('.miniatura') && texto().indexOf('Ver cómo se ve la tele') >= 0);
    let sigueSinPoder = false; try { await llamar('admAjustes', { estiloDia: 'salvia' }); } catch (e) { sigueSinPoder = true; } t('mirar no le da permiso para cambiar nada', sigueSinPoder);` },
};

function chrome(url) {
  const r = spawnSync(CHROME, ['--headless', '--no-sandbox', '--disable-gpu', '--virtual-time-budget=40000', '--dump-dom', url], { encoding: 'utf8', timeout: 90000 });
  return r.stdout || '';
}
// Las pruebas que usan el audio y los medios del navegador (decodeAudioData, grabar) van con Playwright y reloj real:
// con el reloj virtual de Chromium se quedan colgadas.
async function chromeReal(url, ms) {
  const { chromium } = require('/opt/node-tools/node_modules/playwright');
  const nav = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
  try {
    const pag = await nav.newPage({ viewport: { width: 500, height: 900 } });
    await pag.goto(url);
    await pag.waitForSelector('body[data-fin]', { timeout: ms, state: 'attached' }).catch(() => {});
    return await Promise.race([pag.content(), new Promise((r) => setTimeout(() => r(''), 8000))]);
  } finally { await nav.close(); }
}
const FICHEROS = path.join(require('os').tmpdir(), 'pizarra-ficheros');
function generarFicheros() {
  require('fs').mkdirSync(FICHEROS, { recursive: true });
  const ff = (...a) => spawnSync('ffmpeg', ['-y', '-v', 'error', ...a], { timeout: 120000 });
  const v = ['-f', 'lavfi', '-i', 'testsrc=size=640x360:rate=15'], au = ['-f', 'lavfi', '-i', 'sine=frequency=440'];
  ff(...v, ...au, '-t', '36', '-c:v', 'libvpx', '-b:v', '300k', '-c:a', 'libopus', path.join(FICHEROS, 'largo.webm'));
  ff(...v, ...au, '-t', '3', '-c:v', 'libx265', '-tag:v', 'hvc1', '-c:a', 'aac', path.join(FICHEROS, 'hevc.mp4'));
  ff(...v, '-t', '3', '-c:v', 'libvpx', '-b:v', '300k', path.join(FICHEROS, 'corto.webm'));
  ff(...au, '-t', '3', '-c:a', 'aac', path.join(FICHEROS, 'nota.m4a'));
  ff(...au, '-t', '3', '-c:a', 'libopus', path.join(FICHEROS, 'nota.ogg'));
}
async function main() {
  generarFicheros();
  const srv = spawn('node', [path.join(__dirname, 'servidor-ui.js'), String(PUERTO)], { stdio: 'ignore', env: Object.assign({}, process.env, { FICHEROS }) });
  await new Promise((r) => setTimeout(r, 1500));
  let bien = 0, mal = 0;
  for (const [nombre, def] of Object.entries(PRUEBAS)) {
    if (process.env.SOLO && !nombre.includes(process.env.SOLO)) continue;
    spawnSync('curl', ['-s', base + '/reiniciar']);
    const cuerpo = typeof def === 'string' ? def : def.cuerpo, extra = typeof def === 'string' ? '' : def.url;
    const js = `(async function(){ ${AYUDAS} try { ${cuerpo} } catch (e) { R.push(['EXCEPCIÓN: ' + e, false]); } ${FIN} })();`;
    const direccion = `${base}/admin?js=${encodeURIComponent(js)}${extra}`;
    const dom = typeof def !== 'string' && def.real ? await chromeReal(direccion, def.real) : chrome(direccion);
    const m = /data-resultado='([^']*)'|data-resultado="([^"]*)"/.exec(dom);
    if (!m) { mal++; console.log('FALLA (sin resultado):', nombre); continue; }
    const R = JSON.parse((m[1] || m[2]).replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'"));
    if (process.env.DEPURAR) console.log((/<title>([^<]*)/.exec(dom) || [])[1], (/data-resultado="([^"]{0,600})/.exec(dom) || [])[1]);
    if (!/data-fin=/.test(dom)) R.push(['la prueba no terminó (se quedó esperando algo)', false]);
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
