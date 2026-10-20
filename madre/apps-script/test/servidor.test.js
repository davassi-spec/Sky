// Pruebas de Code.gs con el simulador. Uso:  node test/servidor.test.js
const { crear: crearSimulador } = require('./simulador');
const crear = (o = {}) => crearSimulador(Object.assign({ limiteProp: 9216 }, o));   // con el límite real de Google: 9 KB por valor de propiedad
let bien = 0, mal = 0;
const t = (n, c) => { if (c) bien++; else { mal++; console.log('FALLA:', n); } };
const falla = (f) => { try { f(); return false; } catch (e) { return true; } };
const J = (s) => JSON.stringify(s);
const diaRelativo = (n) => { const d = new Date(); d.setDate(d.getDate() + n); const p = (x) => String(x).padStart(2, '0'); return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); };
const JPEG = 'data:image/jpeg;base64,' + Buffer.from('foto-de-prueba').toString('base64');

/* ---------- 1. Migración desde la versión 1 ---------- */
{
  const v1 = { mensajes: [{ id: 'm1', de: 'Dani', autor: 'admin', texto: 'Hola', t: 1000, hasta: null }],
    ciudad: 'Maó', latitud: 39.889, longitud: 4.265, calendarios: ['c1'],
    widgets: { mensajes: true, eventos: false, tiempo: true }, noche: { desde: 22, hasta: 7 }, nocheTexto: 'A dormir.',
    contacto: { nombre: 'Pep', telefono: '600' }, familia: [{ id: 'f1', nombre: 'Ana', clave: 'KANA' }] };
  const s = crear({ props: { pizarra: J(v1) } });
  const d = s.run('leer_()');
  t('migra los mensajes', d.mensajes.length === 1 && d.mensajes[0].texto === 'Hola');
  t('migra la familia y su clave', d.familia[0].clave === 'KANA' && d.familia[0].nombre === 'Ana');
  t('migra ajustes', d.noche.desde === 22 && d.nocheTexto === 'A dormir.' && d.contacto.nombre === 'Pep' && d.calendarios[0] === 'c1');
  t('widgets pasan a bloques', d.bloques.find((b) => b.id === 'proximo').activo === false && d.bloques.find((b) => b.id === 'mensajes').activo === true);
  t('se crea el archivo en Drive', !!s.props.DATOS_ID && Object.keys(s.archivos).length === 1);
  t('la copia antigua se conserva', !!s.props.pizarra);
  s.vaciarCache();
  t('se vuelve a leer del archivo', s.run('leer_()').familia[0].clave === 'KANA');
  t('un familiar de la v1 sigue entrando', s.run("quien_('KANA')").rol === 'familia');
}

/* ---------- 2. Instalación nueva, y datos de más de 9 KB ---------- */
{
  const s = crear();
  for (let i = 0; i < 60; i++) s.run(`admEnviar('ADMINKEY','Dani','Mensaje número ${i} con un texto bastante largo para ocupar espacio en los datos',  'siempre')`);
  const d = s.run('leer_()');
  const bytes = Buffer.byteLength(J(d));
  t('guarda más de 9 KB sin problema (' + bytes + ' bytes)', bytes > 9000 && d.mensajes.length > 0);
  t('las propiedades no guardan los datos', !s.props.pizarra && (s.props.DATOS_ID || '').length < 100);
  s.vaciarCache();
  t('tras vaciar la caché los datos siguen', s.run('leer_()').mensajes.length === d.mensajes.length);
}

/* ---------- 3. Historial ---------- */
{
  const s = crear();
  s.run("admFamiliaAnadir('ADMINKEY','Ana')");
  const ana = s.run('leer_()').familia[0];
  s.run(`modificar_(function (d) {
    var pasado = Math.floor(Date.now() / 1000) - 3600;
    for (var i = 0; i < 130; i++) d.mensajes.push({ id: 'v' + i, de: 'Ana', autor: '${ana.id}', texto: 'viejo ' + i, t: 1000 + i, hasta: pasado });
    for (var j = 0; j < 3; j++) d.mensajes.push({ id: 'o' + j, de: 'Dani', autor: 'admin', texto: 'otro ' + j, t: 5000 + j, hasta: pasado });
  })`);
  const d = s.run('leer_()');
  t('el historial se recorta a 100 caducados', d.mensajes.length === 100);
  t('se quedan los más recientes', d.mensajes.some((m) => m.id === 'o2') && !d.mensajes.some((m) => m.id === 'v0'));
  const admin = s.run("admEstado('ADMINKEY')");
  t('el administrador ve todos', admin.datos.mensajes.length === 100);
  const fam = s.run(`admEstado('${ana.clave}')`);
  t('un familiar solo ve los suyos', fam.mensajes.length > 0 && fam.mensajes.every((m) => m.autor === ana.id) && fam.mensajes.length < 100);
  s.run("admEnviar('ADMINKEY','Dani','Activo','hoy')");
  const idAct = s.run('leer_()').mensajes.find((m) => m.texto === 'Activo').id;
  s.run(`admBorrar('${ana.clave}','${idAct}')`);
  t('un familiar no quita el de otro', s.run('leer_()').mensajes.find((m) => m.id === idAct).hasta > Date.now() / 1000);
  s.run(`admBorrar('ADMINKEY','${idAct}')`);
  const quitado = s.run('leer_()').mensajes.find((m) => m.id === idAct);
  t('quitar deja el mensaje en el historial', quitado && quitado.hasta < Date.now() / 1000);
  t('la TV ya no lo ve', !s.run('estado_()').mensajes.some((m) => m.id === idAct));
  t('solo el admin quita todos', falla(() => s.run(`admBorrar('${ana.clave}','todos')`)));
  s.run(`admEliminarDelHistorial('ADMINKEY','${idAct}')`);
  t('el admin puede borrar del historial', !s.run('leer_()').mensajes.some((m) => m.id === idAct));
  t('un familiar no borra del historial', falla(() => s.run(`admEliminarDelHistorial('${ana.clave}','todos')`)));
}

/* ---------- 4. Compatibilidad con la app de la TV ya instalada ---------- */
{
  const s = crear({ eventos: [{ isAllDayEvent: () => false, getEndTime: () => new Date(Date.now() + 7200000), getStartTime: () => new Date(Date.now() + 3600000), getTitle: () => 'Merienda con Ana' }] });
  s.run("admEnviar('ADMINKEY','Pep','Hoy viene Ana a las 6.','hoy')");
  const e = JSON.parse(s.run("doGet({parameter:{k:'ADMINKEY'}}).s"));
  t('widgets (v1)', e.widgets && e.widgets.mensajes === true && e.widgets.eventos === true && e.widgets.tiempo === true);
  t('mensajes (v1)', e.mensajes[0].de === 'Pep' && e.mensajes[0].texto.indexOf('Ana') > 0 && typeof e.mensajes[0].t === 'number' && 'hasta' in e.mensajes[0]);
  t('eventos (v1)', e.eventos[0].titulo === 'Merienda con Ana' && e.eventos[0].dia === 0 && /^\d\d:\d\d$/.test(e.eventos[0].hora));
  t('tiempo (v1)', e.tiempo.temp === 20.4 && e.tiempo.codigo === 2);
  t('noche y contacto (v1)', e.noche.desde === 21 && e.noche.hasta === 6 && e.nocheTexto && e.contacto);
  t('tiempo de hoy y mañana', e.tiempo.hoy.max === 23 && e.tiempo.manana.temp === 19 && e.tiempo.manana.codigo === 61);
  t('versión y estilos', e.version === 3 && e.estiloDia === 'lavanda' && e.estiloNoche === 'calido' && e.bloques.length === 5);
  const antes = s.contarFetch(); s.run('estado_()'); s.run('estado_()');
  t('el tiempo se guarda en caché', s.contarFetch() === antes);
}

/* ---------- 5. Cuentas atrás ---------- */
{
  const s = crear();
  const nueva = (texto, dias, extra = {}) => s.run(`admGuardarCuentaAtras('ADMINKEY', ${J(Object.assign({ texto, fecha: diaRelativo(dias), icono: 'calendario', desdeDias: 30 }, extra))})`);
  nueva('Todos los Santos', 12);
  t('faltan 12 días', s.run('estado_()').cuentaAtras.texto === 'Faltan 12 días para Todos los Santos');
  nueva('el cumpleaños de Pep', 1);
  t('1 día, en singular', s.run('estado_()').cuentaAtras.texto === 'Falta 1 día para el cumpleaños de Pep');
  nueva('Navidad', 3);
  t('sale la más cercana', s.run('estado_()').cuentaAtras.dias === 1);
  nueva('Boda', 0, { textoDia: 'Hoy es la boda de Ana' });
  t('el mismo día usa el texto del día', s.run('estado_()').cuentaAtras.texto === 'Hoy es la boda de Ana');
  const s2 = crear();
  s2.run(`admGuardarCuentaAtras('ADMINKEY', ${J({ texto: 'Sin texto del día', fecha: diaRelativo(0), icono: 'tarta', desdeDias: 30 })})`);
  t('sin texto del día: "Hoy es …"', s2.run('estado_()').cuentaAtras.texto === 'Hoy es Sin texto del día');
  const s3 = crear();
  s3.run(`admGuardarCuentaAtras('ADMINKEY', ${J({ texto: 'Ayer', fecha: diaRelativo(-1), icono: 'avion', desdeDias: 30 })})`);
  t('al día siguiente desaparece', s3.run('estado_()').cuentaAtras === null);
  s3.run(`admGuardarCuentaAtras('ADMINKEY', ${J({ texto: 'Lejos', fecha: diaRelativo(40), icono: 'corazon', desdeDias: 30 })})`);
  t('no sale antes de tiempo', s3.run('estado_()').cuentaAtras === null);
  s3.run(`admGuardarCuentaAtras('ADMINKEY', ${J({ texto: 'Lejos', fecha: diaRelativo(40), icono: 'corazon', desdeDias: 60 })})`);
  t('"desde cuántos días antes"', s3.run('estado_()').cuentaAtras.dias === 40);
  t('cuenta atrás sin fecha falla', falla(() => s3.run("admGuardarCuentaAtras('ADMINKEY',{texto:'X'})")));
  const id = s3.run('leer_()').cuentasAtras.find((c) => c.texto === 'Lejos').id;
  s3.run(`admBorrarCuentaAtras('ADMINKEY','${id}')`);
  t('se puede borrar una', s3.run('leer_()').cuentasAtras.length === 2 && !s3.run('leer_()').cuentasAtras.some((c) => c.id === id));
  s3.run("admAjustes('ADMINKEY',{bloques:[{id:'cuentaAtras',activo:false}]})");
  s3.run(`admGuardarCuentaAtras('ADMINKEY', ${J({ texto: 'Hoy', fecha: diaRelativo(0), icono: 'tarta' })})`);
  t('el bloque apagado oculta la cuenta atrás', s3.run('estado_()').cuentaAtras === null);
  t('familiar no gestiona cuentas atrás', (() => { s3.run("admFamiliaAnadir('ADMINKEY','Ana')"); const c = s3.run('leer_()').familia[0].clave; return falla(() => s3.run(`admGuardarCuentaAtras('${c}',{texto:'X',fecha:'2026-01-01'})`)); })());
}

/* ---------- 6. Bloques, estilos y "probar 1 minuto" ---------- */
{
  const s = crear();
  s.run("admAjustes('ADMINKEY',{bloques:[{id:'tiempo',activo:true},{id:'mensajes',activo:false},{id:'tiempo',activo:false},{id:'inventado',activo:true}]})");
  const b = s.run('leer_()').bloques;
  t('orden respetado y completado', b[0].id === 'tiempo' && b[1].id === 'mensajes' && b.length === 5 && b.every((x) => ['cuentaAtras', 'mensajes', 'proximo', 'tiempo', 'parteDelDia'].indexOf(x.id) >= 0));
  t('ids repetidos o inventados se ignoran', b.filter((x) => x.id === 'tiempo').length === 1);
  const e = s.run('estado_()');
  t('mensajes apagado: la TV no los recibe', e.widgets.mensajes === false && e.mensajes.length === 0);
  s.run("admAjustes('ADMINKEY',{estiloDia:'lavanda',estiloNoche:'inventado'})");
  const d = s.run('leer_()');
  t('estilo válido se guarda, inválido se ignora', d.estiloDia === 'lavanda' && d.estiloNoche === 'calido');
  s.run("admProbarEstilo('ADMINKEY','salvia','noche')");
  const p = s.run('estado_()').prueba;
  t('probar estilo 1 minuto', p && p.estilo === 'salvia' && p.modo === 'noche' && p.segundos > 50 && p.segundos <= 60);
  s.run("modificar_(function(d){ d.prueba.hasta = Date.now() - 1; })");
  t('la prueba caduca', s.run('estado_()').prueba === null);
  t('estilo inexistente falla', falla(() => s.run("admProbarEstilo('ADMINKEY','x','dia')")));
  s.run("admAjustes('ADMINKEY',{nocheDesde:20,nocheHasta:7,nocheTexto:'  ',contactoNombre:'Dani',contactoTelefono:'600 000 000',ciudad:'Ciutadella',latitud:40,longitud:3.8,calendarios:['c1']})");
  const d2 = s.run('leer_()');
  t('ajustes de noche, contacto, ciudad y calendarios', d2.noche.desde === 20 && d2.nocheTexto === 'Es hora de dormir.' && d2.contacto.telefono === '600 000 000' && d2.ciudad === 'Ciutadella' && d2.calendarios[0] === 'c1');
  s.run("admAjustes('ADMINKEY',{nocheDesde:25,nocheHasta:-3})");
  t('las horas se acotan a 0-23', s.run('leer_()').noche.desde === 23 && s.run('leer_()').noche.hasta === 0);
}

/* ---------- 7. Familia y fotos ---------- */
{
  const s = crear();
  s.run("admFamiliaAnadir('ADMINKEY','Ana')"); s.run("admFamiliaAnadir('ADMINKEY','María')");
  const [ana, maria] = s.run('leer_()').familia;
  t('un familiar no crea familiares', falla(() => s.run(`admFamiliaAnadir('${ana.clave}','X')`)));
  t('un familiar no cambia ajustes', falla(() => s.run(`admAjustes('${ana.clave}',{estiloDia:'salvia'})`)));
  t('un familiar no busca ciudades', falla(() => s.run(`admBuscarCiudad('${ana.clave}','x')`)));
  t('un familiar no prueba estilos', falla(() => s.run(`admProbarEstilo('${ana.clave}','salvia','dia')`)));
  let r = s.run(`admEnviar('${ana.clave}','Pep','Te llamo luego','hoy')`);
  t('firma forzada a su nombre', r.mensajes[0].de === 'Ana');
  t('un familiar no ve ajustes ni a los demás', r.rol === 'familia' && r.datos === undefined && r.mensajes.every((m) => m.autor === ana.id));
  // fotos
  r = s.run(`admFoto('${ana.clave}','${maria.id}',${J(JPEG)})`);
  t('el familiar cambia su propia foto (ignora la de otro)', r.tieneFoto === true && s.run('leer_()').familia[1].foto === null && s.run('leer_()').familia[0].foto !== null);
  t('rechaza fotos que no son JPEG', falla(() => s.run(`admFoto('${ana.clave}',null,'data:image/png;base64,AAAA')`)));
  t('rechaza fotos enormes', falla(() => s.run(`admFoto('${ana.clave}',null,'data:image/jpeg;base64,' + 'A'.repeat(460000))`)));
  const JPEG2 = 'data:image/jpeg;base64,' + Buffer.from('foto-de-maria').toString('base64');
  s.run(`admFoto('ADMINKEY','${maria.id}',${J(JPEG2)})`);
  t('el admin cambia la foto de cualquiera', s.run('leer_()').familia[1].foto !== null);
  t('el familiar lee su foto', s.run(`admLeerFoto('${ana.clave}',null)`) === JPEG);
  t('el familiar no puede leer la de otro (siempre recibe la suya)', s.run(`admLeerFoto('${ana.clave}','${maria.id}')`) === JPEG);
  t('el admin lee la de María', s.run(`admLeerFoto('ADMINKEY','${maria.id}')`) === JPEG2);
  const antigua = s.run('leer_()').familia[0].foto.id;
  s.run(`admFoto('${ana.clave}',null,${J(JPEG)})`);
  t('la foto antigua va a la papelera', s.archivos[antigua].papelera === true);
  const msg = s.run('estado_()').mensajes.find((m) => m.autor === ana.id);
  t('la TV recibe la versión de la foto del autor', msg && msg.foto === s.run('leer_()').familia[0].foto.v);
  // endpoint de la TV
  const tvFoto = JSON.parse(s.run(`doGet({parameter:{k:'ADMINKEY',a:'foto',p:'${ana.id}'}}).s`));
  t('la TV descarga la foto con la clave de admin', tvFoto.tipo === 'image/jpeg' && Buffer.from(tvFoto.b64, 'base64').toString() === 'foto-de-prueba');
  t('un familiar no descarga fotos por el endpoint de la TV', JSON.parse(s.run(`doGet({parameter:{k:'${ana.clave}',a:'foto',p:'${ana.id}'}}).s`)).error === 'permiso');
  t('no se sirven archivos que no son fotos registradas', JSON.parse(s.run("doGet({parameter:{k:'ADMINKEY',a:'foto',p:'cualquier-id'}}).s")).error === 'sin foto');
  s.run(`admFotoQuitar('${ana.clave}',null)`);
  t('quitar la foto', s.run('leer_()').familia[0].foto === null);
  const fotoMaria = s.run('leer_()').familia[1].foto.id;
  s.run(`admFamiliaQuitar('ADMINKEY','${maria.id}')`);
  t('al quitar a alguien, su foto va a la papelera y su enlace deja de valer', s.archivos[fotoMaria].papelera === true && falla(() => s.run(`admEnviar('${maria.clave}','','x','hoy')`)));
}

/* ---------- 8. Estado de la TV ---------- */
{
  const s = crear();
  t('sin TV todavía: desconectada', s.run("admEstado('ADMINKEY')").tv.conectada === false);
  s.run("doGet({parameter:{k:'ADMINKEY'}})");
  const tv = s.run("admEstado('ADMINKEY')").tv;
  t('tras pedir el estado: conectada', tv.conectada === true && tv.ultima > 0);
  t('la miniatura del panel no cuenta como TV', (() => { const s2 = crear(); s2.run("admEstado('ADMINKEY')"); return s2.run("admEstado('ADMINKEY')").tv.conectada === false; })());
  s.run("(function(){ var c = CacheService.getScriptCache(); c.put('tv', String(Math.floor(Date.now()/1000) - 400), 600); })()");
  t('pasados 150 s: desconectada', s.run("admEstado('ADMINKEY')").tv.conectada === false);
  t('sin clave o con clave mala: error', JSON.parse(s.run("doGet({parameter:{}}).s")).error === 'clave' && JSON.parse(s.run("doGet({parameter:{k:'x'}}).s")).error === 'clave');
}

/* ---------- 9. Un fallo dentro de modificar_ no guarda nada ---------- */
{
  const s = crear();
  s.run("admEnviar('ADMINKEY','Dani','Uno','hoy')");
  t('si falla, no se guarda nada a medias', falla(() => s.run("modificar_(function (d) { d.mensajes = []; throw new Error('fallo'); })")) && s.run('leer_()').mensajes.length === 1);
}

/* ---------- 10. Contador de uso ---------- */
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
  t('las métricas solo las ve el administrador', (() => { s.run("admFamiliaAnadir('ADMINKEY','Ana')"); const c = s.run('leer_()').familia[0].clave; return JSON.parse(s.run(`doGet({parameter:{k:'${c}',a:'metricas'}}).s`)).error === 'permiso'; })());
  t('un fallo al medir no rompe la petición', (() => { s.run("CacheService.getScriptCache().put('met_pend', 'esto no es json', 100)"); return JSON.parse(s.run("doGet({parameter:{k:'ADMINKEY'}}).s")).widgets !== undefined; })());
}

/* ---------- 11. Caché con datos de una versión anterior ---------- */
{
  // Datos tal como los guardaba la fase 0 (sin bloques ni estilos), todavía en la caché tras actualizar el código.
  const f0 = { mensajes: [{ id: 'm1', de: 'Dani', autor: 'admin', texto: 'Hola', t: 1000, hasta: null }],
    ciudad: 'Maó', latitud: 39.889, longitud: 4.265, calendarios: [],
    widgets: { mensajes: true, eventos: false, tiempo: true }, noche: { desde: 22, hasta: 7 }, nocheTexto: 'A dormir.',
    contacto: { nombre: 'Pep', telefono: '600' }, familia: [{ id: 'f1', nombre: 'Ana', clave: 'KANA' }] };
  const s = crear();
  s.run('leer_()');                                  // crea el archivo en Drive
  s.cacheMapa.datos = J(f0);                         // caché antigua
  t('leer_() devuelve siempre datos con bloques', Array.isArray(s.run('leer_()').bloques) && s.run('leer_()').bloques.length === 5);
  let estado = null, error = null;
  try { estado = s.run('estado_()'); } catch (e) { error = e.message; }
  t('estado_() no falla con una caché antigua' + (error ? ' (' + error + ')' : ''), estado && estado.bloques.length === 5);
  t('los widgets antiguos se convierten en bloques', estado && estado.widgets.eventos === false && estado.widgets.mensajes === true && estado.bloques.find((b) => b.id === 'proximo').activo === false);
  t('se conservan mensajes, ajustes y familia', estado && estado.mensajes[0].texto === 'Hola' && estado.noche.desde === 22 && estado.contacto.nombre === 'Pep');
  t('quien_ y admEstado también funcionan', s.run("quien_('KANA')").rol === 'familia' && s.run("admEstado('ADMINKEY')").rol === 'admin');
  s.cacheMapa.datos = J(f0);
  s.run("admEnviar('ADMINKEY','Dani','Nuevo','hoy')");
  t('escribir con una caché antigua no pierde nada', (s.vaciarCache(), s.run('leer_()').mensajes.length === 2 && s.run('leer_()').familia[0].clave === 'KANA' && s.run('leer_()').bloques.length === 5));
  const viejo = crear(); viejo.run('leer_()'); viejo.cacheMapa.datos = J({ mensajes: [], familia: [] });
  t('incluso con una caché casi vacía', (() => { try { return viejo.run('estado_()').bloques.length === 5; } catch (e) { return false; } })());
}

/* ---------- 9. Recordatorios con foto ---------- */
{
  const a = (y, m, d, h, mi) => new Date(y, m - 1, d, h, mi).getTime();     // 2026-10-20 es martes (getDay() = 2)
  const s = crear({ ahora: a(2026, 10, 20, 16, 0) });
  const rec = (o = {}) => J(Object.assign({ hora: '17:00', dias: [], texto: 'Hacer los ejercicios', texto2: 'Con calma', duracion: 15, confirmar: true }, o));
  const guardar = (o, foto, quitar) => s.run(`admRecordatorioGuardar('ADMINKEY', ${rec(o)}, ${foto ? J(foto) : 'null'}, ${!!quitar})`);
  const tv = () => s.run('estado_()').recordatorio;

  t('sin recordatorios, la TV no recibe nada', tv() === null && s.run('estado_()').version === 3);
  t('no se guarda sin texto', falla(() => guardar({ texto: '  ' })));
  t('no se guarda sin hora válida', falla(() => guardar({ hora: '25:00' })) && falla(() => guardar({ hora: '' })));
  t('un familiar no puede crear recordatorios', (() => { s.run("admFamiliaAnadir('ADMINKEY','Ana')"); const kf = s.run('leer_()').familia[0].clave; return falla(() => s.run(`admRecordatorioGuardar(${J(kf)}, ${rec()}, null, false)`)); })());
  let e = guardar({});
  const r1 = e.datos.recordatorios[0];
  t('se guarda con la hora normalizada y todos los días', r1.hora === '17:00' && r1.dias.length === 7 && r1.duracion === 15 && r1.confirmar === true && r1.activo === true);
  t('la hora de una cifra se normaliza', guardar({ id: r1.id, hora: '9:05' }).datos.recordatorios[0].hora === '09:05');
  guardar({ id: r1.id, hora: '17:00' });

  s.fijar(a(2026, 10, 20, 16, 59)); t('antes de la hora, nada', tv() === null);
  s.fijar(a(2026, 10, 20, 17, 0));
  const v = tv();
  t('a su hora sale en la TV con sus textos', v && v.texto === 'Hacer los ejercicios' && v.texto2 === 'Con calma' && v.confirmar === true && v.foto === null && !v.prueba);
  t('dice cuánto falta para que termine', v && v.segundos === 900);
  s.fijar(a(2026, 10, 20, 17, 14)); t('sigue durante su duración', tv() !== null);
  s.fijar(a(2026, 10, 20, 17, 15)); t('pasada la duración, vuelve la pizarra', tv() === null);

  guardar({ id: r1.id, dias: [3, 4] }); s.fijar(a(2026, 10, 20, 17, 5)); t('si hoy (martes) no toca, no sale', tv() === null);
  guardar({ id: r1.id, dias: [2] });    t('si hoy toca, sale', tv() !== null);

  s.fijar(a(2026, 10, 20, 17, 5));
  const p = s.run("admEstado('ADMINKEY')").pendientes;
  t('el móvil ve el recordatorio pendiente', p.length === 1 && p[0].texto === 'Hacer los ejercicios' && p[0].enMarcha === true);
  e = s.run(`admRecordatorioConfirmar('ADMINKEY', ${J(p[0].clave)})`);
  t('al confirmarlo, la TV vuelve a la pizarra', tv() === null && e.pendientes.length === 0);
  t('y queda anotada la hora de confirmación', e.datos.recordatorios[0].confirmadoHoy !== null);
  t('no se puede confirmar dos veces', falla(() => s.run(`admRecordatorioConfirmar('ADMINKEY', ${J(p[0].clave)})`)));
  s.fijar(a(2026, 10, 21, 17, 5)); guardar({ id: r1.id, dias: [] }); t('al día siguiente vuelve a tocar', tv() !== null);

  // Noche: no salta ninguno
  guardar({ id: r1.id, hora: '22:00', dias: [] }); s.fijar(a(2026, 10, 21, 22, 5));
  t('de noche no salta ningún recordatorio', tv() === null);
  guardar({ id: r1.id, hora: '05:50', dias: [] }); s.fijar(a(2026, 10, 22, 5, 55));
  t('tampoco de madrugada', tv() === null);
  s.run("admAjustes('ADMINKEY', {nocheDesde: 23, nocheHasta: 23})");
  t('sin horario de noche sí sale', tv() !== null);
  guardar({ id: r1.id, hora: '23:50', duracion: 30, dias: [] }); s.fijar(a(2026, 10, 23, 0, 5));
  t('un recordatorio que cruza la medianoche sigue activo', tv() !== null);
  s.run("admAjustes('ADMINKEY', {nocheDesde: 21, nocheHasta: 6})");

  // Probar 1 minuto
  s.fijar(a(2026, 10, 21, 22, 30));
  e = s.run(`admRecordatorioProbar('ADMINKEY', ${J(r1.id)})`);
  const pr = tv();
  t('probar 1 minuto lo enseña aunque sea de noche', pr && pr.prueba === true && pr.segundos === 60);
  s.fijar(a(2026, 10, 21, 22, 32)); t('y se acaba solo', tv() === null);
  s.run(`admRecordatorioProbar('ADMINKEY', ${J(r1.id)})`);
  s.run(`admRecordatorioConfirmar('ADMINKEY', ${J(tv().clave)})`); t('confirmar una prueba la termina', tv() === null);
  t('probar un recordatorio que no existe falla', falla(() => s.run("admRecordatorioProbar('ADMINKEY','no-existe')")));
}

/* ---------- 10. Aviso por correo si nadie confirma ---------- */
{
  const a = (h, mi) => new Date(2026, 9, 20, h, mi).getTime();
  const s = crear({ ahora: a(16, 0) });
  const guardar = (o) => s.run(`admRecordatorioGuardar('ADMINKEY', ${J(Object.assign({ hora: '17:00', dias: [], texto: 'Hacer los ejercicios', duracion: 10, confirmar: true }, o))}, null, false)`);
  const id = guardar({}).datos.recordatorios[0].id;
  guardar({ hora: '17:00', texto: 'Solo mirar', confirmar: false });
  s.fijar(a(17, 29)); t('a los 29 minutos todavía no avisa', s.run('revisarAvisos()') === 0 && s.correos.length === 0);
  s.fijar(a(17, 31));
  t('a los 31 minutos avisa de lo que hay que confirmar', s.run('revisarAvisos()') === 1 && s.correos.length === 1);
  t('el correo va al correo de la cuenta y dice qué falta', s.correos[0].para === 'yo@ejemplo.com' && s.correos[0].asunto.indexOf('Hacer los ejercicios') >= 0 && s.correos[0].cuerpo.indexOf('17:00') >= 0);
  t('no manda dos veces el mismo aviso', s.run('revisarAvisos()') === 0 && s.correos.length === 1);
  t('el recordatorio que no hay que confirmar nunca avisa', !s.correos.some((c) => c.asunto.indexOf('Solo mirar') >= 0));
  t('y el panel sabe que ya se avisó', s.run("admEstado('ADMINKEY')").pendientes[0].avisado === true);

  const s2 = crear({ ahora: a(16, 0) });
  const g2 = (o) => s2.run(`admRecordatorioGuardar('ADMINKEY', ${J(Object.assign({ hora: '17:00', dias: [], texto: 'Hacer los ejercicios', duracion: 10, confirmar: true }, o))}, null, false)`);
  g2({}); s2.fijar(a(17, 20));
  const clave = s2.run("admEstado('ADMINKEY')").pendientes[0].clave;
  s2.run(`admRecordatorioConfirmar('ADMINKEY', ${J(clave)})`);
  s2.fijar(a(17, 40)); t('si se confirmó a tiempo, no hay correo', s2.run('revisarAvisos()') === 0 && s2.correos.length === 0);

  const s3 = crear({ ahora: a(16, 0) });
  s3.run(`admRecordatorioGuardar('ADMINKEY', ${J({ hora: '17:00', dias: [], texto: 'Cosa', duracion: 10, confirmar: true })}, null, false)`);
  s3.run("admCorreoAviso('ADMINKEY', 'dani@ejemplo.com')");
  s3.fijar(a(17, 35)); s3.run('revisarAvisos()');
  t('se puede cambiar el correo de destino', s3.correos[0].para === 'dani@ejemplo.com');
  t('un correo mal escrito se rechaza', falla(() => s3.run("admCorreoAviso('ADMINKEY', 'esto no es un correo')")));
  s3.run("admCorreoPrueba('ADMINKEY')"); t('el correo de prueba llega', s3.correos.length === 2 && s3.correos[1].asunto.indexOf('prueba') >= 0);

  const s4 = crear({ ahora: a(16, 0), correoFalla: true });
  s4.run(`admRecordatorioGuardar('ADMINKEY', ${J({ hora: '17:00', dias: [], texto: 'Cosa', duracion: 10, confirmar: true })}, null, false)`);
  s4.fijar(a(17, 35));
  t('si el correo falla, no se da por avisado (se reintenta)', s4.run('revisarAvisos()') === 0 && !Object.keys(s4.run('leer_()').recEstado).some((c) => s4.run('leer_()').recEstado[c].aviso));
  const s5 = crear({ ahora: a(16, 0) });
  s5.run(`admRecordatorioGuardar('ADMINKEY', ${J({ hora: '10:00', dias: [], texto: 'Viejo', duracion: 10, confirmar: true })}, null, false)`);
  s5.fijar(a(17, 5)); t('no avisa de algo de hace más de 6 horas', s5.run('revisarAvisos()') === 0);

  const s6 = crear();
  s6.run('autorizar()'); s6.run('autorizar()');
  t('autorizar crea una sola comprobación automática', s6.disparadores.filter((f) => f === 'revisarAvisos').length === 1);
  t('el panel sabe que los avisos están activos', s6.run("admEstado('ADMINKEY')").avisos.activos === true && s6.run("admEstado('ADMINKEY')").avisos.minutos === 30);
  t('antes de autorizar, el panel avisa de que no están activos', crear().run("admEstado('ADMINKEY')").avisos.activos === false);
}

/* ---------- 11. Fotos privadas de recordatorios ---------- */
{
  const s = crear();
  const JPG = 'data:image/jpeg;base64,' + Buffer.from('foto-del-recordatorio').toString('base64');
  const JPG2 = 'data:image/jpeg;base64,' + Buffer.from('otra-foto-distinta').toString('base64');
  const g = (o, f, q) => s.run(`admRecordatorioGuardar('ADMINKEY', ${J(Object.assign({ hora: '12:00', dias: [], texto: 'Salir a pasear', duracion: 10, confirmar: false }, o))}, ${f ? J(f) : 'null'}, ${!!q})`);
  let e = g({}, JPG);
  const id = e.datos.recordatorios[0].id;
  t('el recordatorio guarda su foto', e.datos.recordatorios[0].tieneFoto === true);
  const nArch = Object.keys(s.archivos).length;
  const f1 = s.run(`fotoParaTV_(${J(id)})`);
  t('la TV recibe la foto del recordatorio', Buffer.from(f1.b64, 'base64').toString() === 'foto-del-recordatorio' && f1.v > 0 && f1.tipo === 'image/jpeg');
  t('la foto va en la TV por ?a=foto con la clave de administrador', JSON.parse(s.run(`doGet({parameter:{k:'ADMINKEY',a:'foto',p:${J(id)}}}).s`)).b64 === f1.b64);
  s.run("admFamiliaAnadir('ADMINKEY','Ana')"); const kf = s.run('leer_()').familia[0].clave;
  t('un enlace de familia no puede pedir esa foto', JSON.parse(s.run(`doGet({parameter:{k:${J(kf)},a:'foto',p:${J(id)}}}).s`)).error === 'permiso');
  t('ni un enlace sin clave', JSON.parse(s.run(`doGet({parameter:{k:'',a:'foto',p:${J(id)}}}).s`)).error === 'clave');
  t('un identificador inventado no sirve para leer archivos', s.run("fotoParaTV_('cualquier-id-de-drive')").error === 'sin foto');
  t('el panel puede ver la miniatura', s.run(`admRecordatorioFoto('ADMINKEY', ${J(id)})`) === JPG);
  e = g({ id }, JPG2);
  t('al cambiar la foto sube la versión y se borra la antigua', Object.keys(s.archivos).filter((x) => !s.archivos[x].papelera).length === nArch && Object.keys(s.archivos).some((x) => s.archivos[x].papelera));
  t('la foto nueva es la que sale', Buffer.from(s.run(`fotoParaTV_(${J(id)})`).b64, 'base64').toString() === 'otra-foto-distinta');
  e = g({ id }, null, true);
  t('se puede quitar la foto', e.datos.recordatorios[0].tieneFoto === false && s.run(`fotoParaTV_(${J(id)})`).error === 'sin foto');
  t('una foto que no es JPEG se rechaza', falla(() => g({ id }, 'data:text/html;base64,AAAA')));
  t('una foto demasiado grande se rechaza', falla(() => g({ id }, 'data:image/jpeg;base64,' + 'A'.repeat(450001))));
  g({ id }, JPG); s.run(`admRecordatorioBorrar('ADMINKEY', ${J(id)})`);
  t('borrar el recordatorio borra su foto', Object.keys(s.archivos).filter((x) => /foto/.test(s.archivos[x].nombre || '') && !s.archivos[x].papelera).length === 0 && s.run('leer_()').recordatorios.length === 0);
  const codigo = require('fs').readFileSync(require('path').join(__dirname, '..', 'Code.gs'), 'utf8');
  t('el código no comparte nada con enlace público', !/setSharing|Access\.ANYONE|addViewer|setPermission/.test(codigo));
  for (let i = 0; i < 20; i++) g({ texto: 'R' + i });
  t('hay un máximo de 20 recordatorios', falla(() => g({ texto: 'uno más' })));
}

/* ---------- 12. Vista previa de la TV para quien tenga un enlace ---------- */
{
  const s = crear();
  s.run("admEnviar('ADMINKEY','Dani','Hoy comemos juntos.','hoy')");
  s.run("admFamiliaAnadir('ADMINKEY','Ana')"); const kf = s.run('leer_()').familia[0].clave;
  const antes = s.run('tvUltima_()');
  const v = s.run(`admVistaPrevia(${J(kf)})`);
  t('un familiar puede previsualizar la pantalla', v.vista.mensajes[0].texto === 'Hoy comemos juntos.' && Array.isArray(v.vista.bloques) && v.vista.estiloDia === 'lavanda' && v.prueba === null);
  t('el administrador también', s.run("admVistaPrevia('ADMINKEY')").vista.mensajes.length === 1);
  t('sin clave o con una clave inventada no', falla(() => s.run("admVistaPrevia('')")) && falla(() => s.run("admVistaPrevia('inventada')")));
  t('mirar no cuenta como "TV conectada"', s.run('tvUltima_()') === antes);
  t('y no cambia nada', s.run('leer_()').mensajes.length === 1);
  s.run("admProbarEstilo('ADMINKEY','salvia','noche')");
  const p = s.run(`admVistaPrevia(${J(kf)})`).prueba;
  t('si se está probando un estilo, la vista previa lo sabe', p && p.estilo === 'salvia' && p.modo === 'noche');
  t('un familiar sigue sin poder cambiar ajustes', falla(() => s.run(`admAjustes(${J(kf)}, {estiloDia: 'salvia'})`)));
}

console.log(bien + ' bien, ' + mal + ' fallos');
process.exit(mal ? 1 : 0);
