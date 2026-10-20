/**
 * Cerebro de la pizarra. Corre en tu cuenta de Google (script.google.com).
 *  - Guarda los mensajes y los ajustes.
 *  - Lee los calendarios que elijas.
 *  - Consulta el tiempo (así la TV, que es antigua, solo habla con Google).
 *  - Sirve los datos a la TV (?a=estado) y la app del móvil (?a=admin).
 *
 * Dos tipos de clave, siempre en ?k=...:
 *  - La clave de administrador (la que crea `configurar`): lo puede todo. Es la de la TV y la tuya.
 *  - Una clave de familia por persona (se crean desde la app): solo puede escribir mensajes y
 *    quitar los suyos. No ve ni cambia los ajustes, ni el calendario.
 */
var PROP = 'pizarra';

function datos_() {
  var s = PropertiesService.getScriptProperties().getProperty(PROP);
  var d = s ? JSON.parse(s) : {};
  var base = {
    mensajes: [], ciudad: 'Maó', latitud: 39.889, longitud: 4.265, calendarios: [],
    widgets: { mensajes: true, eventos: true, tiempo: true },
    noche: { desde: 21, hasta: 6 },
    nocheTexto: 'Es hora de dormir.',
    contacto: { nombre: '', telefono: '' },
    familia: []
  };
  for (var k in base) if (d[k] === undefined) d[k] = base[k];
  for (var w in base.widgets) if (d.widgets[w] === undefined) d.widgets[w] = base.widgets[w];
  return d;
}
function guardar_(d) { PropertiesService.getScriptProperties().setProperty(PROP, JSON.stringify(d)); }
function clave_() { return PropertiesService.getScriptProperties().getProperty('CLAVE'); }
function nuevaClave_() { return Utilities.getUuid().replace(/-/g, '').slice(0, 24); }
function salida_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/** Quién es el dueño de la clave: administrador, un familiar o nadie. */
function quien_(k) {
  if (!k) return null;
  if (k === clave_()) return { rol: 'admin', id: 'admin', nombre: '' };
  var f = datos_().familia;
  for (var i = 0; i < f.length; i++) if (f[i].clave === k) return { rol: 'familia', id: f[i].id, nombre: f[i].nombre };
  return null;
}
function admin_(k) { var q = quien_(k); if (!q || q.rol !== 'admin') throw new Error('No tienes permiso para esto'); return q; }
function alguien_(k) { var q = quien_(k); if (!q) throw new Error('Clave incorrecta'); return q; }

/** Ejecútala UNA vez desde el editor: crea la clave secreta y la muestra en el registro. */
function configurar() {
  var p = PropertiesService.getScriptProperties();
  if (!p.getProperty('CLAVE')) p.setProperty('CLAVE', nuevaClave_());
  Logger.log('Tu clave secreta es: ' + p.getProperty('CLAVE'));
  // Estas dos líneas hacen que Google pida los permisos de calendario y de Internet ahora.
  CalendarApp.getDefaultCalendar();
  UrlFetchApp.fetch('https://api.open-meteo.com/v1/forecast?latitude=0&longitude=0&current=temperature_2m');
}

function doGet(e) {
  var k = e && e.parameter ? e.parameter.k : '';
  var q = quien_(k);
  if (!q) return salida_({ error: 'clave' });
  if ((e.parameter.a || 'estado') === 'admin') {
    var t = HtmlService.createTemplateFromFile('Admin');
    t.clave = k;
    t.rol = q.rol;
    t.enlaceBase = ScriptApp.getService().getUrl();
    return t.evaluate().setTitle('Pizarra')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1');
  }
  if (q.rol !== 'admin') return salida_({ error: 'permiso' });   // la TV usa la clave de administrador
  return salida_(estado_());
}

/* ---------- Lo que ve la TV ---------- */
function estado_() {
  var d = datos_();
  var ahora = Date.now();
  var vivos = d.mensajes.filter(function (m) { return !m.hasta || m.hasta * 1000 > ahora; });
  return {
    ahora: new Date().toISOString(),
    widgets: d.widgets,
    noche: d.noche,
    nocheTexto: d.nocheTexto,
    contacto: d.contacto,
    mensajes: d.widgets.mensajes ? vivos.slice(0, 2).map(function (m) {
      return { id: m.id, de: m.de, texto: m.texto, t: m.t, hasta: m.hasta };
    }) : [],
    eventos: d.widgets.eventos ? eventos_(d.calendarios) : [],
    tiempo: d.widgets.tiempo ? tiempo_(d.latitud, d.longitud) : null
  };
}

function eventos_(ids) {
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
        out.push({
          dia: i, titulo: ev.getTitle(), hora: todo ? '' : Utilities.formatDate(ev.getStartTime(), tz, 'HH:mm'),
          orden: todo ? '00:00' : Utilities.formatDate(ev.getStartTime(), tz, 'HH:mm')
        });
      });
    });
  });
  out.sort(function (a, b) { return a.dia - b.dia || a.orden.localeCompare(b.orden); });
  return out.slice(0, 6);
}

function tiempo_(lat, lon) {
  var cache = CacheService.getScriptCache();
  var clave = 'tiempo_' + lat + '_' + lon;
  var hit = cache.get(clave);
  if (hit) return JSON.parse(hit);
  try {
    var r = UrlFetchApp.fetch('https://api.open-meteo.com/v1/forecast?latitude=' + lat + '&longitude=' + lon +
      '&current=temperature_2m,weather_code&timezone=auto', { muteHttpExceptions: true });
    var c = JSON.parse(r.getContentText()).current;
    var t = { temp: c.temperature_2m, codigo: c.weather_code };
    cache.put(clave, JSON.stringify(t), 900);
    return t;
  } catch (err) {
    return null;
  }
}

/* ---------- Lo que usa la app del móvil (cada función comprueba la clave) ---------- */
function vivos_(mensajes) {
  var ahora = Date.now();
  return mensajes.filter(function (m) { return !m.hasta || m.hasta * 1000 > ahora; });
}

function admEstado(k) {
  var q = alguien_(k);
  var d = datos_();
  var vivos = vivos_(d.mensajes);
  if (q.rol === 'familia') {
    // Un familiar solo ve sus propios mensajes y nada de los ajustes.
    return { rol: 'familia', nombre: q.nombre, datos: { mensajes: vivos.filter(function (m) { return m.autor === q.id; }) },
             calendarios: [], familia: [] };
  }
  d.mensajes = vivos;
  var cals = CalendarApp.getAllCalendars().map(function (c) { return { id: c.getId(), nombre: c.getName() }; });
  return { rol: 'admin', nombre: '', datos: d, calendarios: cals,
           familia: d.familia.map(function (f) { return { id: f.id, nombre: f.nombre, clave: f.clave }; }) };
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
  var d = datos_();
  d.mensajes.unshift({
    id: Utilities.getUuid(),
    de: q.rol === 'familia' ? q.nombre : String(de || '').trim().slice(0, 30),   // un familiar no puede firmar con otro nombre
    autor: q.id,
    texto: texto,
    t: Math.floor(Date.now() / 1000),
    hasta: duracion === 'siempre' ? null : finDelDia_(duracion === 'manana' ? 1 : 0)
  });
  d.mensajes = d.mensajes.slice(0, 30);
  guardar_(d);
  return admEstado(k);
}

function admBorrar(k, id) {
  var q = alguien_(k);
  var d = datos_();
  if (id === 'todos') {
    admin_(k);
    d.mensajes = [];
  } else {
    d.mensajes = d.mensajes.filter(function (m) {
      if (m.id !== id) return true;
      return q.rol !== 'admin' && m.autor !== q.id;   // un familiar solo quita lo suyo
    });
  }
  guardar_(d);
  return admEstado(k);
}

function admGuardarAjustes(k, aj) {
  admin_(k);
  var d = datos_();
  ['mensajes', 'eventos', 'tiempo'].forEach(function (w) { d.widgets[w] = !!(aj.widgets && aj.widgets[w]); });
  d.calendarios = (aj.calendarios || []).map(String);
  d.ciudad = String(aj.ciudad || d.ciudad).slice(0, 60);
  d.latitud = Number(aj.latitud) || d.latitud;
  d.longitud = Number(aj.longitud) || d.longitud;
  d.noche = { desde: Math.max(0, Math.min(23, Number(aj.nocheDesde))), hasta: Math.max(0, Math.min(23, Number(aj.nocheHasta))) };
  d.nocheTexto = String(aj.nocheTexto || '').trim().slice(0, 120) || 'Es hora de dormir.';
  d.contacto = { nombre: String(aj.contactoNombre || '').trim().slice(0, 30), telefono: String(aj.contactoTelefono || '').trim().slice(0, 25) };
  guardar_(d);
  CacheService.getScriptCache().removeAll(['tiempo_' + d.latitud + '_' + d.longitud]);
  return admEstado(k);
}

/** Familia: añadir una persona (crea su clave) o quitarla (su enlace deja de funcionar al instante). */
function admFamiliaAnadir(k, nombre) {
  admin_(k);
  nombre = String(nombre || '').trim().slice(0, 30);
  if (!nombre) throw new Error('Escribe un nombre');
  var d = datos_();
  if (d.familia.length >= 10) throw new Error('Ya hay 10 personas');
  d.familia.push({ id: Utilities.getUuid(), nombre: nombre, clave: nuevaClave_() });
  guardar_(d);
  return admEstado(k);
}

function admFamiliaQuitar(k, id) {
  admin_(k);
  var d = datos_();
  d.familia = d.familia.filter(function (f) { return f.id !== id; });
  guardar_(d);
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
