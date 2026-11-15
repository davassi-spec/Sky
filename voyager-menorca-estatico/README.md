# Voyager Menorca — web nueva (Astro, sin WordPress)

Sustituye a voyagermenorca.com (WordPress + Elementor + WPML + Contact Form 7 + Jetpack). 4 idiomas (es · ca · en · fr), **mismas URLs** que el sitio original, 383 páginas estáticas, 0 dependencias de WordPress.

```bash
npm install
npm run dev        # http://localhost:4321  (optimiza imágenes y arranca Astro)
npm run build      # imágenes → astro build → dist/ + redirecciones 301
npm test           # 29 pruebas: HTML estático, hreflang, URLs, función de contacto, navegador, WCAG
```
Requiere Node 22. Despliegue en Netlify: ver **[DEPLOY.md](DEPLOY.md)**.

## Estructura
| Ruta | Contenido |
|---|---|
| `src/content/pages/<idioma>/*.md` | Páginas y fichas de excursión (frontmatter: precio, datos clave, FAQ, reseñas, galería…) |
| `src/content/posts/<idioma>/*.md` | Artículos del blog |
| `src/images/` | Fotos originales; `scripts/images.mjs` genera WebP responsive en `public/_img/` |
| `src/data/home.json`, `categories.json`, `redirects.json` | Textos de portada por idioma, árbol de categorías, redirecciones |
| `src/views/`, `src/components/`, `src/layouts/` | Plantillas (Home, Tour, Page, Post, Listing) y componentes |
| `src/lib/i18n.ts` | Textos de interfaz en 4 idiomas, URLs clave, datos de contacto (`SITE`) |
| `src/styles/global.css` | Sistema de diseño (tokens de color/tipografía/espaciado) |
| `netlify/functions/contact.mjs` | Formularios: validación, antispam, e-mail |
| `public/admin/` | CMS (Decap) para editar sin tocar código |
| `tools/` | Scripts de migración desde la copia de WordPress (`extract.py`, `build_content.py`); no se usan en producción |
| `legacy/` | Copia estática anterior de WordPress (referencia). Etiqueta Git `estatico-wordpress-v1` |

## Sistema de diseño
Identidad “guía local”: azul marino del logo (`#27336e`/`#14204a`), verde mar (`#61d19e`), ocre de marés (`#e8b54a`) para etiquetas de precio, blanco de cal con matiz verdoso. Titulares en **Bricolage Grotesque**, texto en **Figtree** (autoalojadas, sin Google Fonts). Elemento memorable: etiqueta de precio tipo “tag” sobre cada foto y línea de ruta punteada en “Así de sencillo”. Contraste AA, foco visible, `prefers-reduced-motion`, objetivos táctiles ≥ 44 px.

## Edición de contenido
`/admin/` (Decap CMS): excursiones (precio, datos, galería, FAQ, reseñas, Turitop), páginas y artículos en cada idioma. Cada guardado es un commit y Netlify republica. Fotos nuevas: se suben a `src/images/` y se optimizan solas.
Para **añadir una excursión nueva**: crear una página en cada idioma con plantilla `tour`, la misma `translationKey` y su URL.

## Qué cambia respecto a WordPress
Formularios → función propia (ver DEPLOY.md) · cookies → banner propio (la analítica solo carga tras aceptar) · Turitop → se carga solo al pulsar «Reservar online» (requiere el snippet de cada excursión en el CMS) · sin búsqueda, comentarios ni RSS.
