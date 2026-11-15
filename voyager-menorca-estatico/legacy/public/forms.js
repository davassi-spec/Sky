/* Sustituye Contact Form 7 y los formularios de Elementor (que necesitaban WordPress).
 * Envía los datos como JSON a FORMS_ENDPOINT (por defecto /api/forms, ver server.js).
 * Para alojamiento estático puro, apunta FORMS_ENDPOINT a Formspree, Netlify Function, etc. */
(function () {
  var FORMS_ENDPOINT = window.VOYAGER_FORMS_ENDPOINT || "/api/forms";
  var THANKS = { "": "/solicitud-recibida/", ca: "/ca/sol-star-licitud-rebuda/", en: "/en/request-received/", fr: "/fr/demande-recue/" };
  var MSG = {
    "": { req: "Por favor, completa los campos obligatorios.", mail: "Introduce un correo electrónico válido.", ok: "Gracias, tu mensaje se ha enviado.", err: "No se pudo enviar. Inténtalo de nuevo o escríbenos por WhatsApp." },
    ca: { req: "Si us plau, completa els camps obligatoris.", mail: "Introdueix un correu electrònic vàlid.", ok: "Gràcies, el teu missatge s'ha enviat.", err: "No s'ha pogut enviar. Torna-ho a provar o escriu-nos per WhatsApp." },
    en: { req: "Please fill in the required fields.", mail: "Please enter a valid email address.", ok: "Thank you, your message has been sent.", err: "Could not send. Please try again or message us on WhatsApp." },
    fr: { req: "Veuillez remplir les champs obligatoires.", mail: "Saisissez une adresse e-mail valide.", ok: "Merci, votre message a été envoyé.", err: "Envoi impossible. Réessayez ou écrivez-nous sur WhatsApp." }
  };
  var lang = (location.pathname.match(/^\/(ca|en|fr)\//) || [, ""])[1];
  var t = MSG[lang];

  function note(form, text, ok) {
    var box = form.querySelector(".vm-form-msg");
    if (!box) { box = document.createElement("div"); box.className = "vm-form-msg"; box.setAttribute("role", "alert"); form.appendChild(box); }
    box.style.cssText = "margin-top:14px;padding:10px 14px;border-radius:6px;font-size:15px;" + (ok ? "background:#e6f4ea;color:#1e6b34" : "background:#fdecea;color:#a32018");
    box.textContent = text;
  }
  function valid(form) {
    var bad = null;
    form.querySelectorAll("input,select,textarea").forEach(function (el) {
      if (bad || el.type === "hidden" || el.type === "submit") return;
      var req = el.required || el.getAttribute("aria-required") === "true";
      var empty = el.type === "checkbox" ? !el.checked : !String(el.value).trim();
      if (req && empty) bad = t.req;
      else if (el.type === "email" && el.value && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(el.value)) bad = t.mail;
    });
    return bad;
  }
  function collect(form) {
    var data = {}, fd = new FormData(form);
    fd.forEach(function (v, k) {
      if (k.indexOf("_wpcf7") === 0 || k === "post_id" || k === "queried_id") return;
      k = k.replace(/^form_fields\[(.*)\]$/, "$1").replace(/\[\]$/, "");
      data[k] = v;
    });
    return { form: form.getAttribute("name") || form.getAttribute("aria-label") || "contacto", page: location.pathname, lang: lang || "es", fields: data, sent_at: new Date().toISOString() };
  }
  document.addEventListener("submit", function (e) {
    var f = e.target;
    if (!f.matches || !f.matches("form.wpcf7-form, form.elementor-form")) return;
    e.preventDefault(); e.stopImmediatePropagation();
    var problem = valid(f);
    if (problem) { note(f, problem, false); return; }
    var btn = f.querySelector("[type=submit]"); if (btn) btn.disabled = true;
    fetch(FORMS_ENDPOINT, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(collect(f)) })
      .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); })
      .then(function () {
        if (f.matches("form.elementor-form")) { location.href = THANKS[lang]; return; }
        f.reset(); note(f, t.ok, true);
      })
      .catch(function () { note(f, t.err, false); })
      .then(function () { if (btn) btn.disabled = false; });
  }, true);
})();
