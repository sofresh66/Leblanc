import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path) => readFileSync(new URL(`../../frontend/${path}`, import.meta.url));
// Largeur, hauteur et type de couleur d'un PNG (en-tête IHDR).
const png = (buffer) => ({ width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20), colorType: buffer.readUInt8(25) });

describe('favicons', () => {
  const html = read('index.html').toString('utf8');
  const links = [...html.matchAll(/<link rel="(icon|apple-touch-icon)"[^>]*>/g)].map((m) => m[0]);

  it('index.html déclare chaque icône une seule fois et chaque fichier existe', () => {
    const hrefs = links.map((link) => link.match(/href="([^"]+)"/)[1]);
    expect(hrefs).toEqual(['/favicon.ico', '/favicon.svg', '/favicon-48.png', '/icon-192.png', '/icon-512.png', '/apple-touch-icon.png']);
    for (const href of hrefs) expect(read(`public${href}`).length).toBeGreaterThan(0);
  });

  it('les PNG ont la taille déclarée ; l’icône iPhone est opaque', () => {
    expect(png(read('public/favicon-48.png'))).toMatchObject({ width: 48, height: 48 });
    expect(png(read('public/icon-192.png'))).toMatchObject({ width: 192, height: 192 });
    expect(png(read('public/icon-512.png'))).toMatchObject({ width: 512, height: 512 });
    // Type de couleur 2 : RVB sans canal alpha.
    expect(png(read('public/apple-touch-icon.png'))).toEqual({ width: 180, height: 180, colorType: 2 });
    for (const link of links.filter((l) => l.includes('sizes=') && l.includes('.png'))) {
      const [, size] = link.match(/sizes="(\d+)x\1"/);
      expect(png(read(`public${link.match(/href="([^"]+)"/)[1]}`)).width).toBe(Number(size));
    }
  });

  it('favicon.ico contient 16, 32 et 48 px', () => {
    const ico = read('public/favicon.ico');
    expect(ico.readUInt16LE(2)).toBe(1);
    const sizes = Array.from({ length: ico.readUInt16LE(4) }, (_, i) => ico.readUInt8(6 + 16 * i));
    expect(sizes).toEqual([16, 32, 48]);
  });

  it('favicon.svg est autonome : ni script, ni police, ni texte, ni référence externe', () => {
    const svg = read('public/favicon.svg').toString('utf8');
    expect(svg).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 64 64">/);
    expect(svg).not.toMatch(/<script|<image|<text|<style|<use|font-family|href=|url\(|\son[a-z]+=/i);
    expect(svg.match(/https?:\/\/[^"]+/g)).toEqual(['http://www.w3.org/2000/svg']);
    expect(svg).toContain('fill="#2D5016"');
    expect(svg).toContain('fill="#F4EFE0"');
  });
});
