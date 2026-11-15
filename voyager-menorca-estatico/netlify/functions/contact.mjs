// Netlify Function (v2): POST /api/contact
// Valida, filtra spam (honeypot + tiempo mínimo + Turnstile opcional + límite por IP) y envía el aviso por e-mail con Resend.
// Variables de entorno: RESEND_API_KEY (obligatoria), CONTACT_TO, CONTACT_FROM, TURNSTILE_SECRET (opcional), FORM_WEBHOOK_URL (opcional).
export const config = { path: '/api/contact' };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const hits = new Map(); // límite por IP (mejor esfuerzo, por instancia)
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clean = (s, max) => String(s ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, max);
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

export async function handle(req, env = process.env, fetchImpl = fetch, now = Date.now()) {
  if (req.method !== 'POST') return json(405, { ok: false, error: 'method' });
  const raw = await req.text();
  if (raw.length > 20000) return json(413, { ok: false, error: 'size' });
  let b; try { b = JSON.parse(raw); } catch { return json(400, { ok: false, error: 'json' }); }

  const ip = (req.headers.get('x-nf-client-connection-ip') || req.headers.get('x-forwarded-for') || 'x').split(',')[0].trim();
  const recent = (hits.get(ip) || []).filter((t) => now - t < 600000);
  if (recent.length >= 5) return json(429, { ok: false, error: 'rate' });
  hits.set(ip, [...recent, now]);

  // Antispam silencioso: el bot cree que ha funcionado
  const age = now - Number(b.ts || 0);
  if (clean(b.website, 200) || !Number.isFinite(age) || age < 3000 || age > 86400000) return json(200, { ok: true });

  if (env.TURNSTILE_SECRET) {
    const tok = b['cf-turnstile-response'];
    const r = await fetchImpl('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: new URLSearchParams({ secret: env.TURNSTILE_SECRET, response: tok || '', remoteip: ip }) });
    const j = await r.json().catch(() => ({}));
    if (!j.success) return json(400, { ok: false, error: 'captcha' });
  }

  const d = { name: clean(b.name, 120), email: clean(b.email, 160), phone: clean(b.phone, 40), tour: clean(b.tour, 160), date: clean(b.date, 20), people: clean(b.people, 5), tourLang: clean(b.tourLang, 5), message: clean(b.message, 2000), page: clean(b.page, 200), lang: clean(b.lang, 5) };
  if (!d.name || !EMAIL_RE.test(d.email) || !b.accept) return json(400, { ok: false, error: 'validation' });

  const subject = `Nueva solicitud web: ${d.tour || 'contacto'} — ${d.name}`.replace(/[\r\n]+/g, ' ').slice(0, 200);
  const rows = [['Nombre', d.name], ['Email', d.email], ['Teléfono', d.phone], ['Excursión', d.tour], ['Fecha', d.date], ['Personas', d.people], ['Idioma de la visita', d.tourLang], ['Mensaje', d.message], ['Página', d.page], ['Idioma de la web', d.lang]].filter(([, v]) => v);
  const text = rows.map(([k, v]) => `${k}: ${v}`).join('\n');
  const html = `<table cellpadding="6" style="font-family:system-ui,sans-serif;font-size:15px">${rows.map(([k, v]) => `<tr><td><b>${esc(k)}</b></td><td>${esc(v).replace(/\n/g, '<br>')}</td></tr>`).join('')}</table>`;

  if (env.FORM_WEBHOOK_URL) fetchImpl(env.FORM_WEBHOOK_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(d) }).catch(() => {});
  if (!env.RESEND_API_KEY) { console.error('RESEND_API_KEY no configurada: solicitud NO enviada'); return json(503, { ok: false, error: 'not-configured' }); }
  const res = await fetchImpl('https://api.resend.com/emails', {
    method: 'POST', headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: env.CONTACT_FROM || 'Voyager Menorca <web@voyagermenorca.com>', to: [env.CONTACT_TO || 'info@voyagermenorca.com'], reply_to: d.email, subject, text, html }),
  });
  if (!res.ok) { console.error('Resend error', res.status, await res.text().catch(() => '')); return json(502, { ok: false, error: 'mail' }); }
  return json(200, { ok: true });
}
export default (req) => handle(req);
