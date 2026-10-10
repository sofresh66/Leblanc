import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';

// Lot 4 « Se balader » : liste, filtres, carte, sur le Worker local branché à la base Neon dev.
const screenshots = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../artifacts/screenshots');
fs.mkdirSync(screenshots, { recursive: true });

const cards = (page: Page) => page.locator('[data-testid^="trail-card-"]');

async function loadAll(page: Page) {
  const more = page.getByRole('button', { name: 'Voir plus de parcours' });
  const end = page.getByText('Tous les parcours sont affichés.');
  // Le bouton change de nom pendant le chargement : attendre les nouvelles cartes ou la fin de liste.
  while (!(await end.isVisible())) {
    const before = await cards(page).count();
    await more.click();
    await expect.poll(async () => (await cards(page).count()) > before || (await end.isVisible())).toBe(true);
  }
}

test('liste : tracés d’abord, « Tracé non disponible » et fiche officielle ensuite', async ({ page }) => {
  await page.goto('/fr/se-balader');
  await expect(page.getByRole('heading', { level: 1, name: 'Se balader' })).toBeVisible();
  await expect(cards(page).first()).toContainText('Tracé disponible');
  await loadAll(page);
  const tracks = await cards(page).evaluateAll((items) => items.map((item) => item.textContent?.includes('Tracé disponible') ?? false));
  const firstWithout = tracks.indexOf(false);
  expect(firstWithout).toBeGreaterThan(0);
  expect(tracks.slice(firstWithout).every((value) => !value)).toBe(true);
  const without = cards(page).nth(firstWithout);
  await expect(without).toContainText('Tracé non disponible');
  await expect(without.getByRole('link', { name: /fiche officielle/ })).toHaveAttribute('target', '_blank');
  // Boucle inconnue : ni « Boucle » ni « Aller simple ».
  const unknownLoop = await cards(page).evaluateAll((items) => items.filter((item) => {
    const badges = [...item.querySelectorAll('ul li')].map((li) => li.textContent);
    return !badges.includes('Boucle') && !badges.includes('Aller simple');
  }).length);
  expect(unknownLoop).toBeGreaterThan(0);
  await expect(page.getByText('Non', { exact: true })).toHaveCount(0);
  // Capture : une carte avec tracé et, plus bas, les premières sans tracé.
  await page.goto('/fr/se-balader');
  await expect(cards(page).first()).toBeVisible();
  await page.getByRole('group', { name: 'Affichage' }).evaluate((element) => element.scrollIntoView({ block: 'start' }));
  await page.screenshot({ path: path.join(screenshots, 'lot4-liste-desktop.png') });
  await loadAll(page);
  await cards(page).nth(firstWithout).evaluate((element) => element.scrollIntoView({ block: 'center' }));
  await page.screenshot({ path: path.join(screenshots, 'lot4-liste-sans-trace-desktop.png') });
});

test('filtres : à cheval décoché par défaut, filtres reflétés dans l’URL', async ({ page }) => {
  await page.goto('/fr/se-balader');
  const filters = page.getByRole('complementary', { name: 'Filtres' });
  for (const mode of ['À pied', 'Vélo', 'VTT']) await expect(filters.getByRole('checkbox', { name: mode })).toBeChecked();
  await expect(filters.getByRole('checkbox', { name: /À cheval/ })).not.toBeChecked();
  await expect(filters.getByText(/difficult/i)).toHaveCount(0);

  await filters.getByRole('checkbox', { name: /À cheval/ }).check();
  await filters.getByRole('checkbox', { name: 'Avec tracé uniquement' }).check();
  await filters.getByRole('button', { name: 'Appliquer' }).click();
  await expect(page).toHaveURL(/modes=foot%2Cbike%2Cmtb%2Chorse|modes=foot,bike,mtb,horse/);
  await expect(page).toHaveURL(/withTrack=true/);
  await expect(cards(page).first()).toBeVisible();
  const statuses = await cards(page).evaluateAll((items) => items.map((item) => item.textContent?.includes('Tracé disponible')));
  expect(statuses.every(Boolean)).toBe(true);

  // Aucun mode : application impossible, message lié au groupe.
  for (const mode of ['À pied', 'Vélo', 'VTT', /À cheval/]) await filters.getByRole('checkbox', { name: mode }).uncheck();
  await expect(filters.getByRole('alert')).toHaveText('Choisissez au moins un mode.');
  await expect(filters.getByRole('button', { name: 'Appliquer' })).toBeDisabled();
  await filters.getByRole('button', { name: 'Réinitialiser' }).click();
  await expect(page).not.toHaveURL(/modes=|withTrack=/);
});

test('curseur expiré : la première page se recharge sans erreur visible', async ({ page }) => {
  let expired = false;
  await page.route(/\/api\/v1\/routes\?.*cursor=/, async (route) => {
    if (expired) return route.continue();
    expired = true;
    await route.fulfill({ status: 400, contentType: 'application/json',
      body: JSON.stringify({ error: { code: 'CURSOR_EXPIRED', message: 'Curseur expiré : reprenez depuis la première page' } }) });
  });
  await page.goto('/fr/se-balader');
  await expect(cards(page).first()).toBeVisible();
  const firstPage = page.waitForResponse((response) => response.url().includes('/api/v1/routes?') && !response.url().includes('cursor=') && response.ok());
  await page.getByRole('button', { name: 'Voir plus de parcours' }).click();
  await firstPage;
  await expect(cards(page).first()).toBeVisible();
  await expect(page.getByTestId('error-state')).toHaveCount(0);
  await expect(page.getByText(/Curseur expiré/)).toHaveCount(0);
  expect(expired).toBe(true);
});

test('carte : clusters, tracés et attribution ODbL visible', async ({ page }) => {
  const leaflet: string[] = [];
  page.on('request', (request) => { if (/leaflet/i.test(request.url())) leaflet.push(request.url()); });
  await page.goto('/fr/se-balader');
  await expect(cards(page).first()).toBeVisible();
  expect(leaflet).toHaveLength(0);
  await page.getByRole('button', { name: 'Carte' }).click();
  await expect(page).toHaveURL(/view=map/);
  await expect(page.locator('.leaflet-overlay-pane path').first()).toBeVisible();
  expect(await page.locator('.leaflet-overlay-pane path').count()).toBeGreaterThan(10);
  await expect(page.locator('.marker-cluster').first()).toBeVisible();
  await expect(page.locator('.leaflet-control-attribution')).toContainText('Tracés © contributeurs OpenStreetMap, ODbL');
  // Deux liens : dans le contrôle Leaflet et sous la carte.
  await expect(page.getByRole('link', { name: 'Tracés © contributeurs OpenStreetMap, ODbL' })).toHaveCount(2);
  await expect(page.locator('#walk-results > div a[href="https://www.openstreetmap.org/copyright"]').last()).toBeVisible();
  await page.getByRole('group', { name: 'Affichage' }).evaluate((element) => element.scrollIntoView({ block: 'start' }));
  await page.waitForTimeout(2000); // tuiles
  await page.screenshot({ path: path.join(screenshots, 'lot4-carte-desktop.png') });
});

test('six langues : menu, titre et hreflang cohérents', async ({ page }) => {
  const expected = { fr: 'se-balader', en: 'trails', es: 'rutas', de: 'touren', it: 'percorsi', nl: 'routes' };
  await page.goto('/de/touren');
  await expect(page.getByRole('heading', { level: 1, name: 'Touren' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Hauptmenü' }).getByRole('link', { name: 'Touren' })).toHaveAttribute('aria-current', 'page');
  await expect(page).toHaveTitle('Touren rund um Le Blanc — Le Blanc & Moi');
  const alternates = await page.locator('link[rel="alternate"][hreflang]').evaluateAll((links) =>
    Object.fromEntries(links.map((link) => [link.getAttribute('hreflang'), new URL(link.getAttribute('href') ?? '').pathname])));
  for (const [lang, segment] of Object.entries(expected)) expect(alternates[lang]).toBe(`/${lang}/${segment}`);
  for (const [lang, segment] of Object.entries(expected)) {
    await page.goto(`/${lang}/${segment}`);
    await expect(cards(page).first()).toBeVisible();
    await expect(page.getByTestId('error-state')).toHaveCount(0);
  }
});

test('accessibilité : focus clavier visible et contrastes suffisants', async ({ page }) => {
  await page.goto('/fr/se-balader');
  await expect(cards(page).first()).toBeVisible();
  const foot = page.getByRole('checkbox', { name: 'À pied' });
  await foot.focus();
  await page.keyboard.press('Space');
  await expect(foot).not.toBeChecked();
  const ring = await page.evaluate(() => getComputedStyle(document.activeElement?.closest('label') ?? document.body).boxShadow);
  expect(ring).not.toBe('none');
  const ratios = await page.evaluate(() => {
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
    const selectors = ['[data-testid^="trail-card-"] h2', '[data-testid^="trail-card-"] p', '[data-testid^="trail-card-"] li',
      '[data-testid^="trail-card-"] a', 'aside label span', 'aside legend', 'header p'];
    return selectors.flatMap((selector) => [...document.querySelectorAll(selector)].slice(0, 5).map((element) => {
      const [l1, l2] = [luminance(parse(getComputedStyle(element).color)), luminance(background(element))];
      return { selector, ratio: (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05) };
    }));
  });
  for (const { selector, ratio } of ratios) expect(ratio, selector).toBeGreaterThanOrEqual(4.5);
});

test.describe('mobile', () => {
  test.use({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });

  test('menu, filtres repliables, liste et carte sans débordement', async ({ page }) => {
    await page.goto('/fr/se-balader');
    await expect(cards(page).first()).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await expect(page.getByRole('checkbox', { name: 'À pied' })).toBeHidden();
    await page.getByRole('button', { name: 'Afficher les filtres' }).click();
    await expect(page.getByRole('checkbox', { name: 'À pied' })).toBeVisible();
    await page.getByRole('button', { name: 'Masquer les filtres' }).click();
    await cards(page).first().evaluate((element) => element.scrollIntoView({ block: 'start' }));
    await page.screenshot({ path: path.join(screenshots, 'lot4-liste-mobile.png') });
    await page.getByRole('button', { name: 'Menu principal' }).click();
    await expect(page.locator('#mobile-navigation').getByRole('link', { name: /Se balader/ })).toBeVisible();
    await page.screenshot({ path: path.join(screenshots, 'lot4-menu-mobile.png') });
    await page.keyboard.press('Escape');
    await page.goto('/fr/se-balader?view=map');
    await expect(page.locator('.leaflet-overlay-pane path').first()).toBeVisible();
    await expect(page.locator('.leaflet-control-attribution')).toContainText('ODbL');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.locator('.leaflet-container').evaluate((element) => element.scrollIntoView({ block: 'start' }));
    await page.waitForTimeout(2000);
    await page.screenshot({ path: path.join(screenshots, 'lot4-carte-mobile.png') });
  });
});

test.describe('tablette', () => {
  test.use({ viewport: { width: 768, height: 1024 } });

  test('le menu à six entrées tient sans débordement', async ({ page }) => {
    await page.goto('/fr/se-balader');
    await expect(cards(page).first()).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const overflow = await page.locator('body > div header, #root header').first().evaluate((header) => [...header.querySelectorAll('a, button')]
      .some((element) => { const box = element.getBoundingClientRect(); return box.width > 0 && (box.left < 0 || box.right > window.innerWidth); }));
    expect(overflow).toBe(false);
    await page.screenshot({ path: path.join(screenshots, 'lot4-tablette.png') });
  });
});
