# Voyager Menorca — copia estática (sin WordPress)

Copia fiel de **voyagermenorca.com** (WordPress + Elementor + WPML) convertida en un sitio
estático: HTML/CSS/JS/imágenes listos para alojar en cualquier hosting, sin PHP ni base de datos.
Generada el 2026-11-14 a partir de la web pública.

- **~400 páginas** en 4 idiomas (es, ca, en, fr): inicio, excursiones, tours, blog, categorías, legales…
- Medido contra el original en móvil y escritorio: **0,4–0,7 % de píxeles distintos** en inicio y tour
  (el resto es animación de sliders/banner de cookies). Ver `shots/` (`*-local.jpg` vs `*-orig.jpg`).

## Ejecutar
```bash
npm start          # http://localhost:8080  (Node 18+, sin dependencias)
npm test           # e2e con Playwright (con el servidor en marcha: URL=http://localhost:8080)
```
Para alojarlo: sube `public/` a cualquier hosting estático (Netlify, Cloudflare Pages, S3, Nginx…).
Sirve las rutas con barra final (`/excursiones/` → `excursiones/index.html`).
`server.js` es opcional; solo es imprescindible para recibir formularios (ver abajo).

## Estructura
- `public/` — el sitio. Las rutas coinciden con las del original (mismos slugs → conserva SEO).
  `public/wp-content`, `public/wp-includes`: CSS/JS de Elementor y plugins **tal cual** (siguen haciendo
  funcionar el diseño). `public/img/`: imágenes que servía el CDN de Jetpack (`i0.wp.com`), ahora locales.
- `public/forms.js` — sustituye a Contact Form 7 y a los formularios de Elementor.
- `server.js` — servidor estático + `POST /api/forms`.
- `tools/crawl.py`, `tools/pages.txt` — rastreador para regenerar la copia desde el sitio vivo.

## Qué ya NO depende de WordPress y qué cambió
| Función | Estado |
|---|---|
| Diseño, menús, sliders, idiomas (selector es/ca/en/fr) | Funciona (HTML ya renderizado) |
| Formularios de contacto y de reserva | **Reescritos**: `forms.js` los envía a `/api/forms` (guarda en `data/submissions.jsonl`). Para recibir avisos define `FORM_WEBHOOK_URL` (Zapier/Make/Formspree…) o `window.VOYAGER_FORMS_ENDPOINT` si alojas solo estático. **Sin esto no te llega ningún correo.** |
| reCAPTCHA de los formularios | Eliminado (añade uno nuevo, p. ej. Cloudflare Turnstile, al endpoint) |
| Banner de cookies (Complianz) | Funciona con la configuración congelada en `public/wp-json/complianz/v1/cookie_data` |
| Reservas Turitop, WhatsApp, Google Tag, accesibilidad Elementor | Siguen cargándose de sus servicios externos |
| Panel de WordPress / editar contenido | **Ya no existe**: edita los HTML o migra a un generador (Astro, Eleventy…) |
| Búsqueda, comentarios, feeds RSS, `wp-json` | No disponibles |

## Limitaciones conocidas
- Es una instantánea: cambios posteriores en el WordPress no aparecen hasta volver a ejecutar `tools/crawl.py`.
- Enlaces rotos **que ya estaban rotos en el original** (404 allí): `/blog/ciutadella-ruta-historia-mercados-restaurantes/`,
  `/faros/`, `/playas-de-menorca-segun-el-viento/`, `/visita-guiada-por-mahon/`.
- Archivos de fechas, autores y etiquetas no se copiaron. El HTML conserva el CSS/JS de Elementor (pesado);
  la mejora siguiente es migrar a plantillas propias y optimizar imágenes.
- Las 4 páginas borrador/copias de seguridad del WordPress no se incluyen (no eran públicas).
