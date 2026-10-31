#!/usr/bin/env python3
"""Genera madre/web-app/index.html (la app del móvil, para publicar en GitHub Pages) a partir de apps-script/Admin.html.

Es el mismo panel que se ve dentro de Google, pero en su propia página: así el micrófono y la cámara funcionan en
Safari (iPhone) y Chrome (Samsung), y se puede poner un icono en la pantalla de inicio.
La clave y la dirección del script viajan en el enlace de cada persona, detrás del # (nunca salen del móvil), y no están en este repositorio.

Uso:  python3 madre/web-app/construir.py        (se vuelve a ejecutar cada vez que cambie Admin.html)
"""
import os, re, sys

AQUI = os.path.dirname(os.path.abspath(__file__))
ORIGEN = os.path.join(AQUI, '..', 'apps-script', 'Admin.html')
DESTINO = os.path.join(AQUI, 'index.html')

CABECERA = '''<meta name="robots" content="noindex,nofollow">
<meta name="referrer" content="no-referrer">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="La tele de mamá">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<link rel="apple-touch-icon" href="iconos/apple-touch-icon.png">
<link rel="icon" type="image/png" sizes="32x32" href="iconos/favicon-32.png">
<link rel="icon" type="image/png" sizes="192x192" href="iconos/icono-192.png">
<link rel="icon" type="image/png" sizes="512x512" href="iconos/icono-512.png">
<link rel="manifest" id="manifiesto">
'''

ARRANQUE = r'''<script>
/* La app fuera de Google: la clave y la dirección del script vienen en el enlace, tras el # ("#u=IDENTIFICADOR&k=CLAVE").
   No se envían a ningún servidor: el navegador no manda nunca lo que va tras el #. Se guardan en este móvil por si
   la pantalla de inicio abre la app sin el enlace. */
(function () {
  var p = {};
  location.hash.replace(/^#/, '').split('&').forEach(function (x) { var i = x.indexOf('='); if (i > 0) p[x.slice(0, i)] = decodeURIComponent(x.slice(i + 1)); });
  var u = p.u || '', k = p.k || '';
  try {
    if (u && k) { localStorage.setItem('pizarra_u', u); localStorage.setItem('pizarra_k', k); }
    else { u = localStorage.getItem('pizarra_u') || ''; k = localStorage.getItem('pizarra_k') || ''; }
  } catch (e) {}
  var envoltorio = location.origin + location.pathname;
  window.PIZARRA = { u: u, k: k, envoltorio: envoltorio };
  var EXEC = 'https://script.google.com/macros/s/' + u + '/exec';
  /* El mismo google.script.run que hay dentro de Google, pero por POST al script (la clave va en el cuerpo, no en la dirección). */
  function remoto(fn, args) {
    var ctl = typeof AbortController === 'function' ? new AbortController() : null, plazo = setTimeout(function () { if (ctl) ctl.abort(); }, 150000);
    return fetch(EXEC + '?a=rpc', { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ fn: fn, args: args }), signal: ctl ? ctl.signal : undefined, redirect: 'follow' })
      .then(function (r) { return r.json(); }, function () { throw new Error('No hay conexión con el servidor. Comprueba que el móvil tiene internet.'); })
      .then(function (j) { clearTimeout(plazo); if (j.error) throw new Error(j.error); return j.valor; }, function (e) { clearTimeout(plazo); throw e; });
  }
  function mk(ok, ko) {
    return new Proxy({}, { get: function (_, fn) {
      if (fn === 'withSuccessHandler') return function (f) { return mk(f, ko); };
      if (fn === 'withFailureHandler') return function (f) { return mk(ok, f); };
      return function () { remoto(fn, Array.prototype.slice.call(arguments)).then(function (v) { if (ok) ok(v); }, function (e) { if (ko) ko(e); }); };
    } });
  }
  window.google = { script: { run: mk(null, null) } };
  /* Iconos y manifiesto. Los familiares tienen su propio icono (iconos-familia/); el administrador, el suyo (iconos/).
     Se ponen según quién entra, en cuanto el panel lo sabe: el iPhone y Android lo leen al añadir la app a la pantalla de inicio. */
  function ponerIconos(carpeta) {
    try {
      var abs = function (f) { return new URL(carpeta + '/' + f, location.href).href; };
      var enlace = function (sel, f) { var e = document.querySelector(sel); if (e) e.href = abs(f); };
      enlace('link[rel=apple-touch-icon]', 'apple-touch-icon.png');
      enlace('link[rel=icon][sizes="32x32"]', 'favicon-32.png');
      enlace('link[rel=icon][sizes="192x192"]', 'icono-192.png');
      enlace('link[rel=icon][sizes="512x512"]', 'icono-512.png');
      /* Manifiesto con el enlace completo como dirección de inicio: así el icono de Android (Chrome) abre ya con su clave. A pantalla completa. */
      var m = { name: 'La tele de mamá', short_name: 'La tele de mamá', start_url: location.href, scope: envoltorio, display: 'fullscreen',
        display_override: ['fullscreen', 'standalone'], orientation: 'portrait', background_color: '#F2F2F7', theme_color: '#F2F2F7',
        icons: [{ src: abs('icono-192.png'), sizes: '192x192', type: 'image/png' },
          { src: abs('icono-512.png'), sizes: '512x512', type: 'image/png' },
          { src: abs('icono-maskable-512.png'), sizes: '512x512', type: 'image/png', purpose: 'maskable' }] };
      document.getElementById('manifiesto').href = URL.createObjectURL(new Blob([JSON.stringify(m)], { type: 'application/manifest+json' }));
    } catch (e) {}
  }
  ponerIconos('iconos');
  window.PIZARRA.iconosPara = function (rol) {
    if (rol !== 'familia') { ponerIconos('iconos'); return; }
    var prueba = new Image();                       // si falta la carpeta de familiares, se queda el icono de siempre
    prueba.onload = function () { ponerIconos('iconos-familia'); };
    prueba.src = new URL('iconos-familia/apple-touch-icon.png', location.href).href;
  };
})();
</script>
'''

def construir():
    h = open(ORIGEN, encoding='utf-8').read()
    cambios = [
        ("var K = <?!= JSON.stringify(clave) ?>;", "var K = window.PIZARRA.k;"),
        ("var ROL = <?!= JSON.stringify(rol) ?>;", "var ROL = null;                          // se sabe al cargar el estado"),
        ("var BASE = <?!= JSON.stringify(enlaceBase) ?>;", "var BASE = 'https://script.google.com/macros/s/' + window.PIZARRA.u + '/exec';"),
    ]
    for a, b in cambios:
        if a not in h:
            sys.exit('No encuentro en Admin.html: ' + a)
        h = h.replace(a, b, 1)
    if '<?' in h:
        sys.exit('Quedan etiquetas de Apps Script sin sustituir en Admin.html')
    h = h.replace('<title>', CABECERA + '<title>', 1)
    i = h.index('<script>')
    h = h[:i] + ARRANQUE + h[i:]
    return h

if __name__ == '__main__':
    salida = construir()
    if '--comprobar' in sys.argv:
        actual = open(DESTINO, encoding='utf-8').read() if os.path.exists(DESTINO) else ''
        if actual != salida:
            sys.exit('web-app/index.html no está al día: ejecuta python3 madre/web-app/construir.py')
        print('index.html al día')
    else:
        open(DESTINO, 'w', encoding='utf-8').write(salida)
        print('escrito', DESTINO, len(salida), 'bytes')
