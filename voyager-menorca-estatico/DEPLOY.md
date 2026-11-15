# Despliegue en Netlify

## 1. Crear el sitio
1. Netlify → *Add new site → Import from Git* → repositorio `davassi-spec/Sky`, rama `main` (tras fusionar esta rama).
2. **Base directory:** `voyager-menorca-estatico`. Build y publish salen de `netlify.toml` (`npm run build` → `dist`).
3. Variables de entorno (*Site configuration → Environment variables*):

| Variable | Obligatoria | Uso |
|---|---|---|
| `RESEND_API_KEY` | **Sí** | Envío de los avisos de formularios (resend.com). Sin ella el formulario responde 503 y muestra el aviso de error (nunca finge éxito). |
| `CONTACT_TO` | No | Destino de los avisos (por defecto `info@voyagermenorca.com`). |
| `CONTACT_FROM` | No | Remitente, p. ej. `Voyager Menorca <web@voyagermenorca.com>`. Debe ser un dominio verificado en Resend (SPF + DKIM). |
| `PUBLIC_TURNSTILE_SITEKEY` + `TURNSTILE_SECRET` | Recomendada | CAPTCHA invisible de Cloudflare (gratis). Si no se definen, solo actúan honeypot, tiempo mínimo y límite por IP. |
| `FORM_WEBHOOK_URL` | No | Copia de cada solicitud a Zapier/Make/Sheets. |
| `SITE_URL` | No | Por defecto `https://voyagermenorca.com`. |

## 2. CMS (editar sin código)
*Site configuration → Identity → Enable* (registro **solo por invitación**) → *Git Gateway → Enable*. Invita tu e-mail y entra en `https://voyagermenorca.com/admin/`.

## 3. Antes de cambiar el DNS (staging)
- Abre la URL `*.netlify.app` y revisa: `/`, `/excursiones/`, una ficha, `/blog/`, `/en/`, `/ca/`, `/fr/`.
- **Envía un formulario real** y comprueba que llega el correo (y la respuesta con *Responder*).
- Comprueba redirecciones: `curl -sI https://<staging>/en/excursiones/ | head -3` → `301` a `/en/field-trips/`. La lista completa está en `dist/_redirects` (generada de `src/data/redirects.json`; inventario en `dist/url-coverage.json`).
- Lighthouse móvil en la ficha de una excursión.

## 4. Puesta en producción
1. *Domain management* → añade `voyagermenorca.com` y `www`; cambia los registros DNS a Netlify (baja el TTL con antelación). Activa HTTPS.
2. Google Search Console: envía `https://voyagermenorca.com/sitemap-index.xml` y revisa cobertura. No cambies las URLs.
3. Confirma el ID de Google Analytics (`gaId` en `src/lib/i18n.ts`, ahora `GT-WK27R653`).
4. **Turitop:** en cada excursión (CMS → campo *Código de inserción de Turitop*) pega el snippet de Turitop. Compañía configurada: `P626`.
5. Revisa los textos legales con tu asesor (política de privacidad y cookies reflejan el nuevo funcionamiento; la de cookies es nueva).

## 5. Vuelta atrás
El WordPress sigue intacto hasta que apuntes el DNS. La copia estática anterior está en `legacy/` y en la etiqueta Git `estatico-wordpress-v1`.
