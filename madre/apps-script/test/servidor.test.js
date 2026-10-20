// Pruebas de Code.gs (fase 0) con el simulador de Apps Script. Uso:  node test/servidor.test.js
const { crear: crearSimulador } = require('./simulador');
const crear = (o = {}) => crearSimulador(Object.assign({ limiteProp: 9216 }, o));   // con el límite real de Google: 9 KB por valor de propiedad
let bien = 0, mal = 0;
const t = (n, c) => { if (c) bien++; else { mal++; console.log('FALLA:', n); } };
const falla = (f) => { try { f(); return false; } catch (e) { return true; } };
const J = (s) => JSON.stringify(s);

/* ---------- 1. Migración desde los datos de antes (una sola propiedad) ---------- */
{
  const v1 = { mensajes: [{ id: 'm1', de: 'Dani', autor: 'admin', texto: 'Hola', t: 1000, hasta: null }],
    ciudad: 'Maó', latitud: 39.889, longitud: 4.265, calendarios: ['c1'],
    widgets: { mensajes: true, eventos: false, tiempo: true }, noche: { desde: 22, hasta: 7 }, nocheTexto: 'A dormir.',
    contacto: { nombre: 'Pep', telefono: '600' }, familia: [{ id: 'f1', nombre: 'Ana', clave: 'KANA' }] };
  const s = crear({ props: { pizarra: J(v1) } });
  const d = s.run('datos_()');
  t('migra los mensajes', d.mensajes.length === 1 && d.mensajes[0].texto === 'Hola');
  t('migra la familia y su clave', d.familia[0].clave === 'KANA' && d.familia[0].nombre === 'Ana');
  t('migra los ajustes', d.noche.desde === 22 && d.nocheTexto === 'A dormir.' && d.contacto.nombre === 'Pep' && d.calendarios[0] === 'c1' && d.widgets.eventos === false);
  t('se crea el archivo en Drive', !!s.props.DATOS_ID && Object.keys(s.archivos).length === 1);
  t('la copia antigua se conserva como respaldo', !!s.props.pizarra);
  s.vaciarCache();
  t('tras vaciar la caché se vuelve a leer del archivo', s.run('datos_()').familia[0].clave === 'KANA');
  t('un familiar de antes sigue entrando', s.run("quien_('KANA')").rol === 'familia');
  t('no se crea un segundo archivo', (s.run('datos_()'), s.run("admEnviar('ADMINKEY','x','y','hoy')"), Object.keys(s.archivos).length === 1));
}

/* ---------- 2. Instalación nueva y datos de más de 9 KB ---------- */
{
  const s = crear();
  for (let i = 0; i < 30; i++) s.run(`admEnviar('ADMINKEY','Dani','Mensaje ${i}: ${'x'.repeat(180)}', 'siempre')`);
  s.run("admFamiliaAnadir('ADMINKEY','Ana')"); s.run("admFamiliaAnadir('ADMINKEY','María')");
  const d = s.run('datos_()');
  const bytes = Buffer.byteLength(J(d));
  t('guarda más de 9 KB sin problema (' + bytes + ' bytes)', bytes > 9000 && d.mensajes.length === 30);
  t('las propiedades solo guardan identificadores pequeños', !s.props.pizarra && Object.keys(s.props).every((k) => String(s.props[k]).length < 9000));
  s.vaciarCache();
  t('tras vaciar la caché nada se pierde', s.run('datos_()').mensajes.length === 30 && s.run('datos_()').familia.length === 2);
  t('el administrador sigue viendo todo', s.run("admEstado('ADMINKEY')").datos.mensajes.length === 30);
}

/* ---------- 3. Permisos (sin cambios respecto a antes) ---------- */
{
  const s = crear();
  s.run("admFamiliaAnadir('ADMINKEY','Ana')"); s.run("admFamiliaAnadir('ADMINKEY','María')");
  const [ana, maria] = s.run('datos_()').familia;
  t('un familiar no crea familiares', falla(() => s.run(`admFamiliaAnadir('${ana.clave}','X')`)));
  t('un familiar no cambia ajustes', falla(() => s.run(`admGuardarAjustes('${ana.clave}',{})`)));
  t('un familiar no busca ciudades', falla(() => s.run(`admBuscarCiudad('${ana.clave}','x')`)));
  t('un familiar no quita a otros', falla(() => s.run(`admFamiliaQuitar('${ana.clave}','${maria.id}')`)));
  t('un familiar no borra todos', falla(() => s.run(`admBorrar('${ana.clave}','todos')`)));
  const r = s.run(`admEnviar('${ana.clave}','Pep','Hoy viene Ana a las 6.','hoy')`);
  t('firma forzada a su nombre', r.rol === 'familia' && r.datos.mensajes[0].de === 'Ana');
  t('un familiar no ve calendarios ni familia', r.calendarios.length === 0 && r.familia.length === 0);
  s.run(`admEnviar('${maria.clave}','','Te llamo luego','siempre')`);
  const idMaria = s.run('datos_()').mensajes.find((m) => m.de === 'María').id;
  s.run(`admBorrar('${ana.clave}','${idMaria}')`);
  t('Ana no borra el de María', s.run('datos_()').mensajes.some((m) => m.id === idMaria));
  s.run(`admBorrar('${maria.clave}','${idMaria}')`);
  t('María borra el suyo', !s.run('datos_()').mensajes.some((m) => m.id === idMaria));
  t('la TV no puede leerse con una clave de familia', JSON.parse(s.run(`doGet({parameter:{k:'${ana.clave}'}}).s`)).error === 'permiso');
  t('sin clave o con clave mala: error', JSON.parse(s.run('doGet({parameter:{}}).s')).error === 'clave' && JSON.parse(s.run("doGet({parameter:{k:'x'}}).s")).error === 'clave');
  s.run(`admFamiliaQuitar('ADMINKEY','${maria.id}')`);
  t('quitar a alguien revoca su enlace', falla(() => s.run(`admEnviar('${maria.clave}','','x','hoy')`)));
  const aj = s.run("admGuardarAjustes('ADMINKEY',{widgets:{mensajes:true,eventos:false,tiempo:true},nocheDesde:20,nocheHasta:7,nocheTexto:'  ',contactoNombre:'Dani',contactoTelefono:'600',ciudad:'Ciutadella',latitud:40,longitud:3.8,calendarios:['c1']})");
  t('el administrador guarda ajustes', aj.datos.noche.desde === 20 && aj.datos.nocheTexto === 'Es hora de dormir.' && aj.datos.ciudad === 'Ciutadella' && aj.datos.widgets.eventos === false);
  t('y se guardan también en el archivo', (s.vaciarCache(), s.run('datos_()').noche.desde === 20));
}

/* ---------- 4. La app de la TV ya instalada sigue recibiendo lo mismo ---------- */
{
  const s = crear({ eventos: [{ isAllDayEvent: () => false, getEndTime: () => new Date(Date.now() + 7200000), getStartTime: () => new Date(Date.now() + 3600000), getTitle: () => 'Merienda con Ana' }] });
  s.run("admEnviar('ADMINKEY','Pep','Hoy viene Ana a las 6.','hoy')");
  const e = JSON.parse(s.run("doGet({parameter:{k:'ADMINKEY'}}).s"));
  t('widgets', e.widgets.mensajes === true && e.widgets.eventos === true && e.widgets.tiempo === true);
  t('mensajes', e.mensajes[0].de === 'Pep' && e.mensajes[0].texto.indexOf('Ana') > 0 && typeof e.mensajes[0].t === 'number' && 'hasta' in e.mensajes[0]);
  t('eventos', e.eventos[0].titulo === 'Merienda con Ana' && e.eventos[0].dia === 0 && /^\d\d:\d\d$/.test(e.eventos[0].hora));
  t('tiempo', e.tiempo.temp === 20.4 && e.tiempo.codigo === 2);
  t('noche y contacto', e.noche.desde === 21 && e.noche.hasta === 6 && e.nocheTexto && e.contacto);
  const antes = s.contarFetch(); s.run('estado_()'); s.run('estado_()');
  t('el tiempo se guarda en caché', s.contarFetch() === antes);
}

/* ---------- 5. Un fallo dentro de modificar_ no guarda nada ---------- */
{
  const s = crear();
  s.run("admEnviar('ADMINKEY','Dani','Uno','hoy')");
  t('si falla, no se guarda nada a medias', falla(() => s.run("modificar_(function (d) { d.mensajes = []; throw new Error('fallo'); })")) && s.run('datos_()').mensajes.length === 1);
  t('el bloqueo se libera aunque falle', (() => { s.run("admEnviar('ADMINKEY','Dani','Dos','hoy')"); return s.run('datos_()').mensajes.length === 2; })());
  t('"autorizar" funciona y no duplica archivos', (s.run('autorizar()'), Object.keys(s.archivos).length === 1));
}

/* ---------- 6. Contador de uso ---------- */
{
  const s = crear();
  for (let i = 0; i < 5; i++) s.run("doGet({parameter:{k:'ADMINKEY'}})");
  s.run("doGet({parameter:{k:'ADMINKEY',a:'admin'}})");
  let m = JSON.parse(s.run("doGet({parameter:{k:'ADMINKEY',a:'metricas'}}).s"));
  const hoy = Object.keys(m.dias)[0];
  const contado = (acc) => ((m.dias[hoy] || {})[acc] || { peticiones: 0 }).peticiones + ((m.pendientesDeVolcar || {})[acc] || { n: 0 }).n;
  t('cuenta las peticiones de estado y de panel', contado('estado') >= 5 && contado('admin') >= 1);
  t('la primera petición se vuelca enseguida y el resto se acumula', !!hoy && m.dias[hoy].estado.peticiones >= 1);
  t('incluye el tiempo medio y las cuotas', m.dias[hoy].estado.msMedio >= 0 && m.cuotasGratuitas.llamadasUrlFetchAlDia === 20000);
  s.run("(function () { CacheService.getScriptCache().put('met_volcado', '0', 100); })()");
  s.run("doGet({parameter:{k:'ADMINKEY'}})");
  m = JSON.parse(s.run("doGet({parameter:{k:'ADMINKEY',a:'metricas'}}).s"));
  t('pasado un minuto se vuelca todo a las propiedades', m.dias[hoy].estado.peticiones >= 6 && Object.keys(m.pendientesDeVolcar).length <= 1);
  s.props.METRICAS = JSON.stringify({ 20200101: { estado: { n: 1, ms: 1, max: 1 } }, 20200102: {}, 20200103: {}, 20200104: {}, 20200105: {}, 20200106: {}, 20200107: {}, 20200108: {}, 20200109: {} });
  s.run("(function () { CacheService.getScriptCache().put('met_volcado', '0', 100); })()"); s.run("doGet({parameter:{k:'ADMINKEY'}})");
  t('solo se guardan los últimos 8 días', Object.keys(JSON.parse(s.props.METRICAS)).length <= 8);
  t('las métricas solo las ve el administrador', (() => { s.run("admFamiliaAnadir('ADMINKEY','Ana')"); const c = s.run('datos_()').familia[0].clave; return JSON.parse(s.run(`doGet({parameter:{k:'${c}',a:'metricas'}}).s`)).error === 'permiso'; })());
  t('un fallo al medir no rompe la petición', (() => { s.run("CacheService.getScriptCache().put('met_pend', 'esto no es json', 100)"); return JSON.parse(s.run("doGet({parameter:{k:'ADMINKEY'}}).s")).version === undefined && true; })());
}

console.log(bien + ' bien, ' + mal + ' fallos');
process.exit(mal ? 1 : 0);
