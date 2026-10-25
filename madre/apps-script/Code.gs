/**
 * Cerebro de la pizarra (versión 3). Corre en tu cuenta de Google (script.google.com).
 *
 *  - Guarda mensajes, ajustes, cuentas atrás, recordatorios y fotos en un archivo JSON de tu Drive (carpeta "Pizarra").
 *    Las fotos se guardan en esa misma carpeta, privadas: nunca se comparten con un enlace.
 *  - Lee los calendarios que elijas y consulta el tiempo (hoy y mañana).
 *  - Sirve los datos a la TV (?a=estado) y la app del móvil (?a=admin).
 *
 * Dos tipos de clave, siempre en ?k=...:
 *  - La clave de administrador (la que crea `configurar`): lo puede todo. Es la de la TV y la tuya.
 *  - Una clave de familia por persona: solo puede escribir mensajes, quitar los suyos y cambiar su foto.
 *
 * Los mensajes de la familia se muestran directamente, sin aprobación.
 */
var VERSION = 3;
var NOMBRE_CARPETA = 'Pizarra';
var NOMBRE_DATOS = 'pizarra-datos.json';
var MAX_CADUCADOS = 100;          // mensajes ya caducados que se guardan en el historial
var MAX_ACTIVOS = 50;
var DISTRIBUCIONES = ['clasica', 'reloj', 'lista', 'sencillo'];
var ESTILOS = ['calido', 'lavanda', 'salvia', 'terracota', 'contraste'];
var BLOQUES = ['cuentaAtras', 'mensajes', 'proximo', 'tiempo', 'parteDelDia'];
var ICONOS_CUENTA = ['calendario', 'avion', 'corazon', 'tarta'];
var MAX_RECORDATORIOS = 20;
var MEDIOS = {                    // lo que se puede mandar desde el móvil
  audio: { mimes: ['audio/wav', 'audio/x-wav'], max: 4000000 },
  video: { mimes: ['video/mp4', 'video/webm', 'video/quicktime'], max: 35000000 },
  foto: { mimes: ['image/jpeg'], max: 4000000 }
};
var MAX_MEDIOS = 40;              // envíos preparados a la vez
var MAX_PARTES = 40;
var ESPERA_TV_MIN = 15;           // si la TV no contesta en este tiempo, el envío deja de esperar (así nunca salta de madrugada)
var HIST_MEDIOS = 100;
var AVISO_MIN = 30;               // si un recordatorio que hay que confirmar sigue sin confirmar tras estos minutos, llega un correo
var TV_CONECTADA_S = 150;         // la TV pregunta cada 60 s: pasado esto la damos por desconectada

/* ============================================================
 *  Datos: un archivo JSON en Drive, con caché y bloqueo
 *  (las propiedades del script solo admiten 9 KB por valor)
 * ============================================================ */

function base_() {
  return {
    version: VERSION,
    mensajes: [],
    ciudad: 'Maó', latitud: 39.889, longitud: 4.265,
    calendarios: [],
    bloques: BLOQUES.map(function (id) { return { id: id, activo: true }; }),
    estiloDia: 'lavanda', estiloNoche: 'calido',
    distribucion: 'clasica',                       // clasica | reloj | lista | sencillo
    prueba: null,                                  // { estilo, modo, hasta } mientras dura "Probar 1 minuto"
    cuentasAtras: [],
    recordatorios: [],                             // { id, hora 'HH:MM', dias [0..6, 0=domingo], texto, texto2, foto {id,v}, duracion (min), confirmar, activo }
    recEstado: {},                                 // 'idRecordatorio|AAAA-MM-DD' -> { conf: ms, aviso: ms }
    pruebaRec: null,                               // { id, hasta } mientras dura "Probar 1 minuto"
    correoAviso: '',                               // vacío = el correo de tu cuenta de Google
    icloud: '',                                    // enlace webcal:// del calendario de iCloud (solo en los datos, nunca en el repositorio)
    avisoTV: true,                                 // correo si la TV lleva más de 30 minutos sin consultar
    leerVoz: true,                                 // la TV lee en voz alta los mensajes nuevos (nunca de noche)
    visitas: [],                                   // { id, fecha 'AAAA-MM-DD', hora 'HH:MM'|'', persona (id de la familia)|'', texto }
    rutina: [],                                    // { id, dia 0..6 (0 = domingo), hora, persona, texto }
    enlaceApp: '',                                 // dirección de la app del móvil (el envoltorio); sirve para los enlaces de la familia
    idWeb: '',                                     // identificador del script (lo manda la app del móvil): los enlaces de la familia llevan siempre la app, nunca el panel
    noche: { desde: 21, hasta: 6 },
    nocheTexto: 'Es hora de dormir.',
    contacto: { nombre: '', telefono: '' },
    familia: [],
    medios: [],                                    // { id, tipo, de, autor, texto, t, mime, bytes, partes, listo }
    repro: null,                                   // { orden, id, minutos, estado, quien, t, desde, cmd:{n,c}, rep, error }
    histMedios: []                                 // { t, id, tipo, de, quien, texto }
  };
}

/** Rellena lo que falte y migra el formato antiguo (widgets) al nuevo (bloques). */
function normalizar_(d) {
  var b = base_();
  for (var k in b) if (d[k] === undefined || d[k] === null) d[k] = b[k];
  if (d.widgets && !d.bloquesMigrados) {          // formato de la versión 1
    var w = d.widgets;
    d.bloques = BLOQUES.map(function (id) {
      var on = true;
      if (id === 'mensajes' && w.mensajes === false) on = false;
      if (id === 'proximo' && w.eventos === false) on = false;
      if (id === 'tiempo' && w.tiempo === false) on = false;
      return { id: id, activo: on };
    });
    d.bloquesMigrados = true;
  }
  delete d.widgets;
  var vistos = {}, orden = [];
  (d.bloques || []).forEach(function (x) {
    if (BLOQUES.indexOf(x.id) >= 0 && !vistos[x.id]) { vistos[x.id] = 1; orden.push({ id: x.id, activo: x.activo !== false }); }
  });
  BLOQUES.forEach(function (id) { if (!vistos[id]) orden.push({ id: id, activo: true }); });
  d.bloques = orden;
  if (ESTILOS.indexOf(d.estiloDia) < 0) d.estiloDia = 'lavanda';
  if (ESTILOS.indexOf(d.estiloNoche) < 0) d.estiloNoche = 'calido';
  if (DISTRIBUCIONES.indexOf(d.distribucion) < 0) d.distribucion = 'clasica';
  d.version = VERSION;
  return d;
}

function props_() { return PropertiesService.getScriptProperties(); }

function carpeta_() {
  var p = props_();
  var id = p.getProperty('CARPETA_ID');
  if (id) { try { return DriveApp.getFolderById(id); } catch (e) { /* se recrea */ } }
  var it = DriveApp.getFoldersByName(NOMBRE_CARPETA);
  var f = it.hasNext() ? it.next() : DriveApp.createFolder(NOMBRE_CARPETA);
  p.setProperty('CARPETA_ID', f.getId());
  return f;
}

function guardarCache_(d) {
  var cache = CacheService.getScriptCache();
  try { cache.put('datos', JSON.stringify(d), 21600); } catch (e) { cache.remove('datos'); }
}

/** Lee el archivo de Drive. Si no existe, lo crea con los datos de la versión 1 (si los hay) y nada se pierde. */
function cargarDeDrive_() {
  var p = props_();
  var id = p.getProperty('DATOS_ID');
  if (id) {
    try { return normalizar_(JSON.parse(DriveApp.getFileById(id).getBlob().getDataAsString('UTF-8'))); } catch (e) { /* se recrea abajo */ }
  }
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    id = p.getProperty('DATOS_ID');                // otro proceso pudo crearlo mientras esperábamos
    if (id) { try { return normalizar_(JSON.parse(DriveApp.getFileById(id).getBlob().getDataAsString('UTF-8'))); } catch (e) { /* sigue */ } }
    var viejo = p.getProperty('pizarra');          // datos de la versión 1: se copian y se deja la copia antigua
    var d = normalizar_(viejo ? JSON.parse(viejo) : {});
    var f = carpeta_().createFile(NOMBRE_DATOS, JSON.stringify(d), MimeType.PLAIN_TEXT);
    p.setProperty('DATOS_ID', f.getId());
    return d;
  } finally {
    lock.releaseLock();
  }
}

function leer_() {
  var c = CacheService.getScriptCache().get('datos');
  if (c) return normalizar_(JSON.parse(c));      // la caché puede traer datos de una versión anterior: se normalizan siempre
  var d = cargarDeDrive_();
  guardarCache_(d);
  return d;
}

function escribir_(d) {
  DriveApp.getFileById(props_().getProperty('DATOS_ID')).setContent(JSON.stringify(d));
  guardarCache_(d);
}

/** Lee, cambia y guarda con el seguro puesto, para que dos personas a la vez no se pisen. */
function modificar_(fn) {
  leer_();                                         // asegura que el archivo existe antes de bloquear
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    var d = leer_();
    var r = fn(d);
    podar_(d);
    escribir_(d);
    return r;
  } finally {
    lock.releaseLock();
  }
}

/** Historial: se guardan los 100 últimos caducados y todos los activos (hasta 50). */
function podar_(d) {
  var ahora = Date.now();
  var vivos = [], muertos = [];
  d.mensajes.forEach(function (m) { (esVivo_(m, ahora) ? vivos : muertos).push(m); });
  vivos.sort(function (a, b) { return b.t - a.t; });
  muertos.sort(function (a, b) { return b.t - a.t; });
  d.mensajes = vivos.slice(0, MAX_ACTIVOS).concat(muertos.slice(0, MAX_CADUCADOS));
  var limite = fechaClave_(new Date(ahora - 4 * 86400000));        // del estado de los recordatorios solo se guardan los últimos días
  for (var c in d.recEstado) if (c.split('|')[1] < limite) delete d.recEstado[c];
}
/** "DANIEL" o "daniel" se escribe "Daniel"; lo que ya tiene mayúsculas y minúsculas mezcladas ("María José", "Pep del Pino") se deja como está. */
function bonito_(n) {
  n = String(n || '').trim();
  if (n.length < 2 || (n !== n.toUpperCase() && n !== n.toLowerCase())) return n;
  return n.toLowerCase().replace(/(^|[\s\-'])([a-záéíóúüñ])/g, function (m, a, b) { return a + b.toUpperCase(); });
}
function esVivo_(m, ahora) { return !m.hasta || m.hasta * 1000 > (ahora || Date.now()); }
/** Un mensaje programado todavía no se ve hasta que llegue su hora (m.desde, en segundos). */
function yaSeVe_(m, ahora) { return !m.desde || m.desde * 1000 <= (ahora || Date.now()); }

/* ============================================================
 *  Claves y permisos
 * ============================================================ */

function clave_() { return props_().getProperty('CLAVE'); }
function nuevaClave_() { return Utilities.getUuid().replace(/-/g, '').slice(0, 24); }
function salida_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function quien_(k) {
  if (!k) return null;
  if (k === clave_()) return { rol: 'admin', id: 'admin', nombre: '' };
  var f = leer_().familia;
  for (var i = 0; i < f.length; i++) if (f[i].clave === k) return { rol: 'familia', id: f[i].id, nombre: f[i].nombre };
  return null;
}
function admin_(k) { var q = quien_(k); if (!q || q.rol !== 'admin') throw new Error('No tienes permiso para esto'); return q; }
function alguien_(k) { var q = quien_(k); if (!q) throw new Error('Clave incorrecta'); return q; }

/** Ejecútala UNA vez desde el editor: crea la clave secreta y la muestra en el registro. */
function configurar() {
  var p = props_();
  if (!p.getProperty('CLAVE')) p.setProperty('CLAVE', nuevaClave_());
  Logger.log('Tu clave secreta es: ' + p.getProperty('CLAVE'));
  autorizar();
}

/** Ejecútala tras pegar esta versión: pide los permisos nuevos (Drive) y migra los datos al archivo de Drive. */
function autorizar() {
  CalendarApp.getDefaultCalendar();
  UrlFetchApp.fetch('https://api.open-meteo.com/v1/forecast?latitude=0&longitude=0&current=temperature_2m');
  var d = leer_();
  Logger.log('Datos en Drive, carpeta "' + NOMBRE_CARPETA + '". Mensajes guardados: ' + d.mensajes.length +
    '. Personas de la familia: ' + d.familia.length + '.');
  MailApp.getRemainingDailyQuota();                // pide el permiso de enviar correos
  Logger.log('Copia y limpieza diarias: ' + (activarLimpieza_() ? 'activadas (cada madrugada).' : 'NO se pudieron activar.'));
  Logger.log('Avisos por correo: ' + (activarAvisos_() ? 'activados (se comprueba cada 5 minutos).' : 'NO se pudieron activar.'));
}

/** Crea (una sola vez) la comprobación automática de recordatorios sin confirmar. */
function activarAvisos_() {
  var ts = ScriptApp.getProjectTriggers();
  for (var i = 0; i < ts.length; i++) if (ts[i].getHandlerFunction() === 'revisarAvisos') return true;
  ScriptApp.newTrigger('revisarAvisos').timeBased().everyMinutes(5).create();
  return true;
}
/** El activador diario de la copia y la limpieza (se crea con autorizar). */
function activarLimpieza_() {
  var ts = ScriptApp.getProjectTriggers();
  for (var i = 0; i < ts.length; i++) if (ts[i].getHandlerFunction() === 'limpiezaDiaria') return true;
  ScriptApp.newTrigger('limpiezaDiaria').timeBased().everyDays(1).atHour(3).create();
  return true;
}

function avisosActivos_() {
  try {
    var ts = ScriptApp.getProjectTriggers();
    for (var i = 0; i < ts.length; i++) if (ts[i].getHandlerFunction() === 'revisarAvisos') return true;
  } catch (e) { /* sin permiso todavía */ }
  return false;
}

/* ============================================================
 *  Peticiones web
 * ============================================================ */

/* ============================================================
 *  Peticiones web
 * ============================================================ */

function doGet(e) {
  var t0 = Date.now();
  var accion = (e && e.parameter && e.parameter.a) || 'estado';
  try {
    return servir_(e);
  } finally {
    anotar_(accion, Date.now() - t0);
  }
}

/** La TV manda por POST una foto de su pantalla (?a=captura, con la clave de administrador). */
function doPost(e) {
  var t0 = Date.now();
  try {
    return servirPost_(e);
  } finally {
    anotar_(e && e.parameter && e.parameter.a === 'rpc' ? 'rpc' : 'post', Date.now() - t0);
  }
}

/** Las únicas funciones que se pueden llamar desde fuera de Apps Script (la app del móvil en su propia página). Cada una comprueba la clave. */
var RPC_ = {
  admEstado: admEstado, admVistaPrevia: admVistaPrevia, admCapturaTV: admCapturaTV, admEnviar: admEnviar, admBorrar: admBorrar,
  admEliminarDelHistorial: admEliminarDelHistorial, admAjustes: admAjustes, admProbarEstilo: admProbarEstilo,
  admGuardarCuentaAtras: admGuardarCuentaAtras, admBorrarCuentaAtras: admBorrarCuentaAtras, admFamiliaAnadir: admFamiliaAnadir,
  admFamiliaQuitar: admFamiliaQuitar, admFoto: admFoto, admFotoQuitar: admFotoQuitar, admLeerFoto: admLeerFoto,
  admRecordatorioGuardar: admRecordatorioGuardar, admRecordatorioBorrar: admRecordatorioBorrar, admRecordatorioConfirmar: admRecordatorioConfirmar,
  admRecordatorioProbar: admRecordatorioProbar, admRecordatorioFoto: admRecordatorioFoto, admCorreoAviso: admCorreoAviso,
  admCorreoPrueba: admCorreoPrueba, admBuscarCiudad: admBuscarCiudad, admMedioNuevo: admMedioNuevo, admMedioParte: admMedioParte,
  admMedioFin: admMedioFin, admMedioBorrar: admMedioBorrar, admMedioReproducir: admMedioReproducir, admMedioControl: admMedioControl,
  admMediosEstado: admMediosEstado, admVisitaGuardar: admVisitaGuardar, admVisitaBorrar: admVisitaBorrar, admRutinaGuardar: admRutinaGuardar,
  admRutinaBorrar: admRutinaBorrar, admProbarICloud: admProbarICloud, admEspacio: admEspacio,
  admMensajeRestaurar: admMensajeRestaurar, admFijar: admFijar, admMedioRestaurar: admMedioRestaurar, admMedioMini: admMedioMini
};

/** ?a=rpc: el cuerpo es { fn, args } (la clave va dentro de args, nunca en la dirección). Devuelve { valor } o { error }. */
function rpc_(e) {
  try {
    var c = JSON.parse(String((e.postData && e.postData.contents) || '{}'));
    var f = Object.prototype.hasOwnProperty.call(RPC_, c.fn) ? RPC_[c.fn] : null;
    if (!f || !Array.isArray(c.args)) return salida_({ error: 'Esa orden no existe' });
    return salida_({ valor: f.apply(null, c.args) });
  } catch (err) {
    return salida_({ error: String(err && err.message ? err.message : err).replace(/^Error:\s*/, '') });
  }
}

function servirPost_(e) {
  if (e && e.parameter && e.parameter.a === 'rpc') return rpc_(e);
  var k = e && e.parameter ? e.parameter.k : '';
  var q = quien_(k);
  if (!q) return salida_({ error: 'clave' });
  var a = e.parameter.a;
  if (a === 'captura') {
    if (q.rol !== 'admin') return salida_({ error: 'permiso' });
    var b64 = String((e.postData && e.postData.contents) || '').replace(/\s/g, '');
    if (b64.length < 100 || b64.length > 95000 || !/^[A-Za-z0-9+\/=]+$/.test(b64) || b64.indexOf('/9j/') !== 0) return salida_({ error: 'captura no válida' });
    var cache = CacheService.getScriptCache();
    cache.put('captura_jpg', b64, 21600);
    cache.put('captura_t', String(Date.now()), 21600);
    return salida_({ ok: true });
  }
  return salida_({ error: 'acción desconocida' });
}

function servir_(e) {
  var k = e && e.parameter ? e.parameter.k : '';
  var q = quien_(k);
  if (!q) return salida_({ error: 'clave' });
  var a = e.parameter.a || 'estado';
  if (a === 'admin') {
    var t = HtmlService.createTemplateFromFile('Admin');
    t.clave = k;
    t.rol = q.rol;
    t.enlaceBase = ScriptApp.getService().getUrl();
    return t.evaluate().setTitle('La tele de mamá')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1');
  }
  if (q.rol !== 'admin') return salida_({ error: 'permiso' });   // la TV usa la clave de administrador
  if (a === 'metricas') return salida_(metricas_());
  if (a === 'foto') return salida_(fotoParaTV_(e.parameter.p));       // foto de una persona o de un recordatorio
  if (a === 'medio') return salida_(parteMedioParaTV_(e.parameter.id, e.parameter.n));
  if (a === 'medioEstado') return salida_(medioEstadoDeLaTV_(e.parameter.o, e.parameter.e, e.parameter.m));
  marcarTV_(e.parameter.v);
  var est = estado_();
  anotarVistos_(est.mensajes);
  return salida_(est);
}

/* ============================================================
 *  Contador de uso: cuántas peticiones llegan y cuánto tardan, por día y por tipo.
 *  Sirve para comprobar que estamos lejos de las cuotas de una cuenta gratuita (?a=metricas, con la clave de admin).
 *  Es aproximado: se acumula en la caché y se vuelca a las propiedades como mucho una vez por minuto.
 *  El tiempo es el de dentro de doGet; el tiempo real de ejecución sale en la pantalla "Ejecuciones" de Apps Script.
 * ============================================================ */

function anotar_(accion, ms) {
  try {
    var cache = CacheService.getScriptCache();
    var pend = JSON.parse(cache.get('met_pend') || '{}');
    var m = pend[accion] || { n: 0, ms: 0, max: 0 };
    m.n++; m.ms += ms; if (ms > m.max) m.max = ms;
    pend[accion] = m;
    var ahora = Date.now();
    var ultimo = Number(cache.get('met_volcado') || 0);
    if (ahora - ultimo < 600000) { cache.put('met_pend', JSON.stringify(pend), 21600); return; }
    var p = props_();
    var dia = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd');
    var todo = JSON.parse(p.getProperty('METRICAS') || '{}');
    var hoy = todo[dia] || {};
    for (var a in pend) {
      var h = hoy[a] || { n: 0, ms: 0, max: 0 };
      h.n += pend[a].n; h.ms += pend[a].ms; if (pend[a].max > h.max) h.max = pend[a].max;
      hoy[a] = h;
    }
    todo[dia] = hoy;
    Object.keys(todo).sort().slice(0, -8).forEach(function (d) { delete todo[d]; });     // solo los últimos 8 días
    p.setProperty('METRICAS', JSON.stringify(todo));
    cache.remove('met_pend');
    cache.put('met_volcado', String(ahora), 21600);
  } catch (err) { /* medir nunca debe romper una petición */ }
}

function metricas_() {
  var todo = JSON.parse(props_().getProperty('METRICAS') || '{}');
  var pend = JSON.parse(CacheService.getScriptCache().get('met_pend') || '{}');
  var dias = {};
  Object.keys(todo).sort().forEach(function (d) {
    dias[d] = {};
    for (var a in todo[d]) dias[d][a] = { peticiones: todo[d][a].n, msTotal: todo[d][a].ms, msMedio: Math.round(todo[d][a].ms / todo[d][a].n), msMaximo: todo[d][a].max };
  });
  return { dias: dias, pendientesDeVolcar: pend,
           cuotasGratuitas: { ejecucionPorLlamada: '6 min', triggersAlDia: '90 min', llamadasUrlFetchAlDia: 20000, ejecucionesSimultaneas: 30 } };
}

/* ============================================================
 *  Lo que ve la TV
 * ============================================================ */

function marcarTV_(version) {
  var ahora = Math.floor(Date.now() / 1000);
  var cache = CacheService.getScriptCache();
  cache.put('tv', String(ahora), 21600);
  version = String(version || '').replace(/[^0-9A-Za-z.\-]/g, '').slice(0, 12);
  if (version && cache.get('tvv') !== version) {          // la versión de la app de la tele, para enseñarla en el panel
    cache.put('tvv', version, 21600);
    props_().setProperty('TV_VERSION', version);
  }
  var ultimaProp = Number(cache.get('tv_prop') || 0);
  if (ahora - ultimaProp > 300) {                  // se anota en las propiedades como mucho cada 5 min
    props_().setProperty('TV_ULTIMA', String(ahora));
    cache.put('tv_prop', String(ahora), 21600);
  }
  contarConsultaTV_(cache);
}

/** Cuántas veces ha preguntado la TV en cada hora (las últimas 48): sirve para ver si se apaga o se queda callada. */
function horaClave_(ms) { return Utilities.formatDate(new Date(ms), Session.getScriptTimeZone(), 'yyyyMMddHH'); }
function contarConsultaTV_(cache) {
  try {
    var h = horaClave_(Date.now());
    var c = JSON.parse(cache.get('tvn') || 'null');
    if (c && c.h !== h) {                                       // cambió la hora: lo de la hora anterior pasa a las propiedades
      var todo = JSON.parse(props_().getProperty('TV_HORAS') || '{}');
      todo[c.h] = c.n;
      Object.keys(todo).sort().slice(0, -48).forEach(function (k) { delete todo[k]; });
      props_().setProperty('TV_HORAS', JSON.stringify(todo));
      c = null;
    }
    if (!c) c = { h: h, n: 0 };
    c.n++;
    cache.put('tvn', JSON.stringify(c), 21600);
  } catch (e) { /* contar nunca debe romper una consulta */ }
}
/** Las últimas 24 horas: [{ h: 'aaaammddhh', n }] (la hora en curso incluida). */
function tvHoras_() {
  var todo = {};
  try { todo = JSON.parse(props_().getProperty('TV_HORAS') || '{}'); } catch (e) { /* vacío */ }
  try { var c = JSON.parse(CacheService.getScriptCache().get('tvn') || 'null'); if (c) todo[c.h] = c.n; } catch (e2) { /* vacío */ }
  var out = [], ahora = Date.now();
  for (var i = 23; i >= 0; i--) { var h = horaClave_(ahora - i * 3600000); out.push({ h: h, n: todo[h] || 0 }); }
  return out;
}

function tvUltima_() {
  var c = CacheService.getScriptCache().get('tv');
  return Number(c || props_().getProperty('TV_ULTIMA') || 0);
}

/** Lo que se sabe de la tele: última consulta, si está conectada y qué versión de la app tiene. */
function tvEstado_() {
  var ult = tvUltima_();
  var v = CacheService.getScriptCache().get('tvv') || props_().getProperty('TV_VERSION') || '';
  return { ultima: ult, conectada: (Date.now() / 1000 - ult) < TV_CONECTADA_S, version: v };
}

function bloqueActivo_(d, id) {
  for (var i = 0; i < d.bloques.length; i++) if (d.bloques[i].id === id) return d.bloques[i].activo;
  return true;
}

function estado_() {
  var d = leer_();
  var ahora = Date.now();
  var vivos = d.mensajes.filter(function (m) { return esVivo_(m, ahora) && yaSeVe_(m, ahora); }).sort(function (a, b) { return (b.fijado ? 1 : 0) - (a.fijado ? 1 : 0) || (b.desde || b.t) - (a.desde || a.t); });   // el fijado se queda arriba
  var verMsg = bloqueActivo_(d, 'mensajes'), verEv = bloqueActivo_(d, 'proximo'), verT = bloqueActivo_(d, 'tiempo');
  var prueba = d.prueba && d.prueba.hasta > ahora ? { estilo: d.prueba.estilo, distribucion: d.prueba.distribucion || null, modo: d.prueba.modo, segundos: Math.round((d.prueba.hasta - ahora) / 1000) } : null;
  return {
    ahora: new Date(ahora).toISOString(),
    version: VERSION,
    // Formato de la versión 1 (lo lee la app de la TV ya instalada):
    widgets: { mensajes: verMsg, eventos: verEv, tiempo: verT },
    noche: d.noche,
    nocheTexto: d.nocheTexto,
    contacto: d.contacto,
    mensajes: verMsg ? vivos.slice(0, 2).map(function (m) { return mensajeParaTV_(m, d); }) : [],
    eventos: verEv ? eventos_(d) : [],
    tiempo: verT ? tiempo_(d.latitud, d.longitud) : null,
    // Novedades de la versión 2:
    bloques: d.bloques,
    estiloDia: d.estiloDia,
    estiloNoche: d.estiloNoche,
    distribucion: d.distribucion,
    prueba: prueba,
    cuentaAtras: bloqueActivo_(d, 'cuentaAtras') ? cuentaAtras_(d) : null,
    // Novedades de la versión 3:
    recordatorio: recordatorioActivo_(d, ahora),
    captura: capturaPedida_(),
    // Novedades de la versión 5 (audios, vídeos y fotos a distancia):
    leerVoz: !!d.leerVoz,
    medio: medioParaTV_(d, ahora),
    rapido: reproPendiente_(d, ahora)
  };
}

/** ¿Alguien mira la vista previa en el panel y hace falta una captura nueva? La TV la manda (como mucho cada 5 s). */
function capturaPedida_() {
  var v = CacheService.getScriptCache().getAll(['captura_ped', 'captura_t']);
  var ped = Number(v.captura_ped || 0);
  if (!ped || Date.now() - ped > 150000) return false;
  return Date.now() - Number(v.captura_t || 0) > 5000;
}

/** La TV acaba de recibir estos mensajes: se apunta cuándo los vio por primera vez ("Visto en la tele a las 18:02"). */
function anotarVistos_(msgs) {
  var ids = {};
  (msgs || []).forEach(function (m) { ids[m.id] = 1; });
  var faltan = leer_().mensajes.some(function (m) { return ids[m.id] && !m.visto; });
  if (!faltan) return;
  var ahora = Math.floor(Date.now() / 1000);
  modificar_(function (d) { d.mensajes.forEach(function (m) { if (ids[m.id] && !m.visto) m.visto = ahora; }); });
}

function mensajeParaTV_(m, d) {
  var f = null;
  for (var i = 0; i < d.familia.length; i++) if (d.familia[i].id === m.autor) f = d.familia[i];
  return { id: m.id, de: bonito_(m.de), texto: m.texto, t: m.t, hasta: m.hasta, autor: m.autor, foto: f && f.foto ? f.foto.v : null };
}

function tiempo_(lat, lon) {
  var cache = CacheService.getScriptCache();
  var clave = 'tiempo2_' + lat + '_' + lon;
  var hit = cache.get(clave);
  if (hit) return JSON.parse(hit);
  try {
    var r = UrlFetchApp.fetch('https://api.open-meteo.com/v1/forecast?latitude=' + lat + '&longitude=' + lon +
      '&current=temperature_2m,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min&forecast_days=2&timezone=auto',
      { muteHttpExceptions: true });
    var j = JSON.parse(r.getContentText());
    var c = j.current, dd = j.daily;
    var t = {
      temp: c.temperature_2m, codigo: c.weather_code,       // formato de la versión 1
      hoy: { temp: c.temperature_2m, codigo: c.weather_code, max: dd.temperature_2m_max[0], min: dd.temperature_2m_min[0] },
      manana: { temp: dd.temperature_2m_max[1], codigo: dd.weather_code[1], max: dd.temperature_2m_max[1], min: dd.temperature_2m_min[1] }
    };
    cache.put(clave, JSON.stringify(t), 1800);
    return t;
  } catch (err) {
    return null;
  }
}

/* ---------- Cuentas atrás ---------- */

function hoyMedianoche_() {
  var n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), n.getDate());
}
function diasHasta_(fecha) {                       // fecha 'AAAA-MM-DD'
  var p = String(fecha).split('-');
  var objetivo = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
  return Math.round((objetivo.getTime() - hoyMedianoche_().getTime()) / 86400000);
}

/** La cuenta atrás más cercana que ya toque mostrar. El día del evento dice "Hoy es…" y al día siguiente desaparece. */
function cuentaAtras_(d) {
  var mejor = null;
  d.cuentasAtras.forEach(function (c) {
    var dias = diasHasta_(c.fecha);
    if (dias < 0 || dias > (c.desdeDias || 30)) return;
    if (!mejor || dias < mejor.dias) mejor = { dias: dias, c: c };
  });
  if (!mejor) return null;
  var c = mejor.c, dias = mejor.dias, texto;
  if (dias === 0) texto = c.textoDia ? c.textoDia : 'Hoy es ' + c.texto;
  else if (dias === 1) texto = 'Falta 1 día para ' + c.texto;
  else texto = 'Faltan ' + dias + ' días para ' + c.texto;
  return { id: c.id, texto: texto, icono: c.icono, dias: dias };
}

/** Texto del día siguiente, para la vista previa del panel ("Mañana dirá: Faltan 11 días"). */
function textoCuenta_(c, dias) {
  if (dias <= 0) return c.textoDia ? c.textoDia : 'Hoy es ' + c.texto;
  if (dias === 1) return 'Falta 1 día para ' + c.texto;
  return 'Faltan ' + dias + ' días para ' + c.texto;
}

/* ---------- Recordatorios ---------- */

function pad2_(n) { return (n < 10 ? '0' : '') + n; }
function fechaClave_(dt) { return dt.getFullYear() + '-' + pad2_(dt.getMonth() + 1) + '-' + pad2_(dt.getDate()); }

/** "9:5" no vale; "9:05" y "09:05" sí. Devuelve 'HH:MM' o null. */
function horaValida_(h) {
  var m = /^(\d{1,2}):(\d{2})$/.exec(String(h || '').trim());
  if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) return null;
  return pad2_(Number(m[1])) + ':' + m[2];
}

/** ¿Es de noche a esa hora? Mismo criterio que la TV (admite tramos que cruzan la medianoche). */
function esNocheHora_(d, h) {
  var n = d.noche;
  if (n.desde === n.hasta) return false;
  if (n.desde < n.hasta) return h >= n.desde && h < n.hasta;
  return h >= n.desde || h < n.hasta;
}

function recordatorioPorId_(d, id) {
  for (var i = 0; i < d.recordatorios.length; i++) if (d.recordatorios[i].id === id) return d.recordatorios[i];
  return null;
}

/** Las veces que toca cada recordatorio hoy y ayer (ayer, por si uno cruza la medianoche). */
function ocurrencias_(d, ahora) {
  var out = [];
  var hoy = new Date(ahora);
  for (var atras = 0; atras <= 1; atras++) {
    var dia = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - atras);
    d.recordatorios.forEach(function (r) {
      if (r.activo === false || r.dias.indexOf(dia.getDay()) < 0) return;
      var p = r.hora.split(':');
      var ini = new Date(dia.getFullYear(), dia.getMonth(), dia.getDate(), Number(p[0]), Number(p[1])).getTime();
      out.push({ rec: r, clave: r.id + '|' + fechaClave_(dia), ini: ini, fin: ini + r.duracion * 60000 });
    });
  }
  out.sort(function (a, b) { return a.ini - b.ini; });
  return out;
}

/** El recordatorio que la TV debe mostrar ahora, o null. De noche no salta ninguno. */
function recordatorioActivo_(d, ahora) {
  if (d.pruebaRec && d.pruebaRec.hasta > ahora) {
    var rp = recordatorioPorId_(d, d.pruebaRec.id);
    if (rp) return paraTV_(rp, d.pruebaRec.id + '|prueba', Math.ceil((d.pruebaRec.hasta - ahora) / 1000), true);
  }
  if (esNocheHora_(d, new Date(ahora).getHours())) return null;
  var oc = ocurrencias_(d, ahora);
  for (var i = 0; i < oc.length; i++) {
    var o = oc[i], est = d.recEstado[o.clave];
    if (o.ini <= ahora && ahora < o.fin && !(est && est.conf)) return paraTV_(o.rec, o.clave, Math.ceil((o.fin - ahora) / 1000), false);
  }
  return null;
}

function paraTV_(r, clave, segundos, prueba) {
  return { id: r.id, clave: clave, texto: r.texto, texto2: r.texto2, foto: r.foto ? r.foto.v : null,
           confirmar: !!r.confirmar, segundos: segundos, prueba: !!prueba };
}

/** Los que esperan que alguien los confirme (el móvil enseña el botón "Confirmar que lo ha tomado"). */
function pendientes_(d, ahora) {
  var out = [];
  ocurrencias_(d, ahora).forEach(function (o) {
    var est = d.recEstado[o.clave];
    if (!o.rec.confirmar || (est && est.conf) || o.ini > ahora) return;
    if (ahora > o.ini + Math.max(o.rec.duracion, 180) * 60000) return;      // pasadas 3 h se da por perdido
    out.push({ id: o.rec.id, clave: o.clave, texto: o.rec.texto, hora: o.rec.hora, ini: o.ini,
               avisado: !!(est && est.aviso), enMarcha: ahora < o.fin });
  });
  return out;
}

/** Se ejecuta sola cada 5 minutos (la crea `autorizar`). Manda un correo si algo sigue sin confirmar tras 30 minutos. */
function revisarAvisos() {
  var d = leer_();
  var ahora = Date.now();
  try { avisoTV_(d); } catch (e0) { Logger.log('Aviso de la TV: ' + e0); }
  var debidos = ocurrencias_(d, ahora).filter(function (o) {
    var est = d.recEstado[o.clave];
    return o.rec.confirmar && !(est && est.conf) && !(est && est.aviso) &&
           ahora >= o.ini + AVISO_MIN * 60000 && ahora <= o.ini + 6 * 3600000;
  });
  var enviados = [];
  debidos.forEach(function (o) {
    try {
      enviarCorreo_(d, 'Pizarra: sin confirmar «' + o.rec.texto + '»',
        'El recordatorio «' + o.rec.texto + '» de las ' + o.rec.hora + ' no se ha confirmado en ' + AVISO_MIN + ' minutos.\n\n' +
        'Abre la pizarra en el móvil para confirmarlo cuando esté hecho.');
      enviados.push(o.clave);
    } catch (e) { Logger.log('No se pudo enviar el aviso: ' + e); }
  });
  if (enviados.length) {
    modificar_(function (x) {
      enviados.forEach(function (c) { x.recEstado[c] = Object.assign({}, x.recEstado[c], { aviso: Date.now() }); });
    });
  }
  return enviados.length;
}

function destinoCorreo_(d) {
  return d.correoAviso || Session.getEffectiveUser().getEmail();
}
function enviarCorreo_(d, asunto, cuerpo) {
  MailApp.sendEmail(destinoCorreo_(d), asunto, cuerpo);
}

/* ---------- Fotos de la familia ---------- */

function fotoDePersona_(d, id) {
  for (var i = 0; i < d.familia.length; i++) if (d.familia[i].id === id) return d.familia[i];
  return null;
}

/** La TV pide la foto de una persona con la clave de administrador. Solo se sirven fotos registradas. */
function fotoParaTV_(id) {
  var d = leer_();
  var f = fotoDePersona_(d, id) || recordatorioPorId_(d, id);
  if (!f || !f.foto) return { error: 'sin foto' };
  var blob = DriveApp.getFileById(f.foto.id).getBlob();
  return { v: f.foto.v, tipo: 'image/jpeg', b64: Utilities.base64Encode(blob.getBytes()) };
}

function guardarFoto_(d, persona, dataUrl) {
  var m = /^data:image\/jpeg;base64,([A-Za-z0-9+\/=]+)$/.exec(String(dataUrl || ''));
  if (!m) throw new Error('La foto no tiene un formato válido');
  if (m[1].length > 450000) throw new Error('La foto es demasiado grande');
  var blob = Utilities.newBlob(Utilities.base64Decode(m[1]), 'image/jpeg', 'foto-' + persona.id + '.jpg');
  var antigua = persona.foto ? persona.foto.id : null;
  var archivo = carpeta_().createFile(blob);
  persona.foto = { id: archivo.getId(), v: Math.floor(Date.now() / 1000) };
  if (antigua) { try { DriveApp.getFileById(antigua).setTrashed(true); } catch (e) { /* ya no existe */ } }
}

function quitarFoto_(persona) {
  if (persona.foto) { try { DriveApp.getFileById(persona.foto.id).setTrashed(true); } catch (e) { /* ya no existe */ } }
  persona.foto = null;
}

/* ============================================================
 *  Lo que usa la app del móvil (cada función comprueba la clave)
 * ============================================================ */

function calendarios_() {
  var cache = CacheService.getScriptCache();
  var hit = cache.get('calendarios');
  if (hit) return JSON.parse(hit);
  var principal = '';
  try { principal = CalendarApp.getDefaultCalendar().getId(); } catch (e0) { /* sin calendario principal */ }
  var out = CalendarApp.getAllCalendars().map(function (c) { return { id: c.getId(), nombre: c.getName(), principal: c.getId() === principal }; });
  try { cache.put('calendarios', JSON.stringify(out), 600); } catch (e) { /* sin caché */ }
  return out;
}

/** Lo que se leyó la última vez de cada calendario: { t, g (eventos de Google), i (de iCloud, null si no hay), eg, ei (errores) }. */
function calendariosResumen_() {
  try { return JSON.parse(CacheService.getScriptCache().get('cal_resumen') || 'null'); } catch (e) { return null; }
}

/** Los calendarios elegidos que el script no encuentra (se borraron, o ya no se comparten con la cuenta del script). */
function calendariosPerdidos_() {
  try { return JSON.parse(CacheService.getScriptCache().get('cal_perdidos') || '[]'); } catch (e) { return []; }
}

function admEstado(k) {
  var q = alguien_(k);
  var d = leer_();
  var ahora = Date.now();
  var tv = tvEstado_();
  if (q.rol === 'familia') {
    var yo = fotoDePersona_(d, q.id);
    return {
      rol: 'familia', nombre: q.nombre, miId: q.id, tv: tv, ahora: ahora,
      tieneFoto: !!(yo && yo.foto),
      pendientes: pendientes_(d, ahora),
      mensajes: d.mensajes.filter(function (m) { return m.autor === q.id; }),
      ciudad: d.ciudad, noche: d.noche, idWeb: idWeb_(d),
      medios: mediosParaPanel_(d, q, ahora)
    };
  }
  var proxima = cuentaAtras_(d);
  return {
    rol: 'admin', tv: tv, ahora: ahora,
    datos: {
      mensajes: d.mensajes, bloques: d.bloques, estiloDia: d.estiloDia, estiloNoche: d.estiloNoche, distribucion: d.distribucion,
      prueba: d.prueba && d.prueba.hasta > ahora ? d.prueba : null,
      cuentasAtras: d.cuentasAtras.map(function (c) {
        var dias = diasHasta_(c.fecha);
        return { id: c.id, texto: c.texto, fecha: c.fecha, icono: c.icono, desdeDias: c.desdeDias, textoDia: c.textoDia,
                 dias: dias, aviso: dias >= 0 ? textoCuenta_(c, dias) : 'Ya pasó' };
      }),
      noche: d.noche, nocheTexto: d.nocheTexto, contacto: d.contacto,
      ciudad: d.ciudad, latitud: d.latitud, longitud: d.longitud, calendarios: d.calendarios,
      recordatorios: d.recordatorios.map(function (r) { return recParaPanel_(d, r, ahora); }),
      correoAviso: d.correoAviso,
      enlaceApp: d.enlaceApp, idWeb: idWeb_(d), icloud: d.icloud, avisoTV: d.avisoTV !== false, leerVoz: !!d.leerVoz,
      visitas: d.visitas, rutina: d.rutina, espacio: espacioGuardado_(), tvHoras: tvHoras_(),
      familia: d.familia.map(function (f) {
        var propios = d.mensajes.filter(function (m) { return m.autor === f.id; });
        return { id: f.id, nombre: f.nombre, clave: f.clave, tieneFoto: !!f.foto,
                 ultimoT: propios.length ? propios[0].t : null,
                 activos: propios.filter(function (m) { return esVivo_(m, ahora); }).length };
      })
    },
    cuentaVista: proxima,
    medios: mediosParaPanel_(d, q, ahora),
    histMedios: d.histMedios.slice(0, 50),
    pendientes: pendientes_(d, ahora),
    avisos: { activos: avisosActivos_(), destino: destinoCorreo_(d), minutos: AVISO_MIN },
    calendarios: calendarios_(),
    calendariosPerdidos: calendariosPerdidos_(),
    calendariosResumen: calendariosResumen_(),
    vista: vistaPreviaTV_(d),
    enlaceBase: ScriptApp.getService().getUrl()
  };
}

/** El identificador de este script: el de su dirección /exec si se puede leer; si no (p. ej. abierto por la dirección de pruebas), el que guardó la app del móvil. */
function idWeb_(d) {
  var m = /\/s\/([^\/]+)\/exec$/.exec(ScriptApp.getService().getUrl() || '');
  return m ? m[1] : (d && d.idWeb) || '';
}

/** Lo mismo que ve la TV, para la miniatura del panel (sin contar como "TV conectada"). */
function vistaPreviaTV_(d) {
  var e = estado_();
  return { mensajes: e.mensajes, eventos: e.eventos, tiempo: e.tiempo, cuentaAtras: e.cuentaAtras, bloques: e.bloques,
           estiloDia: e.estiloDia, estiloNoche: e.estiloNoche, distribucion: e.distribucion, noche: e.noche, nocheTexto: e.nocheTexto, contacto: e.contacto };
}

/**
 * Lo que se ve ahora en la TV, solo para mirar. Cualquier persona con su enlace (familia o administrador) puede previsualizarlo.
 * No cuenta como "TV conectada" y no cambia nada.
 */
function admVistaPrevia(k) {
  alguien_(k);
  var d = leer_();
  var ahora = Date.now();
  return { vista: vistaPreviaTV_(d), ahora: ahora, prueba: d.prueba && d.prueba.hasta > ahora ? d.prueba : null };
}

/**
 * La captura de la pantalla de la TV, tal como la manda la propia TV: la vista previa del panel es idéntica a lo que se ve.
 * Quien la pide (administrador o familia) hace que la TV mande una nueva mientras la mira. desde: la marca de tiempo que ya tiene.
 */
function admCapturaTV(k, desde) {
  alguien_(k);
  var cache = CacheService.getScriptCache();
  cache.put('captura_ped', String(Date.now()), 300);
  var t = Number(cache.get('captura_t') || 0);
  var tv = tvEstado_();
  if (!t) return { t: 0, tv: tv };
  if (desde && t <= Number(desde)) return { t: t, igual: true, tv: tv };
  var b64 = cache.get('captura_jpg');
  if (!b64) return { t: 0, tv: tv };
  return { t: t, jpg: 'data:image/jpeg;base64,' + b64, tv: tv };
}

function finDelDia_(dias) {
  var n = new Date();
  return Math.floor(new Date(n.getFullYear(), n.getMonth(), n.getDate() + dias, 23, 59, 59).getTime() / 1000);
}

/** Fin del día (23:59:59) de la fecha de f, sumando `dias` días. En segundos. */
function finDeDiaDe_(f, dias) {
  return Math.floor(new Date(f.getFullYear(), f.getMonth(), f.getDate() + dias, 23, 59, 59).getTime() / 1000);
}

/** Si esa hora cae en horario de noche, el mensaje se verá cuando amanezca (cuando termina la noche). */
function despuesDeLaNoche_(d, f) {
  var t = f.getTime();
  for (var i = 0; i < 96 && esNocheHora_(d, new Date(t).getHours()); i++) t += 15 * 60000;
  return new Date(t);
}

/**
 * duracion: '1h', '3h', 'hoy' (hasta las 23:59), 'manana' (también mañana) o 'siempre' (hasta que lo quites).
 * cuando: null (ahora) o { dia: 'hoy'|'manana', hora: 'HH:MM' }. Si esa hora es de noche, se verá al empezar el día.
 * La duración cuenta desde que el mensaje se ve.
 */
function admEnviar(k, de, texto, duracion, cuando) {
  var q = alguien_(k);
  texto = String(texto || '').trim().slice(0, 200);
  if (!texto) throw new Error('El mensaje está vacío');
  var ahora = new Date();
  var prog = null, visible = ahora;
  if (cuando && cuando.hora) {
    var hh = horaValida_(cuando.hora);
    if (!hh) throw new Error('Esa hora no vale');
    var dia = cuando.dia === 'manana' ? 1 : 0, y = ahora.getFullYear(), mo = ahora.getMonth(), da = ahora.getDate() + dia;
    if (cuando.fecha) {                                          // una fecha concreta (hasta dentro de 60 días)
      var mf = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(cuando.fecha));
      if (!mf) throw new Error('Esa fecha no vale');
      y = Number(mf[1]); mo = Number(mf[2]) - 1; da = Number(mf[3]);
      var lejos = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate() + 61).getTime();
      if (new Date(y, mo, da).getTime() > lejos) throw new Error('Solo se puede programar dentro de los próximos 60 días');
    }
    prog = new Date(y, mo, da, Number(hh.slice(0, 2)), Number(hh.slice(3)), 0);
    if (prog.getTime() < ahora.getTime() - 60000) throw new Error('Esa fecha y hora ya han pasado. Elige una de más tarde.');
    if (prog.getTime() > ahora.getTime() + 60000) visible = despuesDeLaNoche_(leer_(), prog); else prog = null;
  }
  var programado = !!prog && visible.getTime() > ahora.getTime() + 60000;
  var hasta = null;
  if (duracion === '1h' || duracion === '3h') hasta = Math.floor(visible.getTime() / 1000) + (duracion === '1h' ? 3600 : 10800);
  else if (duracion === 'hoy') hasta = finDeDiaDe_(visible, 0);
  else if (duracion === 'manana') hasta = finDeDiaDe_(visible, 1);
  modificar_(function (d) {
    var m = {
      id: Utilities.getUuid(),
      de: q.rol === 'familia' ? q.nombre : bonito_(String(de || '').trim().slice(0, 30)),   // un familiar no firma con otro nombre
      autor: q.id,
      texto: texto,
      t: Math.floor(Date.now() / 1000),
      hasta: hasta
    };
    if (programado) { m.desde = Math.floor(visible.getTime() / 1000); m.prog = Math.floor(prog.getTime() / 1000); }
    d.mensajes.unshift(m);
  });
  return admEstado(k);
}

/** Quita un mensaje: lo deja caducado, así queda en el historial. 'todos' solo lo puede el administrador. */
function admBorrar(k, id) {
  var q = alguien_(k);
  if (id === 'todos') admin_(k);
  var ya = Math.floor(Date.now() / 1000) - 1;
  modificar_(function (d) {
    d.mensajes.forEach(function (m) {
      if (!esVivo_(m)) return;
      if (id === 'todos' || (m.id === id && (q.rol === 'admin' || m.autor === q.id))) m.hasta = ya;
    });
  });
  return admEstado(k);
}

/** Borra del todo un mensaje del historial (solo administrador). */
function admEliminarDelHistorial(k, id) {
  admin_(k);
  modificar_(function (d) {
    d.mensajes = id === 'todos'
      ? d.mensajes.filter(function (m) { return esVivo_(m); })
      : d.mensajes.filter(function (m) { return m.id !== id; });
  });
  return admEstado(k);
}

/** Ajustes: solo se cambia lo que viene en `aj`. */
function admAjustes(k, aj) {
  admin_(k);
  aj = aj || {};
  modificar_(function (d) {
    if (aj.bloques) {
      var orden = [], vistos = {};
      aj.bloques.forEach(function (b) {
        if (BLOQUES.indexOf(b.id) >= 0 && !vistos[b.id]) { vistos[b.id] = 1; orden.push({ id: b.id, activo: !!b.activo }); }
      });
      BLOQUES.forEach(function (id) { if (!vistos[id]) orden.push({ id: id, activo: true }); });
      d.bloques = orden;
    }
    if (aj.estiloDia && ESTILOS.indexOf(aj.estiloDia) >= 0) d.estiloDia = aj.estiloDia;
    if (aj.estiloNoche && ESTILOS.indexOf(aj.estiloNoche) >= 0) d.estiloNoche = aj.estiloNoche;
    if (aj.distribucion && DISTRIBUCIONES.indexOf(aj.distribucion) >= 0) d.distribucion = aj.distribucion;
    if (aj.calendarios) d.calendarios = aj.calendarios.map(String);
    if (aj.ciudad) {
      d.ciudad = String(aj.ciudad).slice(0, 60);
      d.latitud = Number(aj.latitud) || d.latitud;
      d.longitud = Number(aj.longitud) || d.longitud;
    }
    if (aj.nocheDesde !== undefined && aj.nocheHasta !== undefined) {
      d.noche = { desde: Math.max(0, Math.min(23, Number(aj.nocheDesde))), hasta: Math.max(0, Math.min(23, Number(aj.nocheHasta))) };
    }
    if (aj.enlaceApp !== undefined) {
      var ea = String(aj.enlaceApp || '').trim();
      if (ea && !/^https:\/\/[^\s?#]{4,190}$/.test(ea)) throw new Error('La dirección de la app tiene que empezar por https:// y no llevar ? ni #');
      d.enlaceApp = ea;
    }
    if (aj.idWeb !== undefined) {
      var iw = String(aj.idWeb || '').trim();
      if (iw && !/^[A-Za-z0-9_-]{20,200}$/.test(iw)) throw new Error('El identificador del script no es válido');
      d.idWeb = iw;
    }
    if (aj.icloud !== undefined) {
      var ic = String(aj.icloud || '').trim();
      if (ic && !/^(webcal|https):\/\/[^\s]{6,480}$/i.test(ic)) throw new Error('El enlace del calendario de iCloud tiene que empezar por webcal:// o https://');
      d.icloud = ic;
    }
    if (aj.avisoTV !== undefined) d.avisoTV = !!aj.avisoTV;
    if (aj.leerVoz !== undefined) d.leerVoz = !!aj.leerVoz;
    if (aj.nocheTexto !== undefined) d.nocheTexto = String(aj.nocheTexto).trim().slice(0, 120) || 'Es hora de dormir.';
    if (aj.contactoNombre !== undefined) {
      d.contacto = { nombre: String(aj.contactoNombre).trim().slice(0, 30), telefono: String(aj.contactoTelefono || '').trim().slice(0, 25) };
    }
  });
  CacheService.getScriptCache().removeAll(['calendarios']);
  invalidarEventos_();
  return admEstado(k);
}

/** "Probar 1 minuto": la TV usa ese estilo (y, si se pide, esa distribución) en modo día o noche durante un minuto. */
function admProbarEstilo(k, estilo, modo, distribucion) {
  admin_(k);
  if (ESTILOS.indexOf(estilo) < 0) throw new Error('Ese estilo no existe');
  var dist = DISTRIBUCIONES.indexOf(distribucion) >= 0 ? distribucion : null;
  modificar_(function (d) {
    d.prueba = { estilo: estilo, distribucion: dist, modo: modo === 'noche' ? 'noche' : 'dia', hasta: Date.now() + 60000 };
  });
  return admEstado(k);
}

/* ---------- Cuentas atrás ---------- */

function admGuardarCuentaAtras(k, c) {
  admin_(k);
  var texto = String((c && c.texto) || '').trim().slice(0, 100);
  if (!texto) throw new Error('Escribe qué vamos a celebrar');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(c.fecha || ''))) throw new Error('Elige una fecha');
  modificar_(function (d) {
    var nueva = {
      id: c.id || Utilities.getUuid(), texto: texto, fecha: c.fecha,
      icono: ICONOS_CUENTA.indexOf(c.icono) >= 0 ? c.icono : 'calendario',
      desdeDias: Math.max(1, Math.min(365, Number(c.desdeDias) || 30)),
      textoDia: String(c.textoDia || '').trim().slice(0, 100)
    };
    var hecho = false;
    d.cuentasAtras = d.cuentasAtras.map(function (x) { if (x.id === nueva.id) { hecho = true; return nueva; } return x; });
    if (!hecho) {
      if (d.cuentasAtras.length >= 20) throw new Error('Ya hay 20 cuentas atrás');
      d.cuentasAtras.push(nueva);
    }
  });
  return admEstado(k);
}

function admBorrarCuentaAtras(k, id) {
  admin_(k);
  modificar_(function (d) { d.cuentasAtras = d.cuentasAtras.filter(function (x) { return x.id !== id; }); });
  return admEstado(k);
}

/* ---------- Familia ---------- */

/** Deshacer "Quitar": devuelve a cada mensaje su duración de antes. cambios: [{ id, hasta }] (hasta en segundos, o null = sin límite). */
function admMensajeRestaurar(k, cambios) {
  var q = alguien_(k);
  modificar_(function (d) {
    (cambios || []).forEach(function (c) {
      d.mensajes.forEach(function (m) {
        if (m.id === c.id && (q.rol === 'admin' || m.autor === q.id)) m.hasta = c.hasta === null || c.hasta === undefined ? null : Number(c.hasta);
      });
    });
  });
  return admEstado(k);
}
/** Fija un mensaje para que se quede arriba en la tele (solo uno a la vez, solo el administrador). fijar=false lo suelta. */
function admFijar(k, id, fijar) {
  admin_(k);
  modificar_(function (d) {
    var ahora = Date.now();
    d.mensajes.forEach(function (m) { if (m.fijado && (m.id !== id || !fijar)) delete m.fijado; });
    if (fijar) {
      var m = null;
      d.mensajes.forEach(function (x) { if (x.id === id) m = x; });
      if (!m || !esVivo_(m, ahora)) throw new Error('Ese mensaje ya no está en la tele');
      m.fijado = true;
    }
  });
  return admEstado(k);
}
function admFamiliaAnadir(k, nombre) {
  admin_(k);
  nombre = String(nombre || '').trim().slice(0, 30);
  if (!nombre) throw new Error('Escribe un nombre');
  modificar_(function (d) {
    if (d.familia.length >= 10) throw new Error('Ya hay 10 personas');
    d.familia.push({ id: Utilities.getUuid(), nombre: bonito_(nombre), clave: nuevaClave_(), foto: null });
  });
  return admEstado(k);
}

function admFamiliaQuitar(k, id) {
  admin_(k);
  modificar_(function (d) {
    var f = fotoDePersona_(d, id);
    if (f) quitarFoto_(f);
    d.familia = d.familia.filter(function (x) { return x.id !== id; });
  });
  return admEstado(k);
}

/** Cada persona cambia su foto; el administrador puede cambiar la de cualquiera. dataUrl: JPEG ya reducido en el móvil. */
function admFoto(k, personaId, dataUrl) {
  var q = alguien_(k);
  var id = q.rol === 'familia' ? q.id : personaId;
  modificar_(function (d) {
    var f = fotoDePersona_(d, id);
    if (!f) throw new Error('No se encuentra a esa persona');
    guardarFoto_(d, f, dataUrl);
  });
  return admEstado(k);
}

function admFotoQuitar(k, personaId) {
  var q = alguien_(k);
  var id = q.rol === 'familia' ? q.id : personaId;
  modificar_(function (d) {
    var f = fotoDePersona_(d, id);
    if (!f) throw new Error('No se encuentra a esa persona');
    quitarFoto_(f);
  });
  return admEstado(k);
}

/** Foto de una persona para mostrarla en el panel (el móvil la pide solo cuando la necesita). */
function admLeerFoto(k, personaId) {
  var q = alguien_(k);
  var id = q.rol === 'familia' ? q.id : personaId;
  var f = fotoDePersona_(leer_(), id);
  if (!f || !f.foto) return null;
  var blob = DriveApp.getFileById(f.foto.id).getBlob();
  return 'data:image/jpeg;base64,' + Utilities.base64Encode(blob.getBytes());
}

/* ---------- Recordatorios (panel) ---------- */

function recParaPanel_(d, r, ahora) {
  var hoy = fechaClave_(new Date(ahora));
  var est = d.recEstado[r.id + '|' + hoy];
  return { id: r.id, hora: r.hora, dias: r.dias, texto: r.texto, texto2: r.texto2, duracion: r.duracion, confirmar: !!r.confirmar,
           activo: r.activo !== false, tieneFoto: !!r.foto, confirmadoHoy: est && est.conf ? est.conf : null,
           confirmadoPor: est && est.conf ? (est.por || '') : '' };
}

/**
 * Crea o cambia un recordatorio (solo administrador). r: { id?, hora, dias, texto, texto2, duracion, confirmar, activo }.
 * dataUrl: foto JPEG ya reducida en el móvil (opcional). quitarFoto: true para dejarlo sin foto.
 */
function admRecordatorioGuardar(k, r, dataUrl, quitarFoto) {
  admin_(k);
  r = r || {};
  var texto = String(r.texto || '').trim().slice(0, 80);
  if (!texto) throw new Error('Escribe qué hay que hacer');
  var hora = horaValida_(r.hora);
  if (!hora) throw new Error('Elige la hora');
  var dias = (r.dias || []).map(Number).filter(function (x, i, a) { return x >= 0 && x <= 6 && a.indexOf(x) === i; }).sort();
  if (!dias.length) dias = [0, 1, 2, 3, 4, 5, 6];
  var duracion = Math.max(1, Math.min(180, Number(r.duracion) || 15));
  var id;
  modificar_(function (d) {
    var rec = r.id ? recordatorioPorId_(d, r.id) : null;
    if (!rec) {
      if (d.recordatorios.length >= MAX_RECORDATORIOS) throw new Error('Ya hay ' + MAX_RECORDATORIOS + ' recordatorios');
      rec = { id: Utilities.getUuid(), foto: null };
      d.recordatorios.push(rec);
    }
    rec.hora = hora; rec.dias = dias; rec.texto = texto;
    rec.texto2 = String(r.texto2 || '').trim().slice(0, 120);
    rec.duracion = duracion; rec.confirmar = !!r.confirmar; rec.activo = r.activo !== false;
    if (quitarFoto) quitarFoto_(rec);
    if (dataUrl) guardarFoto_(d, rec, dataUrl);
    d.recordatorios.sort(function (a, b) { return a.hora.localeCompare(b.hora); });
    id = rec.id;
  });
  var est = admEstado(k);
  est.ultimoId = id;                                // para que el panel pueda "probar" justo lo que acaba de guardar
  return est;
}

function admRecordatorioBorrar(k, id) {
  admin_(k);
  modificar_(function (d) {
    var r = recordatorioPorId_(d, id);
    if (r) quitarFoto_(r);
    d.recordatorios = d.recordatorios.filter(function (x) { return x.id !== id; });
    for (var c in d.recEstado) if (c.indexOf(id + '|') === 0) delete d.recEstado[c];
    if (d.pruebaRec && d.pruebaRec.id === id) d.pruebaRec = null;
  });
  return admEstado(k);
}

/**
 * "Confirmar que lo ha tomado": la TV vuelve a la pizarra en cuanto pregunta de nuevo. Si era una prueba, la termina.
 * Lo puede confirmar el administrador o cualquier persona de la familia con su enlace; se anota quién y a qué hora.
 */
function admRecordatorioConfirmar(k, clave) {
  var q = alguien_(k);
  var id = String(clave || '').split('|')[0];
  modificar_(function (d) {
    if (d.pruebaRec && d.pruebaRec.id === id && String(clave).split('|')[1] === 'prueba') { d.pruebaRec = null; return; }
    var p = pendientes_(d, Date.now()).filter(function (x) { return x.clave === clave; })[0];
    if (!p) throw new Error('Ese recordatorio ya no está pendiente');
    d.recEstado[clave] = Object.assign({}, d.recEstado[clave], { conf: Date.now(), por: q.rol === 'familia' ? q.nombre : '' });
  });
  return admEstado(k);
}

/** "Probar 1 minuto": la TV enseña ese recordatorio durante un minuto, sea la hora que sea. */
function admRecordatorioProbar(k, id) {
  admin_(k);
  modificar_(function (d) {
    if (!recordatorioPorId_(d, id)) throw new Error('No se encuentra ese recordatorio');
    d.pruebaRec = { id: id, hasta: Date.now() + 60000 };
  });
  return admEstado(k);
}

function admRecordatorioFoto(k, id) {
  admin_(k);
  var r = recordatorioPorId_(leer_(), id);
  if (!r || !r.foto) return null;
  return 'data:image/jpeg;base64,' + Utilities.base64Encode(DriveApp.getFileById(r.foto.id).getBlob().getBytes());
}

/** Correo al que llegan los avisos (vacío = el de tu cuenta de Google). */
function admCorreoAviso(k, correo) {
  admin_(k);
  correo = String(correo || '').trim().slice(0, 100);
  if (correo && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(correo)) throw new Error('Ese correo no parece válido');
  modificar_(function (d) { d.correoAviso = correo; });
  return admEstado(k);
}

function admCorreoPrueba(k) {
  admin_(k);
  enviarCorreo_(leer_(), 'Pizarra: correo de prueba', 'Si lees esto, los avisos de la pizarra te van a llegar aquí.');
  return admEstado(k);
}

function admBuscarCiudad(k, q) {
  admin_(k);
  var r = UrlFetchApp.fetch('https://geocoding-api.open-meteo.com/v1/search?count=5&language=es&name=' + encodeURIComponent(q),
    { muteHttpExceptions: true });
  var res = JSON.parse(r.getContentText()).results || [];
  return res.map(function (x) {
    return { nombre: x.name, region: [x.admin1, x.country].filter(Boolean).join(', '), latitud: x.latitude, longitud: x.longitude };
  });
}

/* ============================================================
 *  Audios, vídeos y fotos a distancia (versión 5)
 *  Los envíos se guardan en trozos dentro de la carpeta "Pizarra/Medios" de tu Drive. Son privados: no hay enlaces públicos.
 *  Nada se pone solo: alguien tiene que pulsar "Reproducir ahora" o "Mostrar ahora en la TV", y de noche no se pone nada.
 * ============================================================ */

function carpetaMedios_() {
  var p = props_();
  var id = p.getProperty('MEDIOS_ID');
  if (id) { try { return DriveApp.getFolderById(id); } catch (e) { /* se recrea */ } }
  var f = carpeta_().createFolder('Medios');
  p.setProperty('MEDIOS_ID', f.getId());
  return f;
}

function medioPorId_(d, id) {
  for (var i = 0; i < d.medios.length; i++) if (d.medios[i].id === id && !d.medios[i].borrado) return d.medios[i];
  return null;
}
function puedeMedio_(q, m) { return q.rol === 'admin' || m.autor === q.id; }

function borrarTrozos_(id) {
  try { CacheService.getScriptCache().remove('mini_' + id); } catch (e) { /* sin caché */ }
  var it = carpetaMedios_().getFiles();
  while (it.hasNext()) { var f = it.next(); if (f.getName().indexOf(id + '.') === 0) f.setTrashed(true); }
}

/** Empieza un envío. meta: { tipo: 'audio'|'video'|'foto', mime, bytes, partes, texto, de (solo el administrador: cómo firma) }. Devuelve el id; luego se mandan las partes. */
function admMedioNuevo(k, meta) {
  var q = alguien_(k);
  meta = meta || {};
  var tipo = MEDIOS[meta.tipo] ? meta.tipo : null;
  if (!tipo) throw new Error('Ese tipo de envío no existe');
  var cfg = MEDIOS[tipo];
  var mime = String(meta.mime || '').toLowerCase().split(';')[0];
  if (cfg.mimes.indexOf(mime) < 0) throw new Error('La tele no entiende este formato (' + (mime || 'desconocido') + ')');
  var bytes = Math.floor(Number(meta.bytes));
  if (!(bytes > 0)) throw new Error('El archivo está vacío');
  if (bytes > cfg.max) throw new Error('Pesa demasiado (máximo ' + Math.round(cfg.max / 1000000) + ' MB). Graba algo más corto.');
  var partes = Math.floor(Number(meta.partes));
  if (!(partes >= 1 && partes <= MAX_PARTES)) throw new Error('Envío no válido');
  var id = Utilities.getUuid().replace(/-/g, '').slice(0, 16);
  var desechar = [];
  var mini = /^data:image\/jpeg;base64,([A-Za-z0-9+\/=]{100,30000})$/.exec(String(meta.mini || ''));
  modificar_(function (d) {
    var limite = Date.now() - 3600000;                        // los envíos a medias de hace más de una hora se tiran
    var hace10 = Date.now() - 600000;                          // los borrados hace más de 10 minutos ya no se pueden deshacer: se tiran
    d.medios = d.medios.filter(function (m) { if ((!m.listo && m.t < limite) || (m.borrado && m.borrado < hace10)) { desechar.push(m.id); return false; } return true; });
    if (d.medios.filter(function (m) { return !m.borrado; }).length >= MAX_MEDIOS) throw new Error('Hay demasiados envíos preparados. Borra alguno antes de mandar otro.');
    d.medios.unshift({ id: id, tipo: tipo, de: q.rol === 'familia' ? q.nombre : bonito_(String(meta.de || '').trim().slice(0, 30)), autor: q.id, texto: String(meta.texto || '').trim().slice(0, 200),
      t: Date.now(), mime: mime, bytes: bytes, partes: partes, mini: !!mini, seg: Math.max(0, Math.min(3600, Math.round(Number(meta.seg) || 0))), listo: false });
  });
  desechar.forEach(borrarTrozos_);
  if (mini) carpetaMedios_().createFile(Utilities.newBlob(Utilities.base64Decode(mini[1]), 'image/jpeg', id + '.mini'));
  return { id: id };
}

/** Guarda la parte n (0..partes-1) de un envío, en base64. */
function admMedioParte(k, id, n, b64) {
  var q = alguien_(k);
  var m = medioPorId_(leer_(), id);
  if (!m || !puedeMedio_(q, m) || m.listo) throw new Error('Ese envío no existe');
  n = Math.floor(Number(n));
  if (!(n >= 0 && n < m.partes)) throw new Error('Parte no válida');
  var bytes = Utilities.base64Decode(String(b64 || ''));
  if (!bytes.length || bytes.length > 1600000) throw new Error('Parte no válida');
  carpetaMedios_().createFile(Utilities.newBlob(bytes, 'application/octet-stream', id + '.' + n));
  return { ok: true };
}

/** Cierra el envío: comprueba que están todas las partes y lo deja "preparado". */
function admMedioFin(k, id) {
  var q = alguien_(k);
  var m0 = medioPorId_(leer_(), id);
  if (!m0 || !puedeMedio_(q, m0)) throw new Error('Ese envío no existe');
  var vistas = {}, total = 0;
  var it = carpetaMedios_().getFiles();
  while (it.hasNext()) {
    var f = it.next(), nom = f.getName();
    if (nom.indexOf(id + '.') === 0 && /\.\d+$/.test(nom) && !vistas[nom]) { vistas[nom] = 1; total += f.getSize(); }
  }
  if (Object.keys(vistas).length !== m0.partes || total !== m0.bytes) {
    throw new Error('Se ha cortado la subida (llegaron ' + Object.keys(vistas).length + ' de ' + m0.partes + ' partes). Prueba otra vez.');
  }
  modificar_(function (d) { var m = medioPorId_(d, id); if (m) m.listo = true; });
  return admEstado(k);
}

function admMedioBorrar(k, id) {
  var q = alguien_(k);
  var m0 = medioPorId_(leer_(), id);
  if (!m0 || !puedeMedio_(q, m0)) throw new Error('Ese envío no existe');
  modificar_(function (d) {                                    // se esconde; los archivos se tiran más tarde (así se puede deshacer)
    d.medios.forEach(function (m) { if (m.id === id) m.borrado = Date.now(); });
    if (d.repro && d.repro.id === id) d.repro.estado = 'terminado';
  });
  return admEstado(k);
}
/** Deshacer "Borrar" (mientras los archivos siguen en Drive). */
function admMedioRestaurar(k, id) {
  var q = alguien_(k);
  var ok = false;
  modificar_(function (d) {
    d.medios.forEach(function (m) {
      if (m.id === id && m.borrado && puedeMedio_(q, m)) { delete m.borrado; ok = true; }
    });
  });
  if (!ok) throw new Error('Ya no se puede deshacer');
  return admEstado(k);
}
/** La miniatura de una foto o de un vídeo (el primer fotograma), como imagen en texto. */
function admMedioMini(k, id) {
  var q = alguien_(k);
  var m = medioPorId_(leer_(), id);
  if (!m || !puedeMedio_(q, m) || !m.mini) return null;
  var cache = CacheService.getScriptCache(), hit = cache.get('mini_' + id);
  if (hit) return hit;
  var it = carpetaMedios_().getFilesByName(id + '.mini');
  if (!it.hasNext()) return null;
  var du = 'data:image/jpeg;base64,' + Utilities.base64Encode(it.next().getBlob().getBytes());
  try { cache.put('mini_' + id, du, 21600); } catch (e) { /* sin caché */ }
  return du;
}

/** Lo que cada persona ve de sus envíos (el administrador, todos). */
function mediosParaPanel_(d, q, ahora) {
  var lista = d.medios.filter(function (m) { return m.listo && !m.borrado && puedeMedio_(q, m); }).map(function (m) {
    var visto = null;
    for (var i = 0; i < d.histMedios.length; i++) if (d.histMedios[i].id === m.id) { visto = d.histMedios[i]; break; }       // la más reciente
    return { id: m.id, tipo: m.tipo, de: bonito_(m.de), autor: m.autor, texto: m.texto, t: m.t, bytes: m.bytes, mini: !!m.mini, seg: m.tipo === 'audio' && m.mime.indexOf('wav') >= 0 ? Math.round(Math.max(0, m.bytes - 44) / 32000) : (m.seg || 0),
             vistoT: visto ? visto.t : null, puso: visto ? visto.quien : '' };
  });
  var rp = null, e = reproEstado_(d, ahora);
  if (d.repro && e) {
    var m = medioPorId_(d, d.repro.id);
    if (m && puedeMedio_(q, m)) {
      rp = { orden: d.repro.orden, id: d.repro.id, estado: e, tipo: m.tipo, de: m.de, texto: m.texto, minutos: d.repro.minutos, quien: d.repro.quien, error: d.repro.error || '', t: d.repro.t };
    }
  }
  return { lista: lista, repro: rp };
}

/** Estado "efectivo" de la reproducción: esperando | reproduciendo | terminado | caducado | error (null si no hay). */
function reproEstado_(d, ahora) {
  var r = d.repro;
  if (!r) return null;
  if (r.estado === 'esperando') return ahora - r.t > ESPERA_TV_MIN * 60000 ? 'caducado' : 'esperando';
  if (r.estado === 'reproduciendo') {
    var m = medioPorId_(d, r.id);
    var tope = m && m.tipo === 'foto' ? (r.minutos > 0 ? r.minutos * 60000 + 30000 : 12 * 3600000) : 10 * 60000;
    return ahora - r.desde > tope ? 'terminado' : 'reproduciendo';
  }
  return r.estado;                                   // terminado | error
}

function reproPendiente_(d, ahora) {
  var e = reproEstado_(d, ahora);
  return e === 'esperando' || e === 'reproduciendo';
}

function medioParaTV_(d, ahora) {
  if (!reproPendiente_(d, ahora)) return null;
  if (esNocheHora_(d, new Date(ahora).getHours())) return null;      // de noche no se pone nada
  var r = d.repro, m = medioPorId_(d, r.id);
  if (!m || !m.listo) return null;
  var seg = 0;
  if (m.tipo === 'foto' && r.minutos > 0) seg = Math.max(1, Math.round(((r.desde || ahora) + r.minutos * 60000 - ahora) / 1000));
  return { orden: r.orden, id: m.id, tipo: m.tipo, de: bonito_(m.de), texto: m.texto, partes: m.partes, bytes: m.bytes, mime: m.mime,
           segundos: seg, cmd: r.cmd || { n: 0, c: '' }, rep: r.rep || 0, sinLimite: m.tipo === 'foto' && !(r.minutos > 0) };
}

/** minutos: solo para fotos: 1, 5 o 15; 0 = hasta que se quite. */
function admMedioReproducir(k, id, minutos) {
  var q = alguien_(k);
  var d0 = leer_();
  var m0 = medioPorId_(d0, id);
  if (!m0 || !m0.listo || !puedeMedio_(q, m0)) throw new Error('Ese envío no existe');
  if (esNocheHora_(d0, new Date().getHours())) throw new Error('Ahora es de noche: la tele no pone nada hasta que amanezca.');
  minutos = m0.tipo === 'foto' ? ([1, 5, 15].indexOf(Number(minutos)) >= 0 ? Number(minutos) : 0) : 0;
  modificar_(function (d) {
    var m = medioPorId_(d, id);
    if (!m) return;
    d.repro = { orden: Date.now(), id: id, minutos: minutos, estado: 'esperando', quien: { id: q.id, nombre: q.rol === 'familia' ? q.nombre : 'el administrador' },
                t: Date.now(), desde: 0, cmd: { n: 0, c: '' }, rep: 0, error: '' };
  });
  return admEstado(k);
}

/** cmd: 'repetir' | 'parar' | 'subir' | 'bajar'. */
function admMedioControl(k, orden, cmd) {
  var q = alguien_(k);
  if (['repetir', 'parar', 'subir', 'bajar'].indexOf(cmd) < 0) throw new Error('Esa orden no existe');
  modificar_(function (d) {
    var r = d.repro;
    if (!r || String(r.orden) !== String(orden)) throw new Error('Eso ya terminó');
    var m = medioPorId_(d, r.id);
    if (!m || !puedeMedio_(q, m)) throw new Error('Eso no es tuyo');
    if (!reproPendiente_(d, Date.now())) throw new Error('Eso ya terminó');
    if (cmd === 'parar') { r.estado = 'terminado'; return; }
    if (cmd === 'repetir') { r.rep = (r.rep || 0) + 1; r.estado = 'reproduciendo'; r.desde = Date.now(); return; }
    r.cmd = { n: ((r.cmd && r.cmd.n) || 0) + 1, c: cmd };
  });
  return admEstado(k);
}

/** La TV cuenta cómo va: descargando | reproduciendo | terminado | error (con un mensaje). */
function medioEstadoDeLaTV_(orden, e, msg) {
  var ok = false;
  modificar_(function (d) {
    var r = d.repro;
    if (!r || String(r.orden) !== String(orden)) return;
    var m = medioPorId_(d, r.id);
    if (e === 'reproduciendo' && r.estado !== 'terminado') {
      if (r.estado !== 'reproduciendo') {
        r.estado = 'reproduciendo'; r.desde = Date.now();
        d.histMedios.unshift({ t: Date.now(), id: r.id, tipo: m ? m.tipo : '', de: m ? m.de : '', quien: r.quien ? r.quien.nombre : '', texto: m ? m.texto : '' });
        d.histMedios = d.histMedios.slice(0, HIST_MEDIOS);
      }
      ok = true;
    } else if (e === 'terminado') { if (r.estado !== 'terminado') r.estado = 'terminado'; ok = true; }
    else if (e === 'error') { r.estado = 'error'; r.error = String(msg || 'La tele no ha podido reproducirlo').slice(0, 160); ok = true; }
    else if (e === 'descargando') { ok = true; }
  });
  return { ok: ok };
}

/** La TV pide una parte del envío activo (solo el que se está poniendo ahora). */
function parteMedioParaTV_(id, n) {
  var d = leer_();
  if (!reproPendiente_(d, Date.now()) || d.repro.id !== id) return { error: 'ya no toca' };
  var m = medioPorId_(d, id);
  n = Math.floor(Number(n));
  if (!m || !(n >= 0 && n < m.partes)) return { error: 'parte no válida' };
  var it = carpetaMedios_().getFilesByName(id + '.' + n);
  if (!it.hasNext()) return { error: 'falta la parte' };
  return { n: n, b64: Utilities.base64Encode(it.next().getBlob().getBytes()) };
}

/** Solo lo de los envíos, para ir mirando cómo va una reproducción sin cargar todo el panel. */
function admMediosEstado(k) {
  var q = alguien_(k);
  var d = leer_();
  var ahora = Date.now();
  var r = { rol: q.rol, ahora: ahora, medios: mediosParaPanel_(d, q, ahora), tv: tvEstado_() };
  if (q.rol === 'admin') r.histMedios = d.histMedios.slice(0, 50);
  return r;
}

/* ============================================================
 *  Lo próximo: calendarios de Google, calendario de iCloud (webcal), visitas y rutina semanal.
 *  Los calendarios (lo lento) se guardan 10 minutos y se vuelven a pedir si se cambian los calendarios en Ajustes.
 *  Lo que "ya terminó" se quita al servir, no al guardar, para que no se quede viejo.
 * ============================================================ */

var CACHE_EVENTOS_S = 600;

function versionEventos_() {
  var c = CacheService.getScriptCache();
  return c.get('ev_ver') || '0';
}
function invalidarEventos_() {
  try { CacheService.getScriptCache().put('ev_ver', String(Date.now()), 21600); } catch (e) { /* sin caché */ }
}
function claveDia_(f) { return Utilities.formatDate(f, Session.getScriptTimeZone(), 'yyyy-MM-dd'); }

/** Los dos días que se enseñan: hoy y mañana (a las 00:00 de la zona del script). */
function ventanaEventos_(ahora) {
  var hoy0 = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate());
  var man0 = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate() + 1);
  var fin = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate() + 2);
  return { dias: [hoy0, man0], ini: hoy0.getTime(), fin: fin.getTime() };
}

/** Un evento "crudo" (lo que se guarda en la caché): dia 0 = hoy, 1 = mañana. */
function eventosDeGoogle_(ids, v) {
  var cals = [], perdidos = [];
  if (ids && ids.length) ids.forEach(function (id) { var c = CalendarApp.getCalendarById(id); if (c) cals.push(c); else perdidos.push(id); });
  if (!cals.length) cals.push(CalendarApp.getDefaultCalendar());     // sin elegir nada (o si ninguno de los elegidos se encuentra), el principal: nunca se queda sin calendario
  try { CacheService.getScriptCache().put('cal_perdidos', JSON.stringify(perdidos), 900); } catch (e) { /* sin caché */ }
  var tz = Session.getScriptTimeZone(), out = [];
  v.dias.forEach(function (dia, i) {
    cals.forEach(function (c) {
      c.getEventsForDay(dia).forEach(function (ev) {
        var todo = ev.isAllDayEvent();
        var hora = todo ? '' : Utilities.formatDate(ev.getStartTime(), tz, 'HH:mm');
        out.push({ dia: i, titulo: ev.getTitle(), hora: hora, orden: todo ? '00:00' : hora, todo: todo, fin: todo ? 0 : ev.getEndTime().getTime() });
      });
    });
  });
  return out;
}

/** Los eventos de los calendarios (Google e iCloud), de la caché si está fresca. */
function eventosDeCalendarios_(d, ahora) {
  var cache = CacheService.getScriptCache();
  var v = ventanaEventos_(ahora);
  var clave = 'eventos3_' + versionEventos_() + '_' + claveDia_(ahora) + '_' + (d.calendarios || []).join(',') + '_' + (d.icloud ? 'i' : '');
  var hit = cache.get(clave);
  if (hit) return JSON.parse(hit);
  var out = [], res = { t: Date.now(), g: 0, i: null, eg: '', ei: '' };      // res: qué se ha leído de cada sitio, para enseñarlo en Ajustes
  try { var g = eventosDeGoogle_(d.calendarios, v); res.g = g.length; out = out.concat(g); } catch (e) { res.eg = String(e && e.message || e).slice(0, 160); Logger.log('Calendario de Google: ' + e); }
  if (d.icloud) { try { var ic = eventosDeICloud_(d.icloud, v); res.i = ic.length; out = out.concat(ic); } catch (e2) { res.i = 0; res.ei = String(e2 && e2.message || e2).slice(0, 160); Logger.log('Calendario de iCloud: ' + e2); } }
  try { cache.put(clave, JSON.stringify(out), CACHE_EVENTOS_S); cache.put('cal_resumen', JSON.stringify(res), 3600); } catch (e3) { /* sin caché */ }
  return out;
}

function nombrePersona_(d, id) {
  for (var i = 0; i < d.familia.length; i++) if (d.familia[i].id === id) return d.familia[i];
  return null;
}
function eventoDeVisita_(d, v, dia, fecha) {
  var p = v.persona ? nombrePersona_(d, v.persona) : null;
  var titulo = v.texto || (p ? 'Viene ' + p.nombre : 'Viene alguien');
  var hora = v.hora || '';
  var ini = hora ? new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate(), Number(hora.slice(0, 2)), Number(hora.slice(3))).getTime() : 0;
  return { dia: dia, titulo: titulo, hora: hora, orden: hora || '00:00', todo: !hora, fin: hora ? ini + 3600000 : 0,
           autor: p ? p.id : null, foto: p && p.foto ? p.foto.v : null };
}
/** Visitas apuntadas y tareas de cada semana, para hoy y mañana. */
function eventosPropios_(d, v) {
  var out = [];
  v.dias.forEach(function (dia, i) {
    var clave = claveDia_(dia);
    (d.visitas || []).forEach(function (x) { if (x.fecha === clave) out.push(eventoDeVisita_(d, x, i, dia)); });
    (d.rutina || []).forEach(function (x) { if (Number(x.dia) === dia.getDay()) out.push(eventoDeVisita_(d, { persona: x.persona, texto: x.texto, hora: x.hora }, i, dia)); });
  });
  return out;
}

/** Lo que va a "Lo próximo" en la TV: hasta 6, de hoy y de mañana, sin lo que ya terminó. */
function eventos_(d) {
  var ahora = new Date();
  var v = ventanaEventos_(ahora);
  var todos = eventosDeCalendarios_(d, ahora).concat(eventosPropios_(d, v));
  var ms = ahora.getTime();
  var out = todos.filter(function (e) { return !(e.dia === 0 && !e.todo && e.fin && e.fin < ms); }).map(function (e) {
    var x = { dia: e.dia, titulo: e.titulo, hora: e.hora, orden: e.orden };
    if (e.autor) { x.autor = e.autor; x.foto = e.foto || null; }
    return x;
  });
  out.sort(function (a, b) { return a.dia - b.dia || a.orden.localeCompare(b.orden); });
  return out.slice(0, 6);
}

/* ---------- Lector de iCal (.ics) ---------- */

function icsLineas_(texto) {
  var t = String(texto || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n[ \t]/g, '');
  return t.split('\n');
}
function icsTexto_(s) { return String(s || '').replace(/\\n/gi, ' ').replace(/\\,/g, ',').replace(/\;/g, ';').replace(/\\\\/g, '\\').trim(); }
function icsParam_(cab) {
  var partes = cab.split(';'), nombre = partes[0].toUpperCase(), p = {};
  for (var i = 1; i < partes.length; i++) { var k = partes[i].indexOf('='); if (k > 0) p[partes[i].slice(0, k).toUpperCase()] = partes[i].slice(k + 1).replace(/^"|"$/g, ''); }
  return { nombre: nombre, p: p };
}
/** Un DTSTART/DTEND/EXDATE/RECURRENCE-ID: { todo, fecha:'AAAAMMDD', hora:'HHMMSS', tz, utc, ms } */
function icsFecha_(valor, p) {
  var m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/.exec(String(valor).trim());
  if (!m) return null;
  var todo = !m[4] || (p && p.VALUE === 'DATE');
  var r = { todo: todo, fecha: m[1] + m[2] + m[3], hora: todo ? '' : m[4] + m[5] + (m[6] || '00'), tz: (p && p.TZID) || '', utc: !!m[7] };
  r.ms = icsMs_(r);
  return r;
}
function icsMs_(f) {
  var a = Number(f.fecha.slice(0, 4)), me = Number(f.fecha.slice(4, 6)) - 1, di = Number(f.fecha.slice(6, 8));
  if (f.todo) return new Date(a, me, di).getTime();
  var h = Number(f.hora.slice(0, 2)), mi = Number(f.hora.slice(2, 4)), se = Number(f.hora.slice(4, 6));
  if (f.utc) return Date.UTC(a, me, di, h, mi, se);
  var tz = f.tz || Session.getScriptTimeZone();
  try { return Utilities.parseDate(f.fecha + 'T' + f.hora, tz, "yyyyMMdd'T'HHmmss").getTime(); } catch (e) { return new Date(a, me, di, h, mi, se).getTime(); }
}
function icsDuracion_(s) {
  var m = /^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(String(s).trim());
  if (!m) return 0;
  var ms = ((Number(m[2] || 0) * 7 + Number(m[3] || 0)) * 86400 + Number(m[4] || 0) * 3600 + Number(m[5] || 0) * 60 + Number(m[6] || 0)) * 1000;
  return m[1] === '-' ? -ms : ms;
}
function icsRegla_(s) {
  var r = {};
  String(s || '').split(';').forEach(function (x) { var k = x.indexOf('='); if (k > 0) r[x.slice(0, k).toUpperCase()] = x.slice(k + 1); });
  return r;
}
var ICS_DIAS = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };

/** Todos los VEVENT del texto, con su regla de repetición, exclusiones y cambios de una sola vez. */
function icsEventos_(texto) {
  var out = [], ev = null;
  icsLineas_(texto).forEach(function (l) {
    if (l === 'BEGIN:VEVENT') { ev = { ex: [] }; return; }
    if (l === 'END:VEVENT') { if (ev && ev.ini) out.push(ev); ev = null; return; }
    if (!ev) return;
    var k = l.indexOf(':'); if (k < 0) return;
    var cab = icsParam_(l.slice(0, k)), val = l.slice(k + 1);
    if (cab.nombre === 'SUMMARY') ev.titulo = icsTexto_(val);
    else if (cab.nombre === 'UID') ev.uid = val.trim();
    else if (cab.nombre === 'STATUS') ev.cancelado = /CANCELLED/i.test(val);
    else if (cab.nombre === 'DTSTART') ev.ini = icsFecha_(val, cab.p);
    else if (cab.nombre === 'DTEND') ev.fin = icsFecha_(val, cab.p);
    else if (cab.nombre === 'DURATION') ev.dur = icsDuracion_(val);
    else if (cab.nombre === 'RRULE') ev.regla = icsRegla_(val);
    else if (cab.nombre === 'RECURRENCE-ID') ev.cambia = icsFecha_(val, cab.p);
    else if (cab.nombre === 'EXDATE') val.split(',').forEach(function (x) { var f = icsFecha_(x, cab.p); if (f) ev.ex.push(f.fecha); });
  });
  return out;
}
function diasDesde_(a, b) { return Math.round((Date.UTC(b.getFullYear(), b.getMonth(), b.getDate()) - Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())) / 86400000); }
function nSemana_(d) { return Math.floor((diasDesde_(new Date(1970, 0, 5), d)) / 7); }   // semanas que empiezan en lunes

/** ¿La regla cae en el día D (siendo S el día de inicio)? */
function reglaCae_(r, S, D) {
  var inter = Math.max(1, Number(r.INTERVAL || 1)), f = r.FREQ;
  var byday = r.BYDAY ? r.BYDAY.split(',') : null, bymd = r.BYMONTHDAY ? r.BYMONTHDAY.split(',').map(Number) : null, bym = r.BYMONTH ? r.BYMONTH.split(',').map(Number) : null;
  if (bym && bym.indexOf(D.getMonth() + 1) < 0) return false;
  if (f === 'DAILY') return diasDesde_(S, D) % inter === 0 && (!byday || byday.some(function (x) { return ICS_DIAS[x.slice(-2)] === D.getDay(); }));
  if (f === 'WEEKLY') {
    if ((nSemana_(D) - nSemana_(S)) % inter !== 0) return false;
    var dias = byday ? byday.map(function (x) { return ICS_DIAS[x.slice(-2)]; }) : [S.getDay()];
    return dias.indexOf(D.getDay()) >= 0;
  }
  if (f === 'MONTHLY') {
    if (((D.getFullYear() - S.getFullYear()) * 12 + D.getMonth() - S.getMonth()) % inter !== 0) return false;
    if (byday) {
      return byday.some(function (x) {
        var m = /^([+-]?\d+)?(SU|MO|TU|WE|TH|FR|SA)$/.exec(x); if (!m || ICS_DIAS[m[2]] !== D.getDay()) return false;
        if (!m[1]) return true;
        var n = Number(m[1]), ult = new Date(D.getFullYear(), D.getMonth() + 1, 0).getDate();
        return n > 0 ? Math.ceil(D.getDate() / 7) === n : Math.ceil((ult - D.getDate() + 1) / 7) === -n;
      });
    }
    if (bymd) return bymd.indexOf(D.getDate()) >= 0 || bymd.some(function (x) { return x < 0 && new Date(D.getFullYear(), D.getMonth() + 1, 0).getDate() + x + 1 === D.getDate(); });
    return D.getDate() === S.getDate();
  }
  if (f === 'YEARLY') {
    if ((D.getFullYear() - S.getFullYear()) % inter !== 0) return false;
    if (bym || bymd) return (!bym || bym.indexOf(D.getMonth() + 1) >= 0) && (!bymd || bymd.indexOf(D.getDate()) >= 0);
    return D.getMonth() === S.getMonth() && D.getDate() === S.getDate();
  }
  return false;
}

/** Los días (a las 00:00) en que ocurre un evento dentro de la ventana, ya repetido. */
function icsOcurrencias_(ev, v) {
  var fechaIni = ev.ini, S = new Date(Number(fechaIni.fecha.slice(0, 4)), Number(fechaIni.fecha.slice(4, 6)) - 1, Number(fechaIni.fecha.slice(6, 8)));
  var durMs = ev.fin ? ev.fin.ms - fechaIni.ms : ev.dur !== undefined ? ev.dur : (fechaIni.todo ? 86400000 : 0);
  var res = [];
  var emite = function (dia, msIni) { res.push({ ini: msIni, fin: msIni + durMs, todo: fechaIni.todo }); };
  if (!ev.regla) { emite(S, fechaIni.ms); return res; }
  var r = ev.regla, cuenta = r.COUNT ? Number(r.COUNT) : 0, hasta = r.UNTIL ? icsFecha_(r.UNTIL, {}) : null, n = 0;
  var limite = new Date(v.fin);
  var salto = new Date(v.ini - durMs - 2 * 86400000);               // sin COUNT no hace falta empezar desde el principio: la regla se calcula por fechas
  var arranque = !cuenta && salto > S ? new Date(salto.getFullYear(), salto.getMonth(), salto.getDate()) : S;
  for (var D = new Date(arranque.getTime()), i = 0; D < limite && i < 40000; D = new Date(D.getFullYear(), D.getMonth(), D.getDate() + 1), i++) {
    if (hasta && D.getTime() > hasta.ms + (hasta.todo ? 86400000 : 0)) break;
    if (!reglaCae_(r, S, D)) continue;
    n++;
    if (cuenta && n > cuenta) break;
    var clave = D.getFullYear() + dos2_(D.getMonth() + 1) + dos2_(D.getDate());
    if (ev.ex.indexOf(clave) >= 0) continue;
    if (D.getTime() + durMs + 86400000 < v.ini) continue;
    var msIni = fechaIni.todo ? D.getTime() : icsMs_({ todo: false, fecha: clave, hora: fechaIni.hora, tz: fechaIni.tz, utc: fechaIni.utc });
    emite(D, msIni);
  }
  return res;
}
function dos2_(n) { return (n < 10 ? '0' : '') + n; }

/** Descarga el calendario de iCloud (webcal:// se pide por https://) y devuelve los eventos de hoy y mañana. */
function eventosDeICloud_(url, v) {
  var u = String(url).replace(/^webcal:\/\//i, 'https://');
  var r = UrlFetchApp.fetch(u, { muteHttpExceptions: true, followRedirects: true });
  if (r.getResponseCode && r.getResponseCode() !== 200) throw new Error('iCloud respondió ' + r.getResponseCode());
  return eventosDeICS_(r.getContentText(), v);
}
function eventosDeICS_(texto, v) {
  var evs = icsEventos_(texto), tz = Session.getScriptTimeZone(), out = [];
  var cambios = {};                                           // instancias que se han movido o cambiado: se sustituyen
  evs.forEach(function (e) { if (e.cambia && e.uid) cambios[e.uid + '|' + e.cambia.fecha] = true; });
  evs.forEach(function (e) {
    if (e.cancelado || !e.titulo) return;
    var ocs = icsOcurrencias_(e, v);
    if (!e.cambia && e.uid) ocs = ocs.filter(function (o) { return !cambios[e.uid + '|' + Utilities.formatDate(new Date(o.ini), tz, 'yyyyMMdd')]; });
    ocs.forEach(function (o) {
      v.dias.forEach(function (dia, i) {
        var d0 = dia.getTime(), d1 = new Date(dia.getFullYear(), dia.getMonth(), dia.getDate() + 1).getTime();
        var cae = o.todo ? (o.ini < d1 && o.fin > d0) : (o.fin > o.ini ? (o.ini < d1 && o.fin > d0) : (o.ini >= d0 && o.ini < d1));
        if (!cae) return;
        var hora = o.todo ? '' : Utilities.formatDate(new Date(o.ini), tz, 'HH:mm');
        if (!o.todo && o.ini < d0) hora = '';                                 // viene de ayer: se enseña como de todo el día
        out.push({ dia: i, titulo: e.titulo, hora: hora, orden: hora || '00:00', todo: !hora, fin: o.todo ? 0 : o.fin });
      });
    });
  });
  return out;
}

/* ============================================================
 *  Visitas ("Hoy viene Ana") y rutina de cada semana ("Jueves: viene la asistenta")
 * ============================================================ */

function quePersonaValida_(d, id) { return id && nombrePersona_(d, id) ? id : ''; }

/** v: { id?, fecha 'AAAA-MM-DD', hora 'HH:MM' (opcional), persona (id de la familia, opcional), texto (opcional) }. Hace falta persona o texto. */
function admVisitaGuardar(k, v) {
  admin_(k);
  v = v || {};
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(v.fecha || ''))) throw new Error('Elige el día de la visita');
  var hora = v.hora ? horaValida_(v.hora) : '';
  if (v.hora && !hora) throw new Error('Esa hora no vale');
  var texto = String(v.texto || '').trim().slice(0, 60);
  modificar_(function (d) {
    var persona = quePersonaValida_(d, v.persona);
    if (!persona && !texto) throw new Error('Di quién viene (elige a alguien de la familia o escribe quién es)');
    var x = { id: v.id || Utilities.getUuid(), fecha: v.fecha, hora: hora || '', persona: persona, texto: texto };
    var i = -1;
    d.visitas.forEach(function (y, n) { if (y.id === x.id) i = n; });
    if (i >= 0) d.visitas[i] = x;
    else { if (d.visitas.length >= 60) throw new Error('Hay demasiadas visitas apuntadas. Borra alguna.'); d.visitas.push(x); }
    d.visitas.sort(function (a, b) { return (a.fecha + (a.hora || '00:00')).localeCompare(b.fecha + (b.hora || '00:00')); });
  });
  return admEstado(k);
}
function admVisitaBorrar(k, id) {
  admin_(k);
  modificar_(function (d) { d.visitas = d.visitas.filter(function (x) { return x.id !== id; }); });
  return admEstado(k);
}
/** r: { id?, dia 0..6 (0 = domingo), hora (opcional), persona (opcional), texto }. */
function admRutinaGuardar(k, r) {
  admin_(k);
  r = r || {};
  var dia = Math.floor(Number(r.dia));
  if (!(dia >= 0 && dia <= 6)) throw new Error('Elige el día de la semana');
  var hora = r.hora ? horaValida_(r.hora) : '';
  if (r.hora && !hora) throw new Error('Esa hora no vale');
  var texto = String(r.texto || '').trim().slice(0, 60);
  modificar_(function (d) {
    var persona = quePersonaValida_(d, r.persona);
    if (!persona && !texto) throw new Error('Escribe qué pasa ese día (por ejemplo "Viene la asistenta")');
    var x = { id: r.id || Utilities.getUuid(), dia: dia, hora: hora || '', persona: persona, texto: texto };
    var i = -1;
    d.rutina.forEach(function (y, n) { if (y.id === x.id) i = n; });
    if (i >= 0) d.rutina[i] = x;
    else { if (d.rutina.length >= 30) throw new Error('Hay demasiadas tareas semanales. Borra alguna.'); d.rutina.push(x); }
    d.rutina.sort(function (a, b) { return ((a.dia + 6) % 7) - ((b.dia + 6) % 7) || (a.hora || '').localeCompare(b.hora || ''); });
  });
  return admEstado(k);
}
function admRutinaBorrar(k, id) {
  admin_(k);
  modificar_(function (d) { d.rutina = d.rutina.filter(function (x) { return x.id !== id; }); });
  return admEstado(k);
}

/** "Probar" el enlace de iCloud: lo descarga y cuenta qué hay hoy y mañana. */
function admProbarICloud(k, url) {
  admin_(k);
  url = String(url || '').trim();
  if (!/^(webcal|https):\/\/[^\s]{6,480}$/i.test(url)) throw new Error('El enlace tiene que empezar por webcal:// o https://');
  var ev;
  try { ev = eventosDeICloud_(url, ventanaEventos_(new Date())); }
  catch (e) { throw new Error('No se ha podido leer ese calendario (' + String(e.message || e).slice(0, 80) + '). Comprueba que el enlace es el de "Calendario público".'); }
  ev.sort(function (a, b) { return a.dia - b.dia || a.orden.localeCompare(b.orden); });
  return { ok: true, total: ev.length, primero: ev.length ? (ev[0].dia === 0 ? 'Hoy' : 'Mañana') + (ev[0].hora ? ' ' + ev[0].hora : '') + ': ' + ev[0].titulo : '' };
}

/* ============================================================
 *  Mantenimiento diario: copia de los datos, limpieza de Drive y espacio ocupado
 * ============================================================ */

var COPIAS_QUE_SE_GUARDAN = 7;
var DIAS_MEDIOS_VISTOS = 30;

function subcarpeta_(nombre, propiedad) {
  var p = props_(), id = p.getProperty(propiedad);
  if (id) { try { return DriveApp.getFolderById(id); } catch (e) { /* se recrea */ } }
  var f = carpeta_().createFolder(nombre);
  p.setProperty(propiedad, f.getId());
  return f;
}

/** Una copia de pizarra-datos.json al día en Pizarra/Copias; se quedan las últimas 7. */
function copiaDiaria_() {
  leer_();
  var f = subcarpeta_('Copias', 'COPIAS_ID');
  var nombre = 'pizarra-datos-' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd') + '.json';
  var ya = f.getFilesByName(nombre);
  if (!ya.hasNext()) f.createFile(nombre, DriveApp.getFileById(props_().getProperty('DATOS_ID')).getBlob().getDataAsString('UTF-8'), MimeType.PLAIN_TEXT);
  var todos = [], it = f.getFiles();
  while (it.hasNext()) { var a = it.next(); if (/^pizarra-datos-\d{4}-\d{2}-\d{2}\.json$/.test(a.getName())) todos.push(a); }
  todos.sort(function (a, b) { return a.getName() < b.getName() ? 1 : -1; });
  todos.slice(COPIAS_QUE_SE_GUARDAN).forEach(function (a) { a.setTrashed(true); });
  return Math.min(todos.length, COPIAS_QUE_SE_GUARDAN);
}

/**
 * Borra los audios, vídeos y fotos mandados que ya se pusieron en la tele hace más de 30 días, y los trozos huérfanos de más de un día.
 * Solo toca archivos de la carpeta Pizarra/Medios: nunca las fotos de perfil ni las de los recordatorios.
 */
function limpiarMedios_() {
  var d = leer_(), ahora = Date.now(), limite = ahora - DIAS_MEDIOS_VISTOS * 86400000, borrar = [];
  d.medios.forEach(function (m) {
    var visto = 0;
    for (var i = 0; i < d.histMedios.length; i++) if (d.histMedios[i].id === m.id) { visto = d.histMedios[i].t; break; }
    var enUso = d.repro && d.repro.id === m.id && reproPendiente_(d, ahora);
    if (m.listo && visto && visto < limite && !enUso) borrar.push(m.id);
    else if (m.borrado && m.borrado < ahora - 600000 && !enUso) borrar.push(m.id);
  });
  var vivos = {};
  d.medios.forEach(function (m) { if (borrar.indexOf(m.id) < 0) vivos[m.id] = 1; });
  var huerfanos = 0, it = carpetaMedios_().getFiles();
  while (it.hasNext()) {
    var f = it.next(), n = /^([0-9a-f]{16})\.(?:\d+|mini)$/.exec(f.getName());
    if (!n) continue;                                                       // lo que no es un trozo no se toca
    if (borrar.indexOf(n[1]) >= 0) { f.setTrashed(true); continue; }
    if (!vivos[n[1]] && f.getDateCreated().getTime() < ahora - 86400000) { f.setTrashed(true); huerfanos++; }
  }
  if (borrar.length) modificar_(function (x) { x.medios = x.medios.filter(function (m) { return borrar.indexOf(m.id) < 0; }); });
  return { medios: borrar.length, huerfanos: huerfanos };
}

function tamanoCarpeta_(f) {
  var n = 0, it = f.getFiles();
  while (it.hasNext()) n += it.next().getSize();
  var sub = f.getFolders();
  while (sub.hasNext()) n += tamanoCarpeta_(sub.next());
  return n;
}
/** Cuánto ocupa la carpeta Pizarra (y sus partes). Se guarda para no recorrer Drive cada vez. */
function calcularEspacio_() {
  var raiz = carpeta_();
  var r = { t: Date.now(), total: tamanoCarpeta_(raiz), medios: tamanoCarpeta_(carpetaMedios_()), copias: tamanoCarpeta_(subcarpeta_('Copias', 'COPIAS_ID')) };
  props_().setProperty('ESPACIO', JSON.stringify(r));
  return r;
}
function espacioGuardado_() {
  try { return JSON.parse(props_().getProperty('ESPACIO') || 'null'); } catch (e) { return null; }
}
function admEspacio(k) {
  admin_(k);
  return { espacio: calcularEspacio_() };
}

/** Se ejecuta sola cada madrugada (activador "limpiezaDiaria"). Cada paso es independiente: si uno falla, siguen los demás. */
function limpiezaDiaria() {
  var r = {};
  try { r.copias = copiaDiaria_(); } catch (e) { Logger.log('Copia diaria: ' + e); }
  try { r.limpieza = limpiarMedios_(); } catch (e2) { Logger.log('Limpieza de medios: ' + e2); }
  try {
    var hoy = claveDia_(new Date(Date.now() - 7 * 86400000));
    modificar_(function (d) { d.visitas = d.visitas.filter(function (x) { return x.fecha >= hoy; }); });         // las visitas de hace más de una semana se quitan
  } catch (e3) { Logger.log('Visitas viejas: ' + e3); }
  try { r.espacio = calcularEspacio_(); } catch (e4) { Logger.log('Espacio: ' + e4); }
  return r;
}

/* ---------- Aviso de TV desconectada ---------- */

var TV_SIN_CONSULTAR_MIN = 30;
var TV_AVISO_CADA_H = 6;

/** Correo si la TV lleva más de 30 minutos sin preguntar, y otro cuando vuelve. Como mucho uno de cada tipo cada 6 horas. */
function avisoTV_(d) {
  if (d.avisoTV === false) return 0;
  var ult = tvUltima_();
  if (!ult) return 0;                                          // todavía no se ha conectado nunca
  var ahora = Date.now(), seg = ahora / 1000 - ult, enviados = 0;
  var p = props_(), est = {};
  try { est = JSON.parse(p.getProperty('AVISO_TV') || '{}'); } catch (e) { est = {}; }
  var cuando = Utilities.formatDate(new Date(ult * 1000), Session.getScriptTimeZone(), 'dd/MM HH:mm');
  if (seg > TV_SIN_CONSULTAR_MIN * 60) {
    if (!est.caida && ahora - (est.mailCaida || 0) > TV_AVISO_CADA_H * 3600000) {
      enviarCorreo_(d, 'Pizarra: la tele no responde', 'La tele no ha consultado la pizarra desde el ' + cuando + ' (hace más de ' + TV_SIN_CONSULTAR_MIN + ' minutos).\n\n' +
        'Puede estar apagada o sin internet. Te avisaré cuando vuelva.');
      est.mailCaida = ahora; enviados++;
    }
    est.caida = true;
  } else if (seg < 600 && est.caida) {
    est.caida = false;
    if (ahora - (est.mailVuelta || 0) > TV_AVISO_CADA_H * 3600000) {
      enviarCorreo_(d, 'Pizarra: la tele ha vuelto', 'La tele ya está consultando la pizarra otra vez.');
      est.mailVuelta = ahora; enviados++;
    }
  }
  p.setProperty('AVISO_TV', JSON.stringify(est));
  return enviados;
}
