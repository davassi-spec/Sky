import { getCollection, type CollectionEntry } from 'astro:content';
import categoriesData from '../data/categories.json';
import imagesManifest from '../data/images.json';
import { LANGS, type Lang } from './i18n';

export type Page = CollectionEntry<'pages'>;
export type Post = CollectionEntry<'posts'>;
export type Category = { url: string; lang: Lang; name: string; alts: Partial<Record<Lang, string>> };

let _pages: Page[] | null = null, _posts: Post[] | null = null;
export async function pages() { return (_pages ??= await getCollection('pages')); }
export async function posts() {
  _posts ??= (await getCollection('posts')).sort((a, b) => (b.data.date ?? '').localeCompare(a.data.date ?? ''));
  return _posts;
}
export const categories = categoriesData as Category[];
export const PAGE_SIZE = 9;

export async function tours(lang: Lang) {
  return (await pages()).filter((p) => p.data.lang === lang && p.data.template === 'tour').sort((a, b) => (a.data.tourOrder ?? 0) - (b.data.tourOrder ?? 0));
}
export async function postsFor(lang: Lang) { return (await posts()).filter((p) => p.data.lang === lang); }
export function postsInCategory(all: Post[], cat: Category) { return all.filter((p) => p.data.categories.includes(cat.url)); }

/** Alternativas por idioma (hreflang) para una entrada. */
export async function alternates(kind: 'page' | 'post', key: string): Promise<Partial<Record<Lang, string>>> {
  const list = kind === 'page' ? await pages() : await posts();
  const out: Partial<Record<Lang, string>> = {};
  for (const e of list) if (e.data.translationKey === key) out[e.data.lang as Lang] = e.data.url;
  return out;
}
/** Alternativas de idioma de una categoría, solo recíprocas (evita hreflang que no se devuelven). */
const parent: Record<string, string> = {};
const find = (x: string): string => (parent[x] === undefined || parent[x] === x ? (parent[x] = x) : (parent[x] = find(parent[x])));
for (const c of categories) { find(c.url); for (const u of Object.values(c.alts)) if (u) parent[find(u)] = find(c.url); }
const exists = new Set(categories.map((c) => c.url));
const rep: Record<string, Partial<Record<Lang, string>>> = {};
for (const c of categories) { const g = find(c.url); (rep[g] ??= {}); if (!rep[g][c.lang as Lang]) rep[g][c.lang as Lang] = c.url; }
export function categoryAlts(c: Category): Partial<Record<Lang, string>> {
  const g = rep[find(c.url)] ?? {};
  if (g[c.lang as Lang] !== c.url) return {};            // no es el representante de su idioma: sin alternativas
  return Object.fromEntries(Object.entries(g).filter(([, u]) => u && exists.has(u)));
}
export const hasImage = (src?: string) => !!src && !!(imagesManifest as Record<string, unknown>)[src.replace(/^\/images\//, '').replace(/\.[a-z0-9]+$/i, '')];

export function fmtDate(iso: string | undefined, lang: Lang) {
  if (!iso) return '';
  return new Date(iso + 'T12:00:00').toLocaleDateString({ es: 'es-ES', ca: 'ca-ES', en: 'en-GB', fr: 'fr-FR' }[lang], { year: 'numeric', month: 'long', day: 'numeric' });
}
export { LANGS };
