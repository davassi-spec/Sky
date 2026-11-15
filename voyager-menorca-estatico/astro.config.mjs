import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import { rehypeMedia } from './src/lib/rehype-media.mjs';

export const SITE = process.env.SITE_URL || 'https://voyagermenorca.com';

export default defineConfig({
  site: SITE,
  trailingSlash: 'always',
  build: { format: 'directory', inlineStylesheets: 'always' },
  compressHTML: true,
  prefetch: { prefetchAll: false, defaultStrategy: 'hover' },
  markdown: { rehypePlugins: [rehypeMedia] },
  integrations: [
    sitemap({
      i18n: { defaultLocale: 'es', locales: { es: 'es-ES', ca: 'ca-ES', en: 'en-GB', fr: 'fr-FR' } },
      filter: (page) => !/\/(solicitud-recibida|request-received|demande-recue|sol-star-licitud-rebuda|404)\/?$/.test(page),
    }),
  ],
});
