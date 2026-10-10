import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';
import pg from 'pg';
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { TRAIL_MODES, TrailListResponseSchema, type SupportedLanguage, type TrailSummary } from '@leblanc/shared';
import { generateSitemap } from '../vite-plugins/sitemap';

// Lot 6 « Se balader » : sitemap, SEO, menu, Crédits et À propos (Worker local, base Neon dev).
const here = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(here, '../../.env') });
const screenshots = path.resolve(here, '../../artifacts/screenshots');
fs.mkdirSync(screenshots, { recursive: true });
const API = 'http://localhost:8787/api';
const PRODUCTION_HOST = 'ep-jolly-dawn-b2ezqckv.c-6.eu-central-1.aws.neon.tech';
const LANGS: SupportedLanguage[] = ['fr', 'en', 'es', 'de', 'it', 'nl'];
const SEGMENTS: Record<SupportedLanguage, string> = { fr: 'se-balader', en: 'trails', es: 'rutas', de: 'touren', it: 'percorsi', nl: 'routes' };
const UUID_WALK = /\/(se-balader|trails|rutas|touren|percorsi|routes)\/[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}<\/loc>/;

async function allTrails(request: APIRequestContext, lang: SupportedLanguage): Promise<TrailSummary[]> {
  const items: TrailSummary[] = [];
  let cursor: string | null = null;
  do {
    const url = `${API}/v1/routes?lang=${lang}&limit=50&modes=${TRAIL_MODES.join(',')}${cursor ? `&cursor=${cursor}` : ''}`;
    const page = TrailListResponseSchema.parse(await (await request.get(url)).json());
    items.push(...page.items);
    cursor = page.nextCursor;
  } while (cursor);
  return items;
}

function readNav(lang: SupportedLanguage): Record<string, string> {
  return JSON.parse(fs.readFileSync(path.resolve(here, `../public/locales/${lang}/nav.json`), 'utf8')) as Record<string, string>;
}

test('sitemap : liste et fiches publiées seulement, alternates, un parcours masqué en sort', async ({ request }) => {
  const databaseUrl = process.env.DATABASE_URL_DIRECT ?? '';
  if (!databaseUrl || new URL(databaseUrl).hostname === PRODUCTION_HOST) throw new Error('Base dev requise pour ce test');
  const published = await allTrails(request, 'fr');
  const first = await generateSitemap('https://leblanc-et-moi.pages.dev', API);
  expect(first.partial).toBe(false);
  expect(first.walkCount).toBe(published.length);
  for (const lang of LANGS) expect(first.xml).toContain(`<loc>https://leblanc-et-moi.pages.dev/${lang}/${SEGMENTS[lang]}</loc>`);
  for (const trail of published) expect(first.xml).toContain(`/fr/se-balader/${trail.id}</loc>`);
  // Toute <loc> de parcours a un identifiant UUID valide.
  const walkLocs = [...first.xml.matchAll(/<loc>[^<]*\/(?:se-balader|trails|rutas|touren|percorsi|routes)\/[^<]+<\/loc>/g)].map(([loc]) => loc);
  expect(walkLocs).toHaveLength(published.length * 6);
  expect(walkLocs.every((loc) => UUID_WALK.test(loc))).toBe(true);
  expect(first.nearLimits).toBe(false);
  console.log(`Sitemap dev : ${first.count} URL, ${first.bytes} octets, ${first.walkCount} parcours`);

  const client = new pg.Client({ connectionString: databaseUrl, connectionTimeoutMillis: 30000 });
  await client.connect();
  const hidden = published[published.length - 1]!.id;
  await client.query(`UPDATE routes SET status = 'hidden' WHERE id = $1`, [hidden]);
  try {
    const second = await generateSitemap('https://leblanc-et-moi.pages.dev', API);
    expect(second.walkCount).toBe(published.length - 1);
    expect(second.xml).not.toContain(hidden);
  } finally {
    await client.query(`UPDATE routes SET status = 'published' WHERE id = $1`, [hidden]);
    await client.end();
  }
});

test('titres des fiches uniques dans chaque langue', async ({ request }) => {
  for (const lang of LANGS) {
    const titles = (await allTrails(request, lang)).map((trail) => trail.title);
    const duplicates = titles.filter((title, index) => titles.indexOf(title) !== index);
    expect(duplicates, lang).toEqual([]);
  }
});

test('liste filtrée : canonical sur la liste sans paramètres', async ({ page }) => {
  await page.goto('/fr/se-balader?withTrack=true&modes=foot%2Chorse&distance=5-10&view=map');
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', /\/fr\/se-balader$/);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'index, follow');
});

async function expectMenu(page: Page, lang: SupportedLanguage, mobile: boolean) {
  const nav = readNav(lang);
  const expected = [nav.home, nav.map, nav.eat, nav.walks, nav.list, nav.about];
  if (mobile) await page.getByRole('button', { name: nav.menu }).click();
  const menu = mobile ? page.locator('#mobile-navigation') : page.getByRole('navigation', { name: nav.menu }).first();
  const labels = (await menu.getByRole('link').allTextContents()).map((text) => text.replace('↗', '').trim());
  expect(labels, `${lang} ${mobile ? 'mobile' : 'desktop'}`).toEqual(expected);
  await expect(menu.getByRole('link', { name: new RegExp(`^${nav.walks}`) })).toHaveAttribute('aria-current', 'page');
  await expect(menu.locator('a[aria-current="page"]')).toHaveCount(1);
  if (mobile) await page.keyboard.press('Escape');
}

for (const [device, viewport, mobile] of [
  ['desktop', { width: 1280, height: 800 }, false],
  ['tablette', { width: 768, height: 1024 }, false],
  ['mobile', { width: 375, height: 812 }, true],
] as const) {
  test(`menu ${device} : ordre et état actif sur la liste et la fiche, six langues`, async ({ page, request }) => {
    await page.setViewportSize(viewport);
    const id = (await allTrails(request, 'fr'))[0]!.id;
    for (const lang of LANGS) {
      await page.goto(`/${lang}/${SEGMENTS[lang]}`);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await expectMenu(page, lang, mobile);
      await page.goto(`/${lang}/${SEGMENTS[lang]}/${id}`);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await expectMenu(page, lang, mobile);
    }
  });
}

test('page Crédits : OSM ODbL 1.0, PNR, GPX, DATAtourisme, producteurs et crédits photo', async ({ page }) => {
  await page.goto('/fr/credits');
  const section = page.getByRole('region', { name: 'Parcours « Se balader »' });
  await expect(section.getByRole('link', { name: /© contributeurs OpenStreetMap, ODbL 1\.0/ })).toHaveAttribute('href', 'https://www.openstreetmap.org/copyright');
  await expect(section.getByRole('link', { name: /Relation 4287018/ })).toHaveAttribute('href', 'https://www.openstreetmap.org/relation/4287018');
  await expect(section.getByText(/fichiers GPX.*ODbL 1\.0/)).toBeVisible();
  await expect(section.getByRole('link', { name: /Licence Ouverte 2\.0/ })).toBeVisible();
  await expect(section.getByRole('listitem').filter({ hasText: 'Destination Brenne' })).toBeVisible();
  const table = section.getByRole('table', { name: 'Crédits des photos des parcours' });
  await expect(table).toBeVisible();
  await expect(table.getByRole('cell', { name: 'Non indiquée' }).first()).toBeVisible();
  await section.scrollIntoViewIfNeeded();
  await section.screenshot({ path: path.join(screenshots, 'lot6-credits-desktop.png') });
  await page.setViewportSize({ width: 375, height: 812 });
  await section.evaluate((element) => element.scrollIntoView({ block: 'start' }));
  await page.screenshot({ path: path.join(screenshots, 'lot6-credits-mobile.png') });
});

test('page À propos : présentation de l’onglet et lien', async ({ page }) => {
  await page.goto('/fr/a-propos');
  const heading = page.getByRole('heading', { level: 2, name: 'Se balader' });
  await expect(heading).toBeVisible();
  await expect(page.getByText(/20 km au plus du Blanc ou dans le Parc naturel régional de la Brenne/)).toBeVisible();
  await expect(page.getByText(/correspondance avec la fiche est sûre/)).toBeVisible();
  await expect(page.getByRole('link', { name: 'Voir les parcours' })).toHaveAttribute('href', '/fr/se-balader');
  await heading.evaluate((element) => element.scrollIntoView({ block: 'center' }));
  await page.screenshot({ path: path.join(screenshots, 'lot6-a-propos-desktop.png') });
  await page.setViewportSize({ width: 375, height: 812 });
  await heading.evaluate((element) => element.scrollIntoView({ block: 'start' }));
  await page.screenshot({ path: path.join(screenshots, 'lot6-a-propos-mobile.png') });
});

test('confidentialité : mention de l’onglet, aucun nouveau tiers chargé', async ({ page }) => {
  const hosts = new Set<string>();
  page.on('request', (request) => hosts.add(new URL(request.url()).hostname));
  await page.goto('/fr/se-balader?view=map');
  await expect(page.locator('.leaflet-overlay-pane path').first()).toBeVisible();
  await page.waitForTimeout(1500); // tuiles
  await page.goto('/fr/se-balader');
  await page.locator('[data-testid^="trail-card-"] h2 a').first().click();
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await page.waitForTimeout(1500);
  // Hôtes autorisés : site et API locaux, fonds OSM, images Tourinsoft (déjà déclarés).
  const unexpected = [...hosts].filter((host) => !['localhost', 'tile.openstreetmap.org'].includes(host) && !host.endsWith('.media.tourinsoft.eu'));
  expect(unexpected).toEqual([]);
  await page.goto('/fr/confidentialite');
  await expect(page.getByText(/L’onglet « Se balader » n’ajoute aucun service tiers/)).toBeVisible();
});
