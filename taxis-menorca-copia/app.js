/* Taxis Menorca — copia local. Sin dependencias de build.
 * Persistencia: localStorage (prefijo "tmcopia:"). Nada se envía a la app original. */
(function () {
  "use strict";
  var CFG = window.TM_CONFIG, PLACES = window.TM_PLACES;
  var app = document.getElementById("app");

  /* ---------- almacenamiento ---------- */
  var mem = {};
  function load(k, d) {
    try { var v = localStorage.getItem("tmcopia:" + k); return v == null ? d : JSON.parse(v); }
    catch (e) { return k in mem ? mem[k] : d; }
  }
  function save(k, v) {
    mem[k] = v;
    try { localStorage.setItem("tmcopia:" + k, JSON.stringify(v)); } catch (e) {}
  }

  /* ---------- iconos ---------- */
  var I = {
    dots: '<svg viewBox="0 0 10 28"><circle cx="5" cy="4" r="2.6"/><circle cx="5" cy="14" r="2.6"/><circle cx="5" cy="24" r="2.6"/></svg>',
    back: '<svg viewBox="0 0 24 24"><path d="M15 4 7 12l8 8"/></svg>',
    close: '<svg viewBox="0 0 24 24"><path d="M5 5l14 14M19 5 5 19"/></svg>',
    hamb: '<svg viewBox="0 0 24 24"><path d="M3 6h18M3 12h18M3 18h18"/></svg>',
    eye: '<svg viewBox="0 0 24 24"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>',
    eyeOff: '<svg viewBox="0 0 24 24"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/><path d="M3 3l18 18" stroke-width="2.6"/></svg>',
    refresh: '<svg viewBox="0 0 24 24"><path d="M20 11a8 8 0 0 0-14-4M4 4v4h4M4 13a8 8 0 0 0 14 4M20 20v-4h-4"/></svg>',
    search: '<svg viewBox="0 0 24 24"><circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5 21 21"/></svg>',
    map: '<svg viewBox="0 0 24 24"><path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2zM9 4v14M15 6v14"/></svg>',
    check: '<svg viewBox="0 0 24 24"><path d="M4 12.5 9.5 18 20 6"/></svg>',
    pin: '<svg viewBox="0 0 26 36"><path d="M13 1C6.4 1 1.5 6 1.5 12.4 1.5 21 13 35 13 35s11.5-14 11.5-22.6C24.5 6 19.6 1 13 1z" fill="#e0291f" stroke="#a31a12" stroke-width="1.5"/><circle cx="13" cy="12.5" r="4.3" fill="#7a0d08"/></svg>'
  };
  function ico(name) { return I[name]; }

  /* ---------- utilidades DOM ---------- */
  function h(tag, attrs) {
    var el = document.createElement(tag);
    attrs = attrs || {};
    for (var k in attrs) {
      var v = attrs[k];
      if (v == null || v === false) continue;
      if (k === "class") el.className = v;
      else if (k === "html") el.innerHTML = v;
      else if (k.slice(0, 2) === "on") el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? "" : v);
    }
    (function add(list) {
      list.forEach(function (c) {
        if (c == null || c === false) return;
        if (Array.isArray(c)) return add(c);
        el.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
      });
    })(Array.prototype.slice.call(arguments, 2));
    return el;
  }
  function toast(msg) {
    var t = h("div", { class: "toast", role: "status" }, msg);
    document.body.appendChild(t);
    setTimeout(function () { t.remove(); }, 2600);
  }
  function confirmDlg(title, text, okLabel, noLabel, danger) {
    return new Promise(function (res) {
      var f = h("div", { class: "dlg-fondo", role: "dialog", "aria-modal": "true" },
        h("div", { class: "dlg" },
          h("h2", {}, title), h("p", {}, text),
          h("div", { class: "bt" },
            h("button", { "data-no": "1", onclick: function () { f.remove(); res(false); } }, noLabel || "No"),
            h("button", { "data-si": "1", class: danger ? "pel" : "", onclick: function () { f.remove(); res(true); } }, okLabel || "Sí"))));
      document.body.appendChild(f);
    });
  }
  function nf(n, d) { return n.toLocaleString("es-ES", { minimumFractionDigits: d, maximumFractionDigits: d }); }
  function norm(s) { return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, ""); }
  function uuid() {
    return (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : "id-" + Date.now() + "-" + Math.random().toString(16).slice(2);
  }

  /* ---------- autenticación local (PBKDF2) ---------- */
  function b64(buf) { return btoa(String.fromCharCode.apply(null, new Uint8Array(buf))); }
  function unb64(s) { return Uint8Array.from(atob(s), function (c) { return c.charCodeAt(0); }); }
  async function hashPw(pw, saltB64) {
    var salt = saltB64 ? unb64(saltB64) : crypto.getRandomValues(new Uint8Array(16));
    var key = await crypto.subtle.importKey("raw", new TextEncoder().encode(pw), "PBKDF2", false, ["deriveBits"]);
    var bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt: salt, iterations: 100000, hash: "SHA-256" }, key, 256);
    return { salt: b64(salt), hash: b64(bits) };
  }
  function users() { return load("users", []); }
  function findUser(email) { email = email.trim().toLowerCase(); return users().find(function (u) { return u.email === email; }); }
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  /* ---------- estado ---------- */
  var S = {
    email: load("session", null),
    view: "home",
    draft: load("draft", { origin: null, dest: null, vehicle: "4plazas" }),
    maps: []
  };
  function saveDraft() { save("draft", S.draft); }
  function me() { return S.email ? findUser(S.email) : null; }
  function bookings() { return load("bookings", []).filter(function (b) { return b.email === S.email; }); }
  function activeBooking() { return bookings().filter(function (b) { return b.status === "solicitado"; })[0] || null; }
  function putBooking(b) {
    var all = load("bookings", []), i = all.findIndex(function (x) { return x.id === b.id; });
    if (i >= 0) all[i] = b; else all.push(b);
    save("bookings", all);
  }

  /* ---------- geografía ---------- */
  function haversine(a, b) {
    var R = 6371, rad = Math.PI / 180, dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
    var x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(x));
  }
  function price(km) { return CFG.tarifa.bajada + CFG.tarifa.porKm * km; }
  function fetchJSON(url, ms) {
    var ctl = new AbortController(), t = setTimeout(function () { ctl.abort(); }, ms || 8000);
    return fetch(url, { signal: ctl.signal, headers: { Accept: "application/json" } })
      .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
      .finally(function () { clearTimeout(t); });
  }
  async function getRoute(a, b) {
    try {
      var d = await fetchJSON(CFG.rutaApi + "?from=" + a.lng + "," + a.lat + "&to=" + b.lng + "," + b.lat);
      var r = d.routes && d.routes[0];
      if (!r) throw new Error("sin ruta");
      return { km: r.distance / 1000, coords: r.geometry.coordinates.map(function (c) { return [c[1], c[0]]; }), exact: true };
    } catch (e) {
      return { km: haversine(a, b) * 1.25, coords: [[a.lat, a.lng], [b.lat, b.lng]], exact: false };
    }
  }
  async function reverse(lat, lng) {
    try {
      var d = await fetchJSON(CFG.nominatim + "/reverse?format=jsonv2&accept-language=es&zoom=18&lat=" + lat + "&lon=" + lng, 6000);
      if (d && d.display_name) return d.display_name;
    } catch (e) {}
    return "Punto en el mapa (" + lat.toFixed(5) + ", " + lng.toFixed(5) + ")";
  }
  async function searchRemote(q) {
    var v = CFG.viewbox, url = CFG.nominatim + "/search?format=jsonv2&accept-language=es&limit=6&countrycodes=es&bounded=1&viewbox=" +
      [v[0], v[3], v[2], v[1]].join(",") + "&q=" + encodeURIComponent(q);
    var d = await fetchJSON(url, 6000);
    return d.map(function (r) { return { label: r.display_name, lat: +r.lat, lng: +r.lon, remote: true }; });
  }
  function localSearch(q) {
    var toks = norm(q).split(/\s+/).filter(Boolean);
    if (!toks.length) return PLACES.slice(0, 8);
    return PLACES.filter(function (p) { var n = norm(p.label); return toks.every(function (t) { return n.indexOf(t) >= 0; }); });
  }

  /* ---------- mapas ---------- */
  function killMaps() { S.maps.forEach(function (m) { try { m.stop(); m.off(); m.remove(); } catch (e) {} }); S.maps = []; }
  function newMap(el, center, zoom) {
    var m = L.map(el, { zoomControl: false, attributionControl: true }).setView(center || CFG.centro, zoom || 10);
    L.tileLayer(CFG.tiles, { maxZoom: 19, attribution: "&copy; OpenStreetMap" }).addTo(m);
    S.maps.push(m);
    return m;
  }
  function pinIcon() { return L.divIcon({ className: "", html: '<div class="pin">' + I.pin + "</div>", iconSize: [26, 36], iconAnchor: [13, 35] }); }
  function drawRoute(m, o, d, coords) {
    L.marker([o.lat, o.lng], { icon: pinIcon() }).addTo(m);
    L.marker([d.lat, d.lng], { icon: pinIcon() }).addTo(m);
    var line = L.polyline(coords, { color: "#0030d8", weight: 6, opacity: .9, dashArray: coords.length === 2 ? "8 8" : null }).addTo(m);
    m.fitBounds(line.getBounds().pad(.2), { animate: false });
  }

  /* ---------- estructura común ---------- */
  function header(opts) {
    var left = opts.back ? h("button", { class: "ib", "aria-label": "Volver", "data-act": "back", onclick: opts.back, html: ico(opts.close ? "close" : "back") })
      : h("img", { class: "logo", src: "assets/logo.png", alt: "Taxis Menorca" });
    var right = opts.menu ? h("button", { class: "ib hamb", "aria-label": "Menú", "data-act": "menu", onclick: openDrawer, html: ico("hamb") }) : h("span");
    return h("header", { class: "cab" }, left, h("h1", {}, opts.title || "TAXIS MENORCA"), right);
  }
  function screen(head, body, noDev) {
    killMaps();
    app.replaceChildren(head);
    if (Array.isArray(body)) body.forEach(function (b) { app.appendChild(b); }); else app.appendChild(body);
    if (!noDev) {
      var cont = app.querySelector(".cont, .scroll-fondo");
      if (cont) cont.appendChild(h("div", { class: "dev", "data-test": "dev" }, "- COPIA LOCAL -"));
    }
  }
  function go(view, extra) { S.view = view; if (extra) Object.assign(S, extra); render(); window.scrollTo(0, 0); }

  function openDrawer() {
    var f = h("div", { class: "drawer-fondo", onclick: close }), u = me();
    var d = h("nav", { class: "drawer", "aria-label": "Menú" },
      h("div", { class: "quien" }, h("b", {}, u ? u.name : ""), u ? u.email : ""),
      h("button", { "data-nav": "home", onclick: function () { close(); go("home"); } }, "Inicio"),
      h("button", { "data-nav": "reservas", onclick: function () { close(); go("reservas"); } }, "Mis reservas"),
      h("button", { "data-nav": "perfil", onclick: function () { close(); go("perfil"); } }, "Mi perfil"),
      h("button", { "data-nav": "salir", onclick: async function () {
        close();
        if (await confirmDlg("Cerrar sesión", "¿Desea cerrar la sesión?", "Cerrar sesión", "Cancelar")) logout();
      } }, "Cerrar sesión"));
    function close() { f.remove(); d.remove(); }
    document.body.append(f, d);
  }
  function logout() { S.email = null; save("session", null); S.view = "login"; render(); }

  /* ---------- vistas ---------- */
  function passField(id, label, autocomplete) {
    var inp = h("input", { class: "campo", id: id, type: "password", autocomplete: autocomplete || "current-password" });
    var eye = h("button", { class: "ojo", type: "button", "aria-label": "Mostrar contraseña", html: ico("eyeOff"), onclick: function () {
      var show = inp.type === "password"; inp.type = show ? "text" : "password"; eye.innerHTML = ico(show ? "eye" : "eyeOff");
    } });
    return h("div", { class: "fila" }, h("label", { class: "lbl", for: id }, label), inp, eye);
  }

  function viewLogin() {
    var err = h("div", { class: "msg-error", id: "err", role: "alert" });
    var email = h("input", { class: "campo", id: "email", type: "email", autocomplete: "username", inputmode: "email" });
    var btn = h("button", { class: "btn", type: "submit", id: "continuar" }, "CONTINUAR");
    var pw = passField("pass", "Contraseña");
    var form = h("form", { class: "login", novalidate: true, onsubmit: async function (e) {
      e.preventDefault(); err.textContent = "";
      var p = pw.querySelector("input").value;
      if (!email.value.trim() || !p) { err.textContent = "Introduzca su correo electrónico y su contraseña."; return; }
      if (!EMAIL_RE.test(email.value.trim())) { err.textContent = "Introduzca un correo electrónico válido."; return; }
      btn.disabled = true;
      var u = findUser(email.value);
      var ok = false;
      if (u) { var r = await hashPw(p, u.salt); ok = r.hash === u.hash; }
      btn.disabled = false;
      if (!ok) { err.textContent = "Correo electrónico o contraseña incorrectos."; return; }
      S.email = u.email; save("session", S.email); go("home");
    } },
      h("h2", { class: "titulo" }, "INICIAR SESIÓN"),
      h("div", { class: "fila" }, h("label", { class: "lbl", for: "email" }, "Correo electrónico"), email),
      pw, err,
      h("button", { class: "link", type: "button", id: "olvido", onclick: function () { go("olvido"); } }, "¿Ha olvidado su contraseña?"),
      btn);
    var alta = h("div", { class: "alta" }, h("button", { class: "btn gris", type: "button", id: "alta", onclick: function () { go("registro"); } }, "¿Quiere darse de alta como cliente?"));
    screen(header({}), h("main", { class: "cont login-pant" }, form, alta));
  }

  function viewRegistro() {
    var err = h("div", { class: "msg-error", id: "err", role: "alert" });
    var name = h("input", { class: "campo", id: "nombre", autocomplete: "name" });
    var phone = h("input", { class: "campo", id: "tel", type: "tel", autocomplete: "tel" });
    var email = h("input", { class: "campo", id: "email", type: "email", autocomplete: "email" });
    var p1 = passField("p1", "Contraseña (mínimo 6 caracteres)", "new-password");
    var p2 = passField("p2", "Repita la contraseña", "new-password");
    var form = h("form", { class: "login", style: "margin-top:20px", novalidate: true, onsubmit: async function (e) {
      e.preventDefault(); err.textContent = "";
      var a = p1.querySelector("input").value, b = p2.querySelector("input").value;
      if (!name.value.trim() || !email.value.trim() || !a) { err.textContent = "Complete los campos obligatorios."; return; }
      if (!EMAIL_RE.test(email.value.trim())) { err.textContent = "Introduzca un correo electrónico válido."; return; }
      if (a.length < 6) { err.textContent = "La contraseña debe tener al menos 6 caracteres."; return; }
      if (a !== b) { err.textContent = "Las contraseñas no coinciden."; return; }
      if (findUser(email.value)) { err.textContent = "Ya existe una cuenta con ese correo electrónico."; return; }
      var r = await hashPw(a), list = users();
      list.push({ email: email.value.trim().toLowerCase(), name: name.value.trim(), phone: phone.value.trim(), salt: r.salt, hash: r.hash });
      save("users", list);
      S.email = email.value.trim().toLowerCase(); save("session", S.email);
      toast("Cuenta creada"); go("home");
    } },
      h("h2", { class: "titulo" }, "ALTA DE CLIENTE"),
      h("div", { class: "fila" }, h("label", { class: "lbl", for: "nombre" }, "Nombre y apellidos"), name),
      h("div", { class: "fila" }, h("label", { class: "lbl", for: "tel" }, "Teléfono"), phone),
      h("div", { class: "fila" }, h("label", { class: "lbl", for: "email" }, "Correo electrónico"), email),
      p1, p2, err,
      h("button", { class: "btn", type: "submit", id: "crear" }, "CREAR CUENTA"),
      h("button", { class: "link", type: "button", style: "margin-top:12px;margin-bottom:0", onclick: function () { go("login"); } }, "Ya tengo cuenta"),
      h("div", { class: "aviso-local" }, "Copia local: la cuenta se guarda solo en este navegador (no existe servidor de clientes)."));
    screen(header({ back: function () { go("login"); } }), h("main", { class: "cont", style: "padding:0 12px" }, form));
  }

  function viewOlvido() {
    var err = h("div", { class: "msg-error", id: "err", role: "alert" });
    var email = h("input", { class: "campo", id: "email", type: "email" });
    var p1 = passField("p1", "Nueva contraseña", "new-password");
    var form = h("form", { class: "login", style: "margin-top:30px", novalidate: true, onsubmit: async function (e) {
      e.preventDefault(); err.textContent = "";
      var u = findUser(email.value), a = p1.querySelector("input").value;
      if (!u) { err.textContent = "No existe ninguna cuenta con ese correo electrónico."; return; }
      if (a.length < 6) { err.textContent = "La contraseña debe tener al menos 6 caracteres."; return; }
      var r = await hashPw(a), list = users();
      list.forEach(function (x) { if (x.email === u.email) { x.salt = r.salt; x.hash = r.hash; } });
      save("users", list); toast("Contraseña restablecida"); go("login");
    } },
      h("h2", { class: "titulo" }, "RECUPERAR CONTRASEÑA"),
      h("div", { class: "aviso-local", style: "margin:0 0 16px" }, "Copia local: no hay servidor de correo, así que la contraseña se restablece directamente aquí."),
      h("div", { class: "fila" }, h("label", { class: "lbl", for: "email" }, "Correo electrónico"), email),
      p1, err, h("button", { class: "btn", type: "submit", id: "restablecer" }, "RESTABLECER"));
    screen(header({ back: function () { go("login"); } }), h("main", { class: "cont", style: "padding:0 12px" }, form));
  }

  function ubiField(kind, place, opts) {
    var empty = !place;
    var txt = h("div", { class: "txt" + (empty ? " vacio" : ""), "data-field": kind }, place ? place.label : (opts.placeholder || ""));
    var main = h(opts.readonly ? "div" : "button", { class: "ubi " + (kind === "dest" ? "dest " : "") + (opts.readonly ? "est" : ""), type: opts.readonly ? null : "button",
      "aria-label": kind === "dest" ? "Destino" : "Ubicación", onclick: opts.onclick },
      h("div", { class: "ico", html: ico("dots") }), txt);
    if (opts.side) main.appendChild(h("span", { class: "lado", role: "button", tabindex: "0", "aria-label": "Usar mi ubicación actual", "data-act": "relocate",
      html: ico("refresh"), onclick: function (e) { e.stopPropagation(); opts.side(); } }));
    return main;
  }

  function tabs(active, off) {
    var defs = [["4plazas", "4 plazas"], ["especial", "Especial"], ["reservas", "Reservas"]];
    return h("div", { class: "tabs" + (off ? " off" : ""), role: "tablist" }, defs.map(function (d) {
      return h("button", { role: "tab", class: active === d[0] ? "act" : "", "data-tab": d[0], "aria-selected": active === d[0] ? "true" : "false", onclick: function () {
        if (d[0] === "reservas") { go("reservas"); return; }
        if (off) return;
        S.draft.vehicle = d[0]; saveDraft(); render();
      } }, d[1]);
    }));
  }

  async function relocate() {
    if (!navigator.geolocation) { toast("Su dispositivo no permite obtener la ubicación."); return; }
    toast("Obteniendo su ubicación…");
    navigator.geolocation.getCurrentPosition(async function (pos) {
      var lat = pos.coords.latitude, lng = pos.coords.longitude;
      S.draft.origin = { label: await reverse(lat, lng), lat: lat, lng: lng }; saveDraft();
      if (S.view === "home") render();
    }, function () { toast("No se pudo obtener su ubicación. Pulse el campo para escribir una dirección."); }, { enableHighAccuracy: true, timeout: 10000 });
  }

  function viewHome() {
    var b = activeBooking(), d = S.draft;
    var card;
    if (b) {
      card = [h("section", { class: "tarjeta" }, h("h2", { class: "titulo", style: "margin:2px 0 10px;text-transform:none" }, "TIPO VEHÍCULO"), tabs(b.vehicle, true)),
        h("section", { class: "tarjeta", "data-state": "solicitado" },
        h("h2", { class: "titulo", style: "margin-top:4px;text-transform:none" }, "TAXI SOLICITADO"),
        h("div", { class: "ubi-t" }, "Ubicación"), ubiField("origin", b.origin, { readonly: true }),
        h("div", { class: "ubi-t" }, "Destino"), ubiField("dest", b.dest, { readonly: true }),
        h("div", { class: "centro", "data-test": "importe" }, nf(b.km, 0) + " kms aprox.", h("br"), nf(b.price, 2) + " € aprox."),
        h("div", { class: "centro" }, "Se pagará al conductor el importe que indique el taxímetro"),
        h("button", { class: "btn naranja", id: "resumen", onclick: function () { openResumen(b); } }, "RESUMEN"))];
    } else {
      card = [h("section", { class: "tarjeta" }, h("h2", { class: "titulo", style: "margin:2px 0 10px;text-transform:none" }, "TIPO VEHÍCULO"), tabs(d.vehicle, false)),
        h("section", { class: "tarjeta", "data-state": "libre" },
        h("h2", { class: "titulo", style: "margin-top:4px;text-transform:none" }, "INDIQUE EL DESTINO"),
        h("div", { class: "ubi-t" }, "Ubicación"),
        ubiField("origin", d.origin, { placeholder: "Pulse ↻ para usar su ubicación o toque para escribirla", onclick: function () { go("buscar", { mode: "origin" }); }, side: relocate }),
        h("div", { class: "ubi-t" }, "Destino"),
        ubiField("dest", d.dest, { onclick: function () {
          if (!d.origin) { toast("Indique primero su ubicación."); return; }
          go("buscar", { mode: "dest" });
        } }))];
    }
    screen(header({ menu: true }), h("main", { class: "cont" }, card));
    if (!b && !d.origin && !S.triedGeo) { S.triedGeo = true; relocate(); }
  }

  function openResumen(b) {
    var f = h("div", { class: "modal-fondo", role: "dialog", "aria-modal": "true", "aria-label": "Taxi solicitado" });
    var mapBox = h("div", { class: "map" });
    var close = function () { killMaps(); f.remove(); };
    var m = h("div", { class: "modal" }, h("div", { class: "caja" },
      h("div", { class: "cab-m" }, "Taxi solicitado"),
      h("div", { class: "cuerpo", "data-test": "importe" }, nf(b.km, 0) + " km. aprox.", h("br"), nf(b.price, 2) + " € aprox.",
        h("div", { style: "margin-top:10px" }, "Se pagará al conductor el importe que indique el taxímetro")),
      h("button", { class: "btn rojo", id: "cancelar", onclick: async function () {
        if (!(await confirmDlg("Cancelar reserva", "¿Seguro que desea cancelar la reserva?", "Sí, cancelar", "No", true))) return;
        b.status = "cancelado"; b.cancelledAt = Date.now(); putBooking(b);
        close(); toast("Reserva cancelada"); render();
      } }, "CANCELAR RESERVA"),
      h("div", { class: "aviso-local" }, "Copia local: la solicitud se guarda solo en este navegador. No se envía a ningún taxista ni a la central."),
      h("div", { class: "minimapa" }, mapBox, h("button", { class: "lupa-m", "aria-label": "Cerrar", onclick: close, html: ico("close") })),
      h("div", { class: "datos" },
        h("div", { class: "ubi-t" }, "Ubicación"), ubiField("origin", b.origin, { readonly: true }),
        h("div", { class: "ubi-t" }, "Destino"), ubiField("dest", b.dest, { readonly: true }))));
    f.appendChild(m);
    f.addEventListener("click", function (e) { if (e.target === f) close(); });
    document.body.appendChild(f);
    var map = newMap(mapBox);
    drawRoute(map, b.origin, b.dest, b.coords);
    setTimeout(function () { if (S.maps.indexOf(map) < 0) return; map.invalidateSize(); map.fitBounds(L.latLngBounds(b.coords).pad(.2), { animate: false }); }, 80);
  }

  function viewBuscar() {
    var mode = S.mode || "dest", list = h("div", { style: "display:flex;flex-direction:column;gap:8px" });
    var input = h("input", { id: "q", type: "search", placeholder: "Buscar…", autocomplete: "off", "aria-label": "Buscar lugar" });
    var seq = 0, timer;
    function pick(p) {
      if (mode === "origin") { S.draft.origin = { label: p.label, lat: p.lat, lng: p.lng }; saveDraft(); go("home"); }
      else { S.draft.dest = { label: p.label, lat: p.lat, lng: p.lng }; saveDraft(); go("ruta"); }
    }
    function paint(items, note) {
      list.replaceChildren();
      if (!items.length) list.appendChild(h("div", { class: "vacio-msg", "data-test": "vacio" }, note || "No se han encontrado destinos. Pruebe con otro texto o use el mapa."));
      items.forEach(function (p) {
        list.appendChild(h("button", { class: "res", type: "button", onclick: function () { pick(p); } }, h("span", { html: ico("dots") }),
          h("span", {}, p.label, p.remote ? h("small", {}, "Resultado de OpenStreetMap") : null)));
      });
    }
    function run() {
      var q = input.value.trim(), my = ++seq, local = localSearch(q);
      paint(local);
      if (q.length >= 3) searchRemote(q).then(function (rem) {
        if (my !== seq) return;
        var seen = {}; local.forEach(function (p) { seen[norm(p.label)] = 1; });
        paint(local.concat(rem.filter(function (p) { return !seen[norm(p.label)]; })));
      }).catch(function () {});
    }
    input.addEventListener("input", function () { clearTimeout(timer); timer = setTimeout(run, 250); });
    var title = mode === "origin" ? "BUSCAR Y SELECCIONAR LA UBICACIÓN" : "BUSCAR Y SELECCIONAR EL DESTINO";
    var card = h("section", { class: "tarjeta sin-pad", style: "padding:14px 12px 14px" },
      h("h2", { class: "titulo", style: "margin:4px 0 12px" }, title),
      h("div", { class: "busq" }, h("span", { class: "lupa", html: ico("search") }), input,
        h("button", { class: "mapa", type: "button", "aria-label": "Elegir en el mapa", id: "enmapa", onclick: function () { go("elegir"); }, html: ico("map") })));
    screen(header({ back: function () { go("home"); } }), h("main", { class: "cont" }, card, h("div", { class: "lista-t" }, "Seleccione un destino de la lista"), list));
    run();
    input.focus();
  }

  function viewElegir() {
    var mode = S.mode || "dest", sel = null, label = h("div", {}, "Toque el mapa para elegir un punto");
    var mapBox = h("div", { class: "map" });
    var ok = h("button", { class: "ok-btn", id: "confirmar-punto", "aria-label": "Confirmar punto", disabled: true, html: ico("check"), onclick: function () {
      if (!sel) return;
      if (mode === "origin") { S.draft.origin = sel; saveDraft(); go("home"); } else { S.draft.dest = sel; saveDraft(); go("ruta"); }
    } });
    screen(header({ back: function () { go("buscar"); }, title: "ELEGIR EN EL MAPA" }),
      h("div", { class: "mapa-pant scroll-fondo" }, mapBox, ok, h("div", { class: "pie-ruta" }, h("span", { html: ico("dots") }), label)), true);
    var map = newMap(mapBox, CFG.centro, 10), mk = null, n = 0;
    map.on("click", async function (e) {
      var my = ++n;
      if (mk) mk.setLatLng(e.latlng); else mk = L.marker(e.latlng, { icon: pinIcon() }).addTo(map);
      label.textContent = "Buscando dirección…"; ok.disabled = true;
      var text = await reverse(e.latlng.lat, e.latlng.lng);
      if (my !== n) return;
      sel = { label: text, lat: e.latlng.lat, lng: e.latlng.lng }; label.textContent = text; ok.disabled = false;
    });
  }

  function viewRuta() {
    var d = S.draft;
    if (!d.origin || !d.dest) { go("home"); return; }
    var mapBox = h("div", { class: "map" }), info = h("div", { "data-test": "ruta-info" }, "Calculando ruta…");
    var aviso = h("div", { class: "aviso-ruta", style: "display:none" });
    var ok = h("button", { class: "ok-btn", id: "confirmar", "aria-label": "Confirmar ruta", disabled: true, html: ico("check") });
    screen(header({ back: function () { d.dest = null; saveDraft(); go("home"); }, close: true, title: "RUTA SELECCIONADA" }),
      h("div", { class: "mapa-pant scroll-fondo" }, mapBox, aviso, ok, h("div", { class: "pie-ruta" }, h("span", { html: ico("dots") }), info)), true);
    var map = newMap(mapBox);
    getRoute(d.origin, d.dest).then(function (r) {
      if (S.view !== "ruta") return;
      var p = price(r.km);
      drawRoute(map, d.origin, d.dest, r.coords);
      info.replaceChildren(document.createTextNode(d.dest.label), h("br"), document.createTextNode(nf(r.km, 2) + " km aprox. / " + nf(p, 2) + " € aprox."));
      aviso.style.display = "block";
      aviso.textContent = r.exact ? "Estimación con tarifa local de ejemplo (no oficial)" : "Sin servicio de rutas: distancia en línea recta × 1,25 · tarifa local de ejemplo";
      ok.disabled = false;
      ok.onclick = function () {
        var b = { id: uuid(), email: S.email, vehicle: d.vehicle, origin: d.origin, dest: d.dest, km: r.km, price: p,
          coords: r.coords.filter(function (_, i, a) { return i % 2 === 0 || i === a.length - 1; }), status: "solicitado", createdAt: Date.now() };
        putBooking(b); d.dest = null; saveDraft(); toast("Taxi solicitado"); go("home");
      };
    });
  }

  function viewReservas() {
    var list = bookings().sort(function (a, b) { return b.createdAt - a.createdAt; });
    var body = list.length ? list.map(function (b) {
      return h("div", { class: "reserva", "data-test": "reserva" },
        h("span", { class: "estado " + b.status }, b.status === "solicitado" ? "Solicitado" : "Cancelado"),
        h("span", { class: "precio" }, nf(b.price, 2) + " € aprox."),
        h("div", {}, new Date(b.createdAt).toLocaleString("es-ES", { dateStyle: "medium", timeStyle: "short" }) + " · " + (b.vehicle === "especial" ? "Especial" : "4 plazas")),
        h("div", {}, h("b", {}, "De: "), b.origin.label), h("div", {}, h("b", {}, "A: "), b.dest.label), h("div", {}, nf(b.km, 2) + " km aprox."));
    }) : [h("div", { class: "vacio-msg", "data-test": "sin-reservas" }, "Todavía no tiene reservas.")];
    screen(header({ menu: true, back: function () { go("home"); }, title: "MIS RESERVAS" }),
      h("main", { class: "cont" }, tabs("reservas", false), h("div", {}, body)));
  }

  function viewPerfil() {
    var u = me();
    var name = h("input", { class: "campo", id: "nombre", value: u.name }), phone = h("input", { class: "campo", id: "tel", value: u.phone || "", type: "tel" });
    var form = h("form", { class: "login", style: "margin-top:20px", onsubmit: function (e) {
      e.preventDefault();
      if (!name.value.trim()) { toast("El nombre no puede estar vacío"); return; }
      var list = users(); list.forEach(function (x) { if (x.email === u.email) { x.name = name.value.trim(); x.phone = phone.value.trim(); } });
      save("users", list); toast("Datos guardados");
    } },
      h("h2", { class: "titulo" }, "MI PERFIL"),
      h("div", { class: "fila" }, h("label", { class: "lbl" }, "Correo electrónico"), h("input", { class: "campo", value: u.email, disabled: true })),
      h("div", { class: "fila" }, h("label", { class: "lbl", for: "nombre" }, "Nombre y apellidos"), name),
      h("div", { class: "fila" }, h("label", { class: "lbl", for: "tel" }, "Teléfono"), phone),
      h("button", { class: "btn", type: "submit", id: "guardar" }, "GUARDAR"));
    screen(header({ menu: true, back: function () { go("home"); }, title: "MI PERFIL" }), h("main", { class: "cont" }, form));
  }

  /* ---------- render ---------- */
  function render() {
    if (!S.email || !me()) { S.email = null; save("session", null); if (["login", "registro", "olvido"].indexOf(S.view) < 0) S.view = "login"; }
    else if (["login", "registro", "olvido"].indexOf(S.view) >= 0) S.view = "home";
    var v = { login: viewLogin, registro: viewRegistro, olvido: viewOlvido, home: viewHome, buscar: viewBuscar, elegir: viewElegir,
      ruta: viewRuta, reservas: viewReservas, perfil: viewPerfil }[S.view] || viewHome;
    v();
    document.body.setAttribute("data-view", S.view);
  }
  render();
})();
