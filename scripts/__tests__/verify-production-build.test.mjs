import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  MAX_SITEMAP_URLS,
  MIN_SITEMAP_BYTES,
  MIN_SITEMAP_URLS,
  verifyProductionBuild,
} from '../verify-production-build.mjs';

const eventUrl =
  'https://leblanc-et-moi.pages.dev/fr/evenements/12345678-1234-1234-1234-123456789abc';
let dist;

function sitemapWithUrls(urls) {
  return `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls
    .map((url) => `<url><loc>${url}</loc></url>`)
    .join('')}</urlset>`;
}

function catalogueUrls(count = 800) {
  return [
    'https://leblanc-et-moi.pages.dev/fr',
    ...Array.from(
      { length: count - 1 },
      (_, index) =>
        `https://leblanc-et-moi.pages.dev/fr/evenements/12345678-1234-1234-1234-${index.toString(16).padStart(12, '0')}`,
    ),
  ];
}

function sitemapOfSize(bytes, url = eventUrl) {
  return sitemapWithUrls([url]).padEnd(bytes, ' ');
}

beforeEach(async () => {
  dist = await mkdtemp(join(tmpdir(), 'leblanc-build-test-'));
  await writeFile(join(dist, 'index.html'), '<!doctype html><html lang="fr"></html>');
});

afterEach(async () => {
  if (dist) await rm(dist, { recursive: true, force: true });
});

describe('Vérification du build de production', () => {
  it('refuse un sitemap absent', async () => {
    await expect(verifyProductionBuild(dist)).rejects.toThrow('sitemap.xml absent');
  });

  it('refuse un sitemap trop petit', async () => {
    await writeFile(join(dist, 'sitemap.xml'), sitemapOfSize(1_000));
    await expect(verifyProductionBuild(dist)).rejects.toThrow('Sitemap trop petit');
  });

  it('refuse exactement 50 kB : le seuil est strict', async () => {
    await writeFile(join(dist, 'sitemap.xml'), sitemapOfSize(MIN_SITEMAP_BYTES));
    await expect(verifyProductionBuild(dist)).rejects.toThrow('Sitemap trop petit');
  });

  it.each([MIN_SITEMAP_URLS, 792, 804, MAX_SITEMAP_URLS])(
    'accepte un sitemap correct de %i URLs, bornes incluses',
    async (count) => {
      const xml = sitemapWithUrls(catalogueUrls(count));
      await writeFile(join(dist, 'sitemap.xml'), xml);
      await expect(verifyProductionBuild(dist)).resolves.toEqual({
        sitemapBytes: Buffer.byteLength(xml),
        totalUrls: count,
        eventUrls: count - 1,
      });
    },
  );

  it.each([MIN_SITEMAP_URLS - 1, MAX_SITEMAP_URLS + 1])(
    'refuse %i URLs même avec les pages requises et une taille suffisante',
    async (count) => {
      const xml = sitemapWithUrls(catalogueUrls(count));
      expect(Buffer.byteLength(xml)).toBeGreaterThan(MIN_SITEMAP_BYTES);
      await writeFile(join(dist, 'sitemap.xml'), xml);
      await expect(verifyProductionBuild(dist)).rejects.toThrow(
        'Nombre d’URLs du sitemap hors plage',
      );
    },
  );

  it('refuse un index absent', async () => {
    await rm(join(dist, 'index.html'));
    await writeFile(join(dist, 'sitemap.xml'), sitemapOfSize(51_000));
    await expect(verifyProductionBuild(dist)).rejects.toThrow('index.html absent');
  });

  it('refuse un index vide', async () => {
    await writeFile(join(dist, 'index.html'), '');
    await expect(verifyProductionBuild(dist)).rejects.toThrow('index.html est vide');
  });

  it('refuse un dossier nommé sitemap.xml', async () => {
    await mkdir(join(dist, 'sitemap.xml'));
    await expect(verifyProductionBuild(dist)).rejects.toThrow('sitemap.xml absent');
  });

  it('refuse un grand sitemap sans fiche événement', async () => {
    const urls = catalogueUrls().map((url) => url.replace('/fr/evenements/', '/fr/lieux/'));
    await writeFile(join(dist, 'sitemap.xml'), sitemapWithUrls(urls));
    await expect(verifyProductionBuild(dist)).rejects.toThrow('Aucune URL de fiche');
  });

  it('refuse les fiches d’une autre origine', async () => {
    const urls = catalogueUrls().map((url, index) =>
      index === 0 ? url : url.replace('leblanc-et-moi.pages.dev', 'example.org'),
    );
    await writeFile(join(dist, 'sitemap.xml'), sitemapWithUrls(urls));
    await expect(verifyProductionBuild(dist)).rejects.toThrow('Aucune URL de fiche');
  });

  it.each([eventUrl, 'https://example.org/fr', 'https://leblanc-et-moi.pages.dev/france'])(
    'refuse un sitemap sans page principale /fr de production (%s)',
    async (replacement) => {
      const urls = catalogueUrls();
      urls[0] = replacement;
      await writeFile(join(dist, 'sitemap.xml'), sitemapWithUrls(urls));
      await expect(verifyProductionBuild(dist)).rejects.toThrow(
        'Aucune URL de page principale /fr',
      );
    },
  );

  it('accepte la page principale avec une barre oblique finale', async () => {
    const urls = catalogueUrls();
    urls[0] += '/';
    await writeFile(join(dist, 'sitemap.xml'), sitemapWithUrls(urls));
    await expect(verifyProductionBuild(dist)).resolves.toMatchObject({ totalUrls: 800 });
  });
});
