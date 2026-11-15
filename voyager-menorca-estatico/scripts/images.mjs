// Optimiza src/images/** -> public/_img/<nombre>-<ancho>.webp + manifiesto src/data/images.json
// Las fotos se editan/añaden en src/images (el CMS sube ahí). Incremental.
import sharp from 'sharp';
import { readdir, mkdir, stat, writeFile, copyFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const SRC = 'src/images', OUT = 'public/_img', WIDTHS = [400, 800, 1280, 1920];
await mkdir(OUT, { recursive: true });
async function* walk(d) { for (const e of await readdir(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) yield* walk(p); else yield p; } }
const manifest = {};
let done = 0, skipped = 0;
for await (const f of walk(SRC)) {
  const ext = path.extname(f).toLowerCase();
  const name = path.basename(f, ext);
  if (ext === '.svg') { await copyFile(f, `${OUT}/${name}.svg`); manifest[name] = { svg: true }; continue; }
  if (!['.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif'].includes(ext)) continue;
  const meta = await sharp(f).metadata();
  const w0 = meta.width, h0 = meta.height;
  const widths = [...new Set(WIDTHS.filter((w) => w < w0).concat([Math.min(w0, 1920)]))].sort((a, b) => a - b);
  const srcTime = (await stat(f)).mtimeMs;
  for (const w of widths) {
    const out = `${OUT}/${name}-${w}.webp`;
    if (existsSync(out) && (await stat(out)).mtimeMs >= srcTime) { skipped++; continue; }
    await sharp(f).rotate().resize({ width: w, withoutEnlargement: true }).webp({ quality: 74, effort: 4 }).toFile(out); done++;
  }
  manifest[name] = { w: w0, h: h0, widths };
}
await writeFile('src/data/images.json', JSON.stringify(manifest, null, 1));
console.log(`imágenes: ${Object.keys(manifest).length} (${done} generadas, ${skipped} en caché)`);
