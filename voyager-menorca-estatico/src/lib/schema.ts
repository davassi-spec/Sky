import { KEY_URLS, NAV_LABEL, SITE, t, type Lang } from './i18n';
import { SITE as ORIGIN } from '../../astro.config.mjs';

const abs = (p: string) => new URL(p, ORIGIN).href;
const img = (src?: string) => (src ? abs(`/_img/${src.replace(/^\/images\//, '').replace(/\.[a-z0-9]+$/i, '')}-1280.webp`) : undefined);
export const org = () => ({
  '@context': 'https://schema.org', '@type': ['TravelAgency', 'LocalBusiness'], '@id': abs('/#org'), name: SITE.name, url: abs('/'), logo: abs('/logo.svg'), image: abs('/og-default.jpg'),
  telephone: SITE.phone, email: SITE.email, sameAs: [SITE.instagram], areaServed: { '@type': 'AdministrativeArea', name: 'Menorca' }, address: { '@type': 'PostalAddress', addressRegion: 'Illes Balears', addressCountry: 'ES' },
  founder: { '@type': 'Person', name: 'Daniel Vaquera' }, knowsLanguage: ['es', 'ca', 'en', 'fr'],
});
export const website = (lang: Lang) => ({ '@context': 'https://schema.org', '@type': 'WebSite', url: abs('/'), name: SITE.name, inLanguage: lang, publisher: { '@id': abs('/#org') } });
export const breadcrumbs = (items: { name: string; href: string }[]) => ({ '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: items.map((x, i) => ({ '@type': 'ListItem', position: i + 1, name: x.name, item: abs(x.href) })) });
export const faqLd = (faq: { q: string; a: string[] }[]) => ({ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: faq.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a.join(' ') } })) });
export function tourLd(d: any, lang: Lang) {
  const n = d.price ? Number(String(d.price.amount).replace(/[^\d.,]/g, '').replace(',', '.')) : NaN;
  return {
    '@context': 'https://schema.org', '@type': 'TouristTrip', name: d.title, description: d.description, url: abs(d.url), inLanguage: lang, image: img(d.gallery?.[0] ?? d.image),
    provider: { '@id': abs('/#org') }, touristType: 'Cultural tourism',
    ...(Number.isFinite(n) ? { offers: { '@type': 'Offer', price: n, priceCurrency: 'EUR', url: abs(d.url), availability: d.badge && /complet|full|complet/i.test(d.badge) ? 'https://schema.org/SoldOut' : 'https://schema.org/InStock' } } : {}),
  };
}
export const postLd = (d: any, lang: Lang) => ({
  '@context': 'https://schema.org', '@type': 'BlogPosting', headline: d.title, description: d.description, inLanguage: lang, image: img(d.image), mainEntityOfPage: abs(d.url),
  datePublished: d.date || undefined, dateModified: d.updated || d.date || undefined, author: { '@type': 'Person', name: 'Daniel Vaquera' }, publisher: { '@id': abs('/#org') },
});
export const crumbsFor = (lang: Lang, mid: { name: string; href: string }[]) => [{ name: t(lang, 'home'), href: KEY_URLS[lang].home }, ...mid];
export { NAV_LABEL };
