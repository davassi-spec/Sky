// Simulador mínimo de Apps Script para probar Code.gs en Node: Drive, caché, bloqueos y propiedades.
const fs = require('fs'), vm = require('vm'), path = require('path'), crypto = require('crypto');

function crear(opciones = {}) {
  const props = Object.assign({ CLAVE: 'ADMINKEY' }, opciones.props || {});
  const cacheMapa = {};
  const archivos = {};                         // id -> { nombre, bytes, papelera }
  const carpetas = {};
  let llamadasFetch = 0;

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
    };
  };
  const folderApi = (id) => ({
    getId: () => id,
    createFile: (x, contenido) => {
      const nid = crypto.randomUUID();
      if (typeof x === 'string') archivos[nid] = { nombre: x, bytes: Buffer.from(contenido, 'utf8') };
      else archivos[nid] = { nombre: x.nombre, bytes: Buffer.from(x.bytes) };
      return fileApi(nid);
    },
  });

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
      get: (k) => (k in cacheMapa ? cacheMapa[k] : null),
      put: (k, v) => { if (String(v).length > 100000) throw new Error('Valor demasiado grande para la caché'); cacheMapa[k] = String(v); },
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
      formatDate: (d, tz, f) => { const p = (n) => String(n).padStart(2, '0'); return p(d.getHours()) + ':' + p(d.getMinutes()); },
      newBlob: (bytes, tipo, nombre) => ({ bytes, tipo, nombre }),
      base64Decode: (s) => Array.from(Buffer.from(s, 'base64')),
      base64Encode: (b) => Buffer.from(b).toString('base64'),
    },
    ContentService: { createTextOutput: (s) => ({ s, setMimeType() { return this; } }), MimeType: { JSON: 1 } },
    CalendarApp: {
      getDefaultCalendar: () => ({ getEventsForDay: () => eventosFalsos }),
      getAllCalendars: () => [{ getId: () => 'c1', getName: () => 'Mamá' }],
      getCalendarById: () => null,
    },
    UrlFetchApp: { fetch: () => { llamadasFetch++; return { getContentText: () => JSON.stringify({
      current: { temperature_2m: 20.4, weather_code: 2 },
      daily: { weather_code: [2, 61], temperature_2m_max: [23, 19], temperature_2m_min: [17, 15] } }) }; } },
    Session: { getScriptTimeZone: () => 'Europe/Madrid' },
    ScriptApp: { getService: () => ({ getUrl: () => 'https://x/exec' }) },
    HtmlService: { createTemplateFromFile: () => ({ evaluate: () => ({ setTitle() { return this; }, addMetaTag() { return this; } }) }) },
    Logger: { log() {} }, console, Date, Math, JSON, String, Number, Array, Object, RegExp, Error, isNaN, parseInt,
  };
  if (opciones.ahora) {                         // reloj congelado, para capturas y pruebas repetibles
    const base = opciones.ahora, t0 = Date.now();
    ctx.Date = class FijaDate extends Date {
      constructor(...a) { if (a.length === 0) super(base + (Date.now() - t0)); else super(...a); }
      static now() { return base + (Date.now() - t0); }
    };
  }
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(opciones.codigo || path.join(__dirname, '..', 'Code.gs'), 'utf8'), ctx);
  const run = (c) => vm.runInContext(c, ctx);
  return { run, props, cacheMapa, archivos, contarFetch: () => llamadasFetch, vaciarCache: () => Object.keys(cacheMapa).forEach((k) => delete cacheMapa[k]) };
}

module.exports = { crear };
