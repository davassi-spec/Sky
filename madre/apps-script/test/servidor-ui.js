// Banco de pruebas visual: sirve Admin.html con el Code.gs REAL detrás (simulado). Uso:  node test/servidor-ui.js [puerto]
const http = require('http'), fs = require('fs'), path = require('path');
const { crear } = require('./simulador');

const AHORA = new Date(2026, 9, 20, 17, 15).getTime();           // martes 20 de octubre de 2026, 17:15
const FOTO = fs.existsSync(path.join(__dirname, 'foto.b64')) ? fs.readFileSync(path.join(__dirname, 'foto.b64'), 'utf8').trim() : null;

function sembrar() {
  const ev = (titulo, ini, fin) => ({ isAllDayEvent: () => false, getTitle: () => titulo, getStartTime: () => new Date(AHORA + ini * 60000), getEndTime: () => new Date(AHORA + fin * 60000) });
  const s = crear({ ahora: AHORA, eventos: [ev('Merienda con Ana', 75, 135), ev('Cena', 165, 225)] });
  s.run("admFamiliaAnadir('ADMINKEY','Ana')"); s.run("admFamiliaAnadir('ADMINKEY','Javier')");
  const [ana, javier] = s.run('leer_()').familia;
  if (FOTO) s.run(`admFoto('${ana.clave}', null, ${JSON.stringify(FOTO)})`);
  s.run("admEnviar('ADMINKEY','Daniel','Hoy viene Ana a las seis.','hoy')");
  s.run(`admEnviar('${ana.clave}','','Llevaré la merienda. Te quiero, mamá.','hoy')`);
  s.run(`modificar_(function (d) {
    var ayer = Math.floor(Date.now() / 1000) - 86400 - 3600;
    d.mensajes.push({ id: 'c1', de: 'Javier', autor: '${javier.id}', texto: 'Mañana te llamo por teléfono.', t: ayer, hasta: ayer + 3000 });
    d.mensajes.push({ id: 'c2', de: 'Daniel', autor: 'admin', texto: 'Buenas noches, mamá. Hasta mañana.', t: ayer - 7200, hasta: ayer - 3000 });
    d.nocheTexto = 'Es hora de dormir.'; d.contacto = { nombre: 'Daniel', telefono: '600 000 000' };
  })`);
  const dia = (n) => { const d = new Date(AHORA + n * 86400000); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  s.run(`admGuardarCuentaAtras('ADMINKEY',{texto:'Todos los Santos',fecha:'${dia(12)}',icono:'calendario',desdeDias:30})`);
  s.run(`admGuardarCuentaAtras('ADMINKEY',{texto:'el cumpleaños de Pep',fecha:'${dia(45)}',icono:'tarta',desdeDias:30})`);
  s.run("doGet({parameter:{k:'ADMINKEY'}})");                      // la TV acaba de conectarse
  return { s, ana, javier };
}
let mundo = sembrar();

function pagina(q) {
  let html = fs.readFileSync(path.join(__dirname, '..', 'Admin.html'), 'utf8');
  const familiar = q.rol === 'familia';
  const clave = familiar ? mundo[q.quien === 'Javier' ? 'javier' : 'ana'].clave : 'ADMINKEY';
  html = html.replace('<?!= JSON.stringify(clave) ?>', JSON.stringify(clave))
    .replace('<?!= JSON.stringify(rol) ?>', JSON.stringify(familiar ? 'familia' : 'admin'))
    .replace('<?!= JSON.stringify(enlaceBase) ?>', JSON.stringify('https://script.google.com/macros/s/EXEC/exec'));
  const mock = `<script>
    (function(){
      var FIX=${AHORA}, D=Date, t0=D.now();
      window.Date=class extends D{constructor(...a){ if(a.length===0) super(FIX+(D.now()-t0)); else super(...a);} static now(){return FIX+(D.now()-t0);}};
      function mk(ok,ko){return new Proxy({},{get:function(_,fn){
        if(fn==='withSuccessHandler') return function(f){return mk(f,ko);};
        if(fn==='withFailureHandler') return function(f){return mk(ok,f);};
        return function(){ var args=Array.prototype.slice.call(arguments);
          fetch('/rpc',{method:'POST',body:JSON.stringify({fn:fn,args:args})}).then(function(r){return r.json();}).then(function(j){ if(j.error){ ko&&ko(new Error(j.error)); } else { ok&&ok(j.valor); } });
        };}});}
      window.google={script:{run:mk(function(){},function(){})}};
    })();
  </script>`;
  const driver = q.js ? `<script>
    (function esperar(n){ if(typeof S!=='undefined' && S){ try{ ${q.js} }catch(e){ document.title='ERROR '+e; } document.title=(document.title||'')+' listo'; } else if(n>0) setTimeout(function(){esperar(n-1);},100); })(80);
  </script>` : '';
  const tema = q.tema ? `<script>try{localStorage.setItem('tema','${q.tema}')}catch(e){}</script>` : '';
  return html.replace('<script>', tema + mock + '<script>').replace('</body>', driver + '</body>');
}

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x'); const q = Object.fromEntries(url.searchParams);
  if (url.pathname === '/admin') { res.setHeader('Content-Type', 'text/html; charset=utf-8'); return res.end(pagina(q)); }
  if (url.pathname === '/marco') {                                  // iframe del ancho de un móvil (Chromium sin cabeza no baja de 500 px)
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.end(`<body style="margin:0;background:#777"><iframe src="${q.u.replace(/"/g, '&quot;')}" style="width:${q.w}px;height:${q.h}px;border:0;display:block"></iframe></body>`);
  }
  if (url.pathname === '/reiniciar') { mundo = sembrar(); return res.end('ok'); }
  if (url.pathname === '/rpc') {
    let cuerpo = ''; req.on('data', (c) => (cuerpo += c)); req.on('end', () => {
      const { fn, args } = JSON.parse(cuerpo); res.setHeader('Content-Type', 'application/json');
      try { res.end(JSON.stringify({ valor: mundo.s.run(`${fn}.apply(null, ${JSON.stringify(args)})`) })); }
      catch (e) { res.end(JSON.stringify({ error: String(e.message || e) })); }
    }); return;
  }
  res.statusCode = 404; res.end('no');
}).listen(Number(process.argv[2]) || 8765, '127.0.0.1', () => console.log('listo'));
