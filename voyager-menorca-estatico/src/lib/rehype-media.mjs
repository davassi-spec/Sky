// Convierte ![](/images/x.jpg) del Markdown en <img> responsive (srcset webp generado por scripts/images.mjs).
import { readFileSync, existsSync } from 'node:fs';

let manifest = null;
function load() { if (!manifest) manifest = existsSync('src/data/images.json') ? JSON.parse(readFileSync('src/data/images.json', 'utf8')) : {}; return manifest; }

export function imgProps(src, sizes = '(min-width: 900px) 760px, 100vw') {
  const m = load()[src.replace(/^\/images\//, '').replace(/\.[a-z0-9]+$/i, '')];
  if (!m) return null;
  const name = src.replace(/^\/images\//, '').replace(/\.[a-z0-9]+$/i, '');
  if (m.svg) return { src: `/_img/${name}.svg` };
  const largest = m.widths[m.widths.length - 1];
  return {
    src: `/_img/${name}-${largest}.webp`,
    srcset: m.widths.map((w) => `/_img/${name}-${w}.webp ${w}w`).join(', '),
    sizes, width: m.w, height: m.h,
  };
}

function walk(node) {
  if (node.type === 'element' && node.tagName === 'img' && typeof node.properties?.src === 'string' && node.properties.src.startsWith('/images/')) {
    const p = imgProps(node.properties.src);
    if (p) Object.assign(node.properties, p, { loading: 'lazy', decoding: 'async' });
  }
  node.children?.forEach(walk);
}
export function rehypeMedia() { return (tree) => walk(tree); }
