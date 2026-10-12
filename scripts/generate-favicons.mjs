// Génère les favicons à partir de design/favicon-source.svg (rendu Chromium via Playwright).
// Usage : node scripts/generate-favicons.mjs [DOSSIER_APERÇUS]   (défaut : artifacts/favicons, ignoré par git)
// Écrit favicon.svg, favicon.ico, favicon-48.png, apple-touch-icon.png et icon-192/512.png dans frontend/public/.
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const previewDir = process.argv[2] || join(root, 'artifacts', 'favicons');
const { chromium } = createRequire(join(root, 'package.json'))('playwright');
const out = join(root, 'frontend', 'public');
mkdirSync(previewDir, { recursive: true });

const source = readFileSync(join(root, 'design', 'favicon-source.svg'), 'utf8');

// Contrôles de sécurité du fichier fourni.
const forbidden = [/<script/i, /<image/i, /<text/i, /font-family/i, /@import/i, /<style/i, /<foreignObject/i, /\bon[a-z]+=/i, /(?:xlink:)?href=/i, /url\(/i, /<use/i];
for (const re of forbidden) if (re.test(source)) throw new Error(`Motif interdit dans la source : ${re}`);
const urls = source.match(/https?:\/\/[^"'\s)]+/g) ?? [];
if (urls.some((u) => u !== 'http://www.w3.org/2000/svg')) throw new Error(`Référence externe : ${urls}`);

// Nettoyage : mêmes formes et couleurs, sans indentation ni attributs par défaut.
const paths = [...source.matchAll(/<path d="([^"]+)"\/>/g)].map((m) => m[1].replace(/\s+/g, ' ').trim());
if (paths.length !== 2) throw new Error(`2 tracés attendus, ${paths.length} trouvés`);
const svg = (letters, scale = 1) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">` +
  `<circle cx="32" cy="32" r="32" fill="#2D5016"/>` +
  `<g fill="#F4EFE0"${scale === 1 ? '' : ` transform="translate(32 32) scale(${scale}) translate(-32 -32)"`}>` +
  letters.map((d) => `<path d="${d}"/>`).join('') +
  `</g></svg>\n`;
const clean = svg(paths);
writeFileSync(join(out, 'favicon.svg'), clean);
// Variante proposée (non utilisée) : lettres réduites de 13 % (~5 % de marge en plus par côté).
const margin = svg(paths, 0.87);
writeFileSync(join(previewDir, 'favicon-marge-5pc.svg'), margin);

const browser = await chromium.launch();
async function render(markup, size, { opaque = false, dpr = 1 } = {}) {
  const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: dpr });
  const body = opaque
    // Icône iPhone : carré plein vert (le disque se fond dans le fond), pas de transparence.
    ? `<div style="width:${size}px;height:${size}px;background:#2D5016">${markup.replace('<svg ', `<svg width="${size}" height="${size}" `)}</div>`
    : markup.replace('<svg ', `<svg width="${size}" height="${size}" `);
  await page.setContent(`<!doctype html><html><body style="margin:0;background:transparent">${body}</body></html>`);
  const png = await page.screenshot({ omitBackground: !opaque, clip: { x: 0, y: 0, width: size, height: size } });
  await page.close();
  return png;
}

const files = {
  'favicon-48.png': await render(clean, 48),
  'apple-touch-icon.png': await render(clean, 180, { opaque: true }),
  'icon-192.png': await render(clean, 192),
  'icon-512.png': await render(clean, 512),
};
for (const [name, png] of Object.entries(files)) writeFileSync(join(out, name), png);

// favicon.ico : 16, 32 et 48 px, entrées PNG (format ICO Vista+ reconnu par tous les navigateurs).
const icoSizes = [16, 32, 48];
const icoPngs = [];
for (const s of icoSizes) icoPngs.push(await render(clean, s));
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(icoSizes.length, 4);
let offset = 6 + 16 * icoSizes.length;
const entries = icoSizes.map((s, i) => {
  const e = Buffer.alloc(16);
  e.writeUInt8(s, 0); e.writeUInt8(s, 1); e.writeUInt8(0, 2); e.writeUInt8(0, 3);
  e.writeUInt16LE(1, 4); e.writeUInt16LE(32, 6);
  e.writeUInt32LE(icoPngs[i].length, 8); e.writeUInt32LE(offset, 12);
  offset += icoPngs[i].length;
  return e;
});
writeFileSync(join(out, 'favicon.ico'), Buffer.concat([header, ...entries, ...icoPngs]));

// Aperçus : 256, 32 et 16 px (16 et 32 aussi agrandis ×8 sans lissage), variante avec marge,
// et icône iPhone sous le masque arrondi d'iOS.
const previews = {
  'apercu-256.png': await render(clean, 256),
  'apercu-32.png': icoPngs[1],
  'apercu-16.png': icoPngs[0],
  'apercu-marge-256.png': await render(margin, 256),
  'apercu-marge-16.png': await render(margin, 16),
};
for (const [name, png] of Object.entries(previews)) writeFileSync(join(previewDir, name), png);

const b64 = (buf) => `data:image/png;base64,${buf.toString('base64')}`;
const sheet = await browser.newPage({ viewport: { width: 1100, height: 520 } });
await sheet.setContent(`<!doctype html><html><body style="margin:16px;font:14px sans-serif;background:#fff">
<div style="display:flex;gap:28px;align-items:flex-end">
  <figure style="margin:0"><img src="${b64(previews['apercu-256.png'])}" width="256"><figcaption>256 px</figcaption></figure>
  <figure style="margin:0"><img src="${b64(icoPngs[1])}" width="32"><figcaption>32 px</figcaption></figure>
  <figure style="margin:0"><img src="${b64(icoPngs[0])}" width="16"><figcaption>16 px</figcaption></figure>
  <figure style="margin:0"><img src="${b64(icoPngs[1])}" width="128" style="image-rendering:pixelated"><figcaption>32 px ×4</figcaption></figure>
  <figure style="margin:0"><img src="${b64(icoPngs[0])}" width="128" style="image-rendering:pixelated"><figcaption>16 px ×8</figcaption></figure>
  <figure style="margin:0"><img src="${b64(files['apple-touch-icon.png'])}" width="180" style="border-radius:40px"><figcaption>iPhone 180 (masque arrondi)</figcaption></figure>
</div>
<div style="display:flex;gap:28px;align-items:flex-end;margin-top:20px;background:#1f1f1f;color:#ddd;padding:12px">
  <span>Onglet sombre :</span><img src="${b64(icoPngs[0])}" width="16"><img src="${b64(icoPngs[1])}" width="32">
  <span style="margin-left:40px">Variante +5 % de marge :</span><img src="${b64(previews['apercu-marge-256.png'])}" width="128"><img src="${b64(previews['apercu-marge-16.png'])}" width="128" style="image-rendering:pixelated">
</div></body></html>`);
await sheet.screenshot({ path: join(previewDir, 'planche.png'), fullPage: true });
await browser.close();
console.log('favicon.svg', clean.length, 'octets ; ico', icoSizes.join('/'), '; fichiers écrits dans', out);
