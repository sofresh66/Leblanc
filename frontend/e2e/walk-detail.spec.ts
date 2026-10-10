import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { TrailListResponseSchema, TrailNearbyResponseSchema, type TrailSummary } from '@leblanc/shared';

// Lot 5 « Se balader » : fiche parcours, sur le Worker local branché à la base Neon dev.
const screenshots = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../artifacts/screenshots');
fs.mkdirSync(screenshots, { recursive: true });
const API = 'http://localhost:8787/api/v1';

let tracked: TrailSummary;
let untracked: TrailSummary;

test.beforeAll(async ({ request }) => {
  const withTrack = TrailListResponseSchema.parse(await (await request.get(`${API}/routes?with_track=true&limit=5`)).json());
  const without = TrailListResponseSchema.parse(await (await request.get(`${API}/routes?with_track=false&limit=50`)).json());
  const first = withTrack.items[0];
  const second = without.items.find((item) => item.officialUrl !== null && item.imageUrl !== null);
  if (!first || !second) throw new Error('Fixtures dev insuffisantes : un parcours avec tracé et un sans tracé sont nécessaires');
  [tracked, untracked] = [first, second];
});

const contrastRatios = (page: Page, selectors: string[]) => page.evaluate((list) => {
  const luminance = (rgb: number[]) => {
    const [r, g, b] = rgb.map((value) => { const c = value / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
    return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0);
  };
  const parse = (color: string) => (color.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
  const background = (element: Element | null): number[] => {
    for (let node = element; node; node = node.parentElement) {
      const color = getComputedStyle(node).backgroundColor;
      if (!/rgba\(.*, 0\)$/.test(color) && color !== 'transparent') return parse(color);
    }
    return [255, 255, 255];
  };
  return list.flatMap((selector) => [...document.querySelectorAll(selector)].slice(0, 6).map((element) => {
    const [l1, l2] = [luminance(parse(getComputedStyle(element).color)), luminance(background(element))];
    return { selector, ratio: (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05) };
  }));
}, selectors);

test('depuis la liste filtrée : fiche, puis retour avec les mêmes filtres', async ({ page }) => {
  await page.goto('/fr/se-balader?withTrack=true&modes=foot%2Cbike%2Cmtb%2Chorse');
  const link = page.getByRole('link', { name: tracked.title, exact: true });
  await link.click();
  await expect(page).toHaveURL(new RegExp(`/fr/se-balader/${tracked.id}$`));
  await expect(page.getByRole('heading', { level: 1, name: tracked.title })).toBeVisible();
  await page.getByRole('link', { name: 'Retour aux parcours' }).click();
  await expect(page).toHaveURL(/\/fr\/se-balader\?withTrack=true&modes=foot%2Cbike%2Cmtb%2Chorse$/);
  await expect(page.getByRole('checkbox', { name: 'Avec tracé uniquement' })).toBeChecked();
  await expect(page.getByRole('checkbox', { name: /À cheval/ })).toBeChecked();
});

test('depuis la carte : la popup mène à la fiche', async ({ page }) => {
  await page.goto('/fr/se-balader?view=map');
  await expect(page.locator('.leaflet-overlay-pane path').first()).toBeVisible();
  // Premier départ isolé (hors grappe) visible sur la carte.
  const marker = page.locator('.leaflet-marker-icon.custom-trail-marker').first();
  await marker.click();
  await page.locator('.leaflet-popup').getByRole('link', { name: 'Voir' }).click();
  await expect(page).toHaveURL(/\/fr\/se-balader\/[0-9a-f-]{36}$/);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
});

test('fiche avec tracé : carte, attribution ODbL et relation, GPX téléchargeable', async ({ page }) => {
  await page.goto(`/fr/se-balader/${tracked.id}`);
  await expect(page.getByRole('heading', { level: 1, name: tracked.title })).toBeVisible();
  await expect(page.locator('.leaflet-overlay-pane path')).toHaveCount(1);
  await expect(page.locator('.leaflet-control-attribution')).toContainText('Tracés © contributeurs OpenStreetMap, ODbL');
  const relation = page.getByRole('link', { name: /^Relation OpenStreetMap \d+$/ });
  await expect(relation).toHaveAttribute('href', /^https:\/\/www\.openstreetmap\.org\/relation\/\d+$/);
  const download = page.waitForEvent('download');
  await page.getByRole('link', { name: 'Télécharger le GPX' }).click();
  const file = await (await download).path();
  const gpx = fs.readFileSync(file, 'utf8');
  expect(gpx).toContain('<gpx version="1.1"');
  expect(gpx).toContain('<license>https://opendatacommons.org/licenses/odbl/1-0/</license>');
  expect(gpx).toMatch(/<trkpt lat="[\d.]+" lon="[\d.]+"\/>/);
  await expect(page.getByText(/Fiche : DATAtourisme/)).toBeVisible();
  // « À proximité » : affiché si et seulement si l'API renvoie quelque chose.
  const nearby = TrailNearbyResponseSchema.parse(await (await page.request.get(`${API}/routes/${tracked.id}/nearby?lang=fr`)).json());
  const section = page.getByRole('region', { name: 'À proximité du départ' });
  if (nearby.events.length + nearby.places.length > 0) {
    await expect(section).toBeVisible();
    const first = nearby.places[0] ?? nearby.events[0];
    if (first) await expect(section.getByRole('link', { name: first.title }).first()).toHaveAttribute('href', /\/fr\/(lieux|evenements)\//);
  } else {
    await expect(section).toHaveCount(0);
  }
  await page.waitForTimeout(1500); // tuiles
  await page.screenshot({ path: path.join(screenshots, 'lot5-fiche-trace-desktop.png') });
  await page.getByRole('heading', { name: 'Tracé et point de départ' }).evaluate((element) => element.scrollIntoView({ block: 'start' }));
  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(screenshots, 'lot5-fiche-trace-carte-desktop.png') });
});

test('fiche sans tracé : départ seul, « Tracé non disponible », fiche officielle, pas de GPX', async ({ page }) => {
  await page.goto(`/fr/se-balader/${untracked.id}`);
  await expect(page.getByRole('heading', { level: 1, name: untracked.title })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Télécharger le GPX' })).toHaveCount(0);
  await expect(page.getByText('Tracé non disponible : seul le point de départ est indiqué sur la carte.')).toBeVisible();
  await expect(page.locator('.leaflet-marker-icon')).toHaveCount(1);
  await expect(page.locator('.leaflet-overlay-pane path')).toHaveCount(0);
  await expect(page.locator('.leaflet-control-attribution')).not.toContainText('ODbL');
  const official = page.getByRole('link', { name: new RegExp(`Fiche officielle de « ${untracked.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} »`) });
  await expect(official.first()).toHaveAttribute('target', '_blank');
  await page.getByRole('heading', { name: 'Tracé et point de départ' }).evaluate((element) => element.scrollIntoView({ block: 'center' }));
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(screenshots, 'lot5-fiche-sans-trace-desktop.png') });
});

test('404 : identifiant inconnu ou invalide', async ({ page }) => {
  await page.goto(`/fr/se-balader/${randomUUID()}`);
  await expect(page.getByText('Parcours introuvable')).toBeVisible();
  await page.goto('/fr/se-balader/pas-un-uuid');
  await expect(page.getByText('Parcours introuvable')).toBeVisible();
});

test('six langues : fiche, titre de page et hreflang', async ({ page }) => {
  const segments = { fr: 'se-balader', en: 'trails', es: 'rutas', de: 'touren', it: 'percorsi', nl: 'routes' };
  for (const [lang, segment] of Object.entries(segments)) {
    await page.goto(`/${lang}/${segment}/${tracked.id}`);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByTestId('error-state')).toHaveCount(0);
    await expect(page).toHaveTitle(/— Le Blanc & Moi$/);
  }
  const alternates = await page.locator('link[rel="alternate"][hreflang]').evaluateAll((links) =>
    Object.fromEntries(links.map((link) => [link.getAttribute('hreflang'), new URL(link.getAttribute('href') ?? '').pathname])));
  for (const [lang, segment] of Object.entries(segments)) expect(alternates[lang]).toBe(`/${lang}/${segment}/${tracked.id}`);
});

test('accessibilité : focus clavier et contrastes', async ({ page }) => {
  await page.goto(`/fr/se-balader/${tracked.id}`);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  const gpx = page.getByRole('link', { name: 'Télécharger le GPX' });
  await gpx.focus();
  expect(await gpx.evaluate((element) => element === document.activeElement)).toBe(true);
  const outline = await gpx.evaluate((element) => { const style = getComputedStyle(element); return `${style.outlineStyle} ${style.boxShadow}`; });
  expect(outline).not.toBe('none none');
  const ratios = await contrastRatios(page, ['article section h2', 'article section p', 'article dl dt', 'article dl dd', 'article section a', 'nav[aria-label="Fil d’Ariane"] li']);
  for (const { selector, ratio } of ratios) expect(ratio, selector).toBeGreaterThanOrEqual(4.5);
});

test.describe('mobile', () => {
  test.use({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });

  test('fiche lisible sans débordement, boutons pleine largeur', async ({ page }) => {
    await page.goto(`/fr/se-balader/${tracked.id}`);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const width = await page.getByRole('link', { name: 'Télécharger le GPX' }).evaluate((element) => element.getBoundingClientRect().width);
    expect(width).toBeGreaterThan(300);
    await page.screenshot({ path: path.join(screenshots, 'lot5-fiche-mobile.png') });
    await page.getByRole('heading', { name: 'Tracé et point de départ' }).evaluate((element) => element.scrollIntoView({ block: 'start' }));
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(screenshots, 'lot5-fiche-carte-mobile.png') });
    await page.goto(`/fr/se-balader/${untracked.id}`);
    await expect(page.getByText(/Tracé non disponible/)).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
});
