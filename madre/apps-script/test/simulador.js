// Simulador mínimo de Apps Script para probar Code.gs en Node: Drive, caché, bloqueos y propiedades.
const fs = require('fs'), vm = require('vm'), path = require('path'), crypto = require('crypto');

function crear(opciones = {}) {
  const props = Object.assign({ CLAVE: 'ADMINKEY' }, opciones.props || {});
  const cacheMapa = {}, expira = {};
  const ahoraSim = () => (typeof reloj !== 'undefined' && reloj.base ? reloj.base + (Date.now() - reloj.t0) : Date.now());
  const archivos = {};                         // id -> { nombre, bytes, papelera }
  const carpetas = {};
  const subcarp = {}, nombresCarp = {};          // carpeta -> carpeta madre / nombre
  let llamadasFetch = 0, llamadasCalendario = 0;
  const urlsPedidas = [];
  const correos = [];                          // correos enviados
  const disparadores = [];                     // nombres de las funciones con disparador

  const blobDe = (a) => ({
    getDataAsString: () => Buffer.from(a.bytes).toString('utf8'),
    getBytes: () => Array.from(a.bytes),
  });
  const fileApi = (id) => {
    const a = archivos[id];
    if (!a) throw new Error('No existe el archivo ' + id);
    return {
      getId: () => id,
      getBlob: () => blobDe(a),
      setContent: (s) => { a.bytes = Buffer.from(s, 'utf8'); },
      setTrashed: (v) => { a.papelera = v; },
      getName: () => a.nombre,
      getSize: () => a.bytes.length,
      getDateCreated: () => new Date(a.creado || Date.now()),
    };
  };
  const folderApi = (id) => ({
    getId: () => id,
    createFile: (x, contenido) => {
      const nid = crypto.randomUUID();
      if (typeof x === 'string') archivos[nid] = { nombre: x, bytes: Buffer.from(contenido, 'utf8'), carpeta: id };
      else archivos[nid] = { nombre: x.nombre, bytes: Buffer.from(x.bytes), carpeta: id };
      return fileApi(nid);
    },
    createFolder: (n) => { const c = crypto.randomUUID(); carpetas[c] = 1; subcarp[c] = id; nombresCarp[c] = n; return folderApi(c); },
    getFolders: () => lista2(Object.keys(subcarp).filter((c) => subcarp[c] === id), folderApi),
    getFoldersByName: (n) => lista2(Object.keys(subcarp).filter((c) => subcarp[c] === id && nombresCarp[c] === n), folderApi),
    getFiles: () => lista(Object.keys(archivos).filter((f) => archivos[f].carpeta === id && !archivos[f].papelera)),
    getFilesByName: (n) => lista(Object.keys(archivos).filter((f) => archivos[f].carpeta === id && !archivos[f].papelera && archivos[f].nombre === n)),
  });
  const lista2 = (ids, f) => { let i = 0; return { hasNext: () => i < ids.length, next: () => f(ids[i++]) }; };
  const lista = (ids) => { let i = 0; return { hasNext: () => i < ids.length, next: () => fileApi(ids[i++]) }; };

  const eventosFalsos = opciones.eventos || [];
  const ctx = {
    PropertiesService: { getScriptProperties: () => ({
      getProperty: (k) => (k in props ? props[k] : null),
      setProperty: (k, v) => {
        if (opciones.limiteProp && Buffer.byteLength(String(v)) > opciones.limiteProp) throw new Error('Exception: Argument too large: value');   // Google: 9 KB por valor
        props[k] = String(v);
      },
    }) },
    CacheService: { getScriptCache: () => ({
      get: (k) => { if (k in expira && expira[k] <= ahoraSim()) { delete cacheMapa[k]; delete expira[k]; } return k in cacheMapa ? cacheMapa[k] : null; },
      put: (k, v, ttl) => { if (String(v).length > 100000) throw new Error('Valor demasiado grande para la caché'); cacheMapa[k] = String(v); if (ttl) expira[k] = ahoraSim() + ttl * 1000; else delete expira[k]; },
      getAll: (ks) => { const o = {}; ks.forEach((k) => { if (k in expira && expira[k] <= ahoraSim()) { delete cacheMapa[k]; delete expira[k]; } if (k in cacheMapa) o[k] = cacheMapa[k]; }); return o; },
      remove: (k) => { delete cacheMapa[k]; },
      removeAll: (ks) => ks.forEach((k) => delete cacheMapa[k]),
    }) },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    DriveApp: {
      getFolderById: (id) => { if (!carpetas[id]) throw new Error('sin carpeta'); return folderApi(id); },
      getFoldersByName: () => ({ hasNext: () => false }),
      createFolder: () => { const id = crypto.randomUUID(); carpetas[id] = 1; return folderApi(id); },
      getFileById: (id) => fileApi(id),
    },
    MimeType: { PLAIN_TEXT: 'text/plain' },
    Utilities: {
      getUuid: () => crypto.randomUUID(),
      formatDate: (d, tz, f) => { const p = (n) => String(n).padStart(2, '0'); return String(f).replace('yyyy', d.getFullYear()).replace('MM', p(d.getMonth() + 1)).replace('dd', p(d.getDate())).replace('HH', p(d.getHours())).replace('mm', p(d.getMinutes())); },
      newBlob: (bytes, tipo, nombre) => ({ bytes, tipo, nombre }),
      parseDate: (str, tz, fmt) => { const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})$/.exec(str); if (!m || !(tz === 'Europe/Madrid')) throw new Error('parseDate: ' + str + ' ' + tz); return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]); },
      base64Decode: (s) => Array.from(Buffer.from(s, 'base64')),
      base64Encode: (b) => Buffer.from(b).toString('base64'),
    },
    ContentService: { createTextOutput: (s) => ({ s, setMimeType() { return this; } }), MimeType: { JSON: 1 } },
    CalendarApp: {
      getDefaultCalendar: () => ({ getEventsForDay: () => { llamadasCalendario++; return eventosFalsos; } }),
      getAllCalendars: () => [{ getId: () => 'c1', getName: () => 'Mamá' }],
      getCalendarById: () => null,
    },
    UrlFetchApp: { fetch: (u) => { llamadasFetch++; urlsPedidas.push(u); if (/icloud|\.ics/i.test(u)) { if (opciones.icsFalla) return { getResponseCode: () => 404, getContentText: () => '' }; return { getResponseCode: () => 200, getContentText: () => opciones.ics || '' }; } return { getResponseCode: () => 200, getContentText: () => JSON.stringify({
      current: { temperature_2m: 20.4, weather_code: 2 },
      daily: { weather_code: [2, 61], temperature_2m_max: [23, 19], temperature_2m_min: [17, 15] } }) }; } },
    Session: { getScriptTimeZone: () => 'Europe/Madrid', getEffectiveUser: () => ({ getEmail: () => 'yo@ejemplo.com' }) },
    MailApp: {
      getRemainingDailyQuota: () => 100 - correos.length,
      sendEmail: (para, asunto, cuerpo) => { if (opciones.correoFalla) throw new Error('Sin permiso para enviar correos'); correos.push({ para, asunto, cuerpo }); },
    },
    ScriptApp: {
      getService: () => ({ getUrl: () => 'https://x/exec' }),
      getProjectTriggers: () => disparadores.map((f) => ({ getHandlerFunction: () => f })),
      newTrigger: (f) => ({ timeBased: () => ({ everyMinutes: () => ({ create: () => { disparadores.push(f); } }), everyDays: () => ({ atHour: () => ({ create: () => { disparadores.push(f); } }) }) }) }),
    },
    HtmlService: { createTemplateFromFile: () => ({ evaluate: () => ({ setTitle() { return this; }, addMetaTag() { return this; } }) }) },
    Logger: { log() {} }, console, Date, Math, JSON, String, Number, Array, Object, RegExp, Error, isNaN, parseInt,
  };
  const reloj = { base: opciones.ahora || null, t0: Date.now() };
  if (opciones.ahora) {                         // reloj congelado (y que se puede mover con fijar), para capturas y pruebas repetibles
    ctx.Date = class FijaDate extends Date {
      constructor(...a) { if (a.length === 0) super(reloj.base + (Date.now() - reloj.t0)); else super(...a); }
      static now() { return reloj.base + (Date.now() - reloj.t0); }
    };
  }
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(opciones.codigo || path.join(__dirname, '..', 'Code.gs'), 'utf8'), ctx);
  const run = (c) => vm.runInContext(c, ctx);
  return { fijar: (ms) => { reloj.base = ms; reloj.t0 = Date.now(); }, run, props, cacheMapa, archivos, correos, disparadores, contarFetch: () => llamadasFetch, contarCalendario: () => llamadasCalendario, urlsPedidas, vaciarCache: () => Object.keys(cacheMapa).forEach((k) => delete cacheMapa[k]) };
}

module.exports = { crear };
