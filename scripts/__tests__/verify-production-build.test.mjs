import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MIN_SITEMAP_BYTES, verifyProductionBuild } from '../verify-production-build.mjs';

const eventUrl =
  'https://leblanc-et-moi.pages.dev/fr/evenements/12345678-1234-1234-1234-123456789abc';
let dist;

function sitemapOfSize(bytes, url = eventUrl) {
  const xml = `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${url}</loc></url></urlset>`;
  return xml.padEnd(bytes, ' ');
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

  it('accepte un build avec une fiche au-dessus du seuil', async () => {
    await writeFile(join(dist, 'sitemap.xml'), sitemapOfSize(MIN_SITEMAP_BYTES + 1));
    await expect(verifyProductionBuild(dist)).resolves.toEqual({
      sitemapBytes: 50_001,
      eventUrls: 1,
    });
  });

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
    await writeFile(
      join(dist, 'sitemap.xml'),
      sitemapOfSize(51_000, 'https://leblanc-et-moi.pages.dev/fr'),
    );
    await expect(verifyProductionBuild(dist)).rejects.toThrow('Aucune URL de fiche');
  });

  it('refuse les fiches d’une autre origine', async () => {
    await writeFile(
      join(dist, 'sitemap.xml'),
      sitemapOfSize(51_000, eventUrl.replace('leblanc-et-moi.pages.dev', 'example.org')),
    );
    await expect(verifyProductionBuild(dist)).rejects.toThrow('Aucune URL de fiche');
  });
});
