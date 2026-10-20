/**
 * Cerebro de la pizarra (versión 2). Corre en tu cuenta de Google (script.google.com).
 *
 *  - Guarda mensajes, ajustes, cuentas atrás y fotos en un archivo JSON de tu Drive (carpeta "Pizarra").
 *  - Lee los calendarios que elijas y consulta el tiempo (hoy y mañana).
 *  - Sirve los datos a la TV (?a=estado) y la app del móvil (?a=admin).
 *
 * Dos tipos de clave, siempre en ?k=...:
 *  - La clave de administrador (la que crea `configurar`): lo puede todo. Es la de la TV y la tuya.
 *  - Una clave de familia por persona: solo puede escribir mensajes, quitar los suyos y cambiar su foto.
 *
 * Los mensajes de la familia se muestran directamente, sin aprobación.
 */
var VERSION = 2;
var NOMBRE_CARPETA = 'Pizarra';
var NOMBRE_DATOS = 'pizarra-datos.json';
var MAX_CADUCADOS = 100;          // mensajes ya caducados que se guardan en el historial
var MAX_ACTIVOS = 50;
var ESTILOS = ['calido', 'lavanda', 'salvia', 'terracota', 'contraste'];
var BLOQUES = ['cuentaAtras', 'mensajes', 'proximo', 'tiempo', 'parteDelDia'];
var ICONOS_CUENTA = ['calendario', 'avion', 'corazon', 'tarta'];
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
    estiloDia: 'calido', estiloNoche: 'calido',
    prueba: null,                                  // { estilo, modo, hasta } mientras dura "Probar 1 minuto"
    cuentasAtras: [],
    noche: { desde: 21, hasta: 6 },
    nocheTexto: 'Es hora de dormir.',
    contacto: { nombre: '', telefono: '' },
    familia: []
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
  if (ESTILOS.indexOf(d.estiloDia) < 0) d.estiloDia = 'calido';
  if (ESTILOS.indexOf(d.estiloNoche) < 0) d.estiloNoche = 'calido';
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
  if (c) return JSON.parse(c);
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
}
function esVivo_(m, ahora) { return !m.hasta || m.hasta * 1000 > (ahora || Date.now()); }

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
  if (a === 'foto') return salida_(fotoParaTV_(e.parameter.p));
  marcarTV_();
  return salida_(estado_());
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
    if (ahora - ultimo < 60000) { cache.put('met_pend', JSON.stringify(pend), 21600); return; }
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

function marcarTV_() {
  var ahora = Math.floor(Date.now() / 1000);
  var cache = CacheService.getScriptCache();
  cache.put('tv', String(ahora), 21600);
  var ultimaProp = Number(cache.get('tv_prop') || 0);
  if (ahora - ultimaProp > 300) {                  // se anota en las propiedades como mucho cada 5 min
    props_().setProperty('TV_ULTIMA', String(ahora));
    cache.put('tv_prop', String(ahora), 21600);
  }
}
function tvUltima_() {
  var c = CacheService.getScriptCache().get('tv');
  return Number(c || props_().getProperty('TV_ULTIMA') || 0);
}

function bloqueActivo_(d, id) {
  for (var i = 0; i < d.bloques.length; i++) if (d.bloques[i].id === id) return d.bloques[i].activo;
  return true;
}

function estado_() {
  var d = leer_();
  var ahora = Date.now();
  var vivos = d.mensajes.filter(function (m) { return esVivo_(m, ahora); }).sort(function (a, b) { return b.t - a.t; });
  var verMsg = bloqueActivo_(d, 'mensajes'), verEv = bloqueActivo_(d, 'proximo'), verT = bloqueActivo_(d, 'tiempo');
  var prueba = d.prueba && d.prueba.hasta > ahora ? { estilo: d.prueba.estilo, modo: d.prueba.modo, segundos: Math.round((d.prueba.hasta - ahora) / 1000) } : null;
  return {
    ahora: new Date(ahora).toISOString(),
    version: VERSION,
    // Formato de la versión 1 (lo lee la app de la TV ya instalada):
    widgets: { mensajes: verMsg, eventos: verEv, tiempo: verT },
    noche: d.noche,
    nocheTexto: d.nocheTexto,
    contacto: d.contacto,
    mensajes: verMsg ? vivos.slice(0, 2).map(function (m) { return mensajeParaTV_(m, d); }) : [],
    eventos: verEv ? eventos_(d.calendarios) : [],
    tiempo: verT ? tiempo_(d.latitud, d.longitud) : null,
    // Novedades de la versión 2:
    bloques: d.bloques,
    estiloDia: d.estiloDia,
    estiloNoche: d.estiloNoche,
    prueba: prueba,
    cuentaAtras: bloqueActivo_(d, 'cuentaAtras') ? cuentaAtras_(d) : null
  };
}

function mensajeParaTV_(m, d) {
  var f = null;
  for (var i = 0; i < d.familia.length; i++) if (d.familia[i].id === m.autor) f = d.familia[i];
  return { id: m.id, de: m.de, texto: m.texto, t: m.t, hasta: m.hasta, autor: m.autor, foto: f && f.foto ? f.foto.v : null };
}

/** Eventos de hoy y de mañana. Se guardan 55 s en caché: la TV y el panel preguntan a menudo. */
function eventos_(ids) {
  var cache = CacheService.getScriptCache();
  var clave = 'eventos_' + (ids || []).join(',');
  var hit = cache.get(clave);
  if (hit) return JSON.parse(hit);
  var cals = [];
  if (ids && ids.length) {
    ids.forEach(function (id) { var c = CalendarApp.getCalendarById(id); if (c) cals.push(c); });
  } else {
    cals.push(CalendarApp.getDefaultCalendar());
  }
  var tz = Session.getScriptTimeZone();
  var ahora = new Date();
  var dias = [ahora, new Date(ahora.getTime() + 86400000)];
  var out = [];
  dias.forEach(function (dia, i) {
    cals.forEach(function (c) {
      c.getEventsForDay(dia).forEach(function (ev) {
        var todo = ev.isAllDayEvent();
        if (i === 0 && !todo && ev.getEndTime() < ahora) return;   // ya terminó
        var hora = todo ? '' : Utilities.formatDate(ev.getStartTime(), tz, 'HH:mm');
        out.push({ dia: i, titulo: ev.getTitle(), hora: hora, orden: todo ? '00:00' : hora });
      });
    });
  });
  out.sort(function (a, b) { return a.dia - b.dia || a.orden.localeCompare(b.orden); });
  out = out.slice(0, 6);
  try { cache.put(clave, JSON.stringify(out), 55); } catch (e) { /* sin caché */ }
  return out;
}

/** Tiempo de ahora, de hoy y de mañana (Open-Meteo, sin clave). Caché de 30 min. */
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

/* ---------- Fotos de la familia ---------- */

function fotoDePersona_(d, id) {
  for (var i = 0; i < d.familia.length; i++) if (d.familia[i].id === id) return d.familia[i];
  return null;
}

/** La TV pide la foto de una persona con la clave de administrador. Solo se sirven fotos registradas. */
function fotoParaTV_(personaId) {
  var f = fotoDePersona_(leer_(), personaId);
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
  var out = CalendarApp.getAllCalendars().map(function (c) { return { id: c.getId(), nombre: c.getName() }; });
  try { cache.put('calendarios', JSON.stringify(out), 600); } catch (e) { /* sin caché */ }
  return out;
}

function admEstado(k) {
  var q = alguien_(k);
  var d = leer_();
  var ahora = Date.now();
  var tv = { ultima: tvUltima_(), conectada: (Date.now() / 1000 - tvUltima_()) < TV_CONECTADA_S };
  if (q.rol === 'familia') {
    var yo = fotoDePersona_(d, q.id);
    return {
      rol: 'familia', nombre: q.nombre, miId: q.id, tv: tv, ahora: ahora,
      tieneFoto: !!(yo && yo.foto),
      mensajes: d.mensajes.filter(function (m) { return m.autor === q.id; }),
      ciudad: d.ciudad
    };
  }
  var proxima = cuentaAtras_(d);
  return {
    rol: 'admin', tv: tv, ahora: ahora,
    datos: {
      mensajes: d.mensajes, bloques: d.bloques, estiloDia: d.estiloDia, estiloNoche: d.estiloNoche,
      prueba: d.prueba && d.prueba.hasta > ahora ? d.prueba : null,
      cuentasAtras: d.cuentasAtras.map(function (c) {
        var dias = diasHasta_(c.fecha);
        return { id: c.id, texto: c.texto, fecha: c.fecha, icono: c.icono, desdeDias: c.desdeDias, textoDia: c.textoDia,
                 dias: dias, aviso: dias >= 0 ? textoCuenta_(c, dias) : 'Ya pasó' };
      }),
      noche: d.noche, nocheTexto: d.nocheTexto, contacto: d.contacto,
      ciudad: d.ciudad, latitud: d.latitud, longitud: d.longitud, calendarios: d.calendarios,
      familia: d.familia.map(function (f) {
        var propios = d.mensajes.filter(function (m) { return m.autor === f.id; });
        return { id: f.id, nombre: f.nombre, clave: f.clave, tieneFoto: !!f.foto,
                 ultimoT: propios.length ? propios[0].t : null,
                 activos: propios.filter(function (m) { return esVivo_(m, ahora); }).length };
      })
    },
    cuentaVista: proxima,
    calendarios: calendarios_(),
    vista: vistaPreviaTV_(d),
    enlaceBase: ScriptApp.getService().getUrl()
  };
}

/** Lo mismo que ve la TV, para la miniatura del panel (sin contar como "TV conectada"). */
function vistaPreviaTV_(d) {
  var e = estado_();
  return { mensajes: e.mensajes, eventos: e.eventos, tiempo: e.tiempo, cuentaAtras: e.cuentaAtras, bloques: e.bloques,
           estiloDia: e.estiloDia, estiloNoche: e.estiloNoche, noche: e.noche, nocheTexto: e.nocheTexto, contacto: e.contacto };
}

function finDelDia_(dias) {
  var n = new Date();
  return Math.floor(new Date(n.getFullYear(), n.getMonth(), n.getDate() + dias, 23, 59, 59).getTime() / 1000);
}

/** duracion: 'hoy' (hasta las 23:59), 'manana' (también mañana) o 'siempre' (hasta que lo quites). */
function admEnviar(k, de, texto, duracion) {
  var q = alguien_(k);
  texto = String(texto || '').trim().slice(0, 200);
  if (!texto) throw new Error('El mensaje está vacío');
  modificar_(function (d) {
    d.mensajes.unshift({
      id: Utilities.getUuid(),
      de: q.rol === 'familia' ? q.nombre : String(de || '').trim().slice(0, 30),   // un familiar no firma con otro nombre
      autor: q.id,
      texto: texto,
      t: Math.floor(Date.now() / 1000),
      hasta: duracion === 'siempre' ? null : finDelDia_(duracion === 'manana' ? 1 : 0)
    });
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
    if (aj.calendarios) d.calendarios = aj.calendarios.map(String);
    if (aj.ciudad) {
      d.ciudad = String(aj.ciudad).slice(0, 60);
      d.latitud = Number(aj.latitud) || d.latitud;
      d.longitud = Number(aj.longitud) || d.longitud;
    }
    if (aj.nocheDesde !== undefined && aj.nocheHasta !== undefined) {
      d.noche = { desde: Math.max(0, Math.min(23, Number(aj.nocheDesde))), hasta: Math.max(0, Math.min(23, Number(aj.nocheHasta))) };
    }
    if (aj.nocheTexto !== undefined) d.nocheTexto = String(aj.nocheTexto).trim().slice(0, 120) || 'Es hora de dormir.';
    if (aj.contactoNombre !== undefined) {
      d.contacto = { nombre: String(aj.contactoNombre).trim().slice(0, 30), telefono: String(aj.contactoTelefono || '').trim().slice(0, 25) };
    }
  });
  CacheService.getScriptCache().removeAll(['calendarios']);
  return admEstado(k);
}

/** "Probar estilo 1 minuto": la TV usa ese estilo en modo día o noche durante un minuto. */
function admProbarEstilo(k, estilo, modo) {
  admin_(k);
  if (ESTILOS.indexOf(estilo) < 0) throw new Error('Ese estilo no existe');
  modificar_(function (d) {
    d.prueba = { estilo: estilo, modo: modo === 'noche' ? 'noche' : 'dia', hasta: Date.now() + 60000 };
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

function admFamiliaAnadir(k, nombre) {
  admin_(k);
  nombre = String(nombre || '').trim().slice(0, 30);
  if (!nombre) throw new Error('Escribe un nombre');
  modificar_(function (d) {
    if (d.familia.length >= 10) throw new Error('Ya hay 10 personas');
    d.familia.push({ id: Utilities.getUuid(), nombre: nombre, clave: nuevaClave_(), foto: null });
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

function admBuscarCiudad(k, q) {
  admin_(k);
  var r = UrlFetchApp.fetch('https://geocoding-api.open-meteo.com/v1/search?count=5&language=es&name=' + encodeURIComponent(q),
    { muteHttpExceptions: true });
  var res = JSON.parse(r.getContentText()).results || [];
  return res.map(function (x) {
    return { nombre: x.name, region: [x.admin1, x.country].filter(Boolean).join(', '), latitud: x.latitude, longitud: x.longitude };
  });
}
