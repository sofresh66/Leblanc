import { expect, test } from '@playwright/test';

test('Un favori ajouté depuis la liste se retrouve sur « Mes favoris », survit au rechargement et se retire', async ({ page }) => {
  await page.goto('/fr/liste');
  const card = page.locator('[data-testid^="event-card-"]').first();
  await expect(card).toBeVisible();
  const eventId = (await card.getAttribute('data-testid'))!.replace('event-card-', '');
  const title = (await card.locator('h3').innerText()).trim();

  const counter = page.getByTestId('favorites-count');
  await expect(counter).toHaveText('0');
  const heart = card.getByRole('button', { name: /aux favoris$/ });
  await expect(heart).toHaveAttribute('aria-pressed', 'false');
  const box = await heart.boundingBox();
  expect(box!.width).toBeGreaterThanOrEqual(44);
  await heart.click();
  await expect(card.getByRole('button', { name: /des favoris$/ })).toHaveAttribute('aria-pressed', 'true');
  await expect(counter).toHaveText('1');

  await page.getByRole('link', { name: /^Mes favoris : 1 événement$/ }).click();
  await expect(page).toHaveURL(/\/fr\/favoris$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Mes favoris');
  await expect(page.getByTestId(`event-card-${eventId}`)).toBeVisible();

  // Persistance : rechargement complet de la page.
  await page.reload();
  await expect(page.getByTestId(`event-card-${eventId}`)).toBeVisible();
  await expect(page.getByTestId('favorites-count')).toHaveText('1');
  expect(await page.evaluate(() => localStorage.getItem('lbm:favorites:v1'))).toContain(eventId);

  // Page personnelle : noindex, ni canonical ni hreflang.
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, follow');
  await expect(page.locator('link[rel="canonical"]')).toHaveCount(0);
  await expect(page.locator('link[rel="alternate"][hreflang]')).toHaveCount(0);

  await page.getByTestId(`event-card-${eventId}`).getByRole('button', { name: `Retirer « ${title} » des favoris` }).click();
  await expect(page.getByTestId('favorites-empty')).toBeVisible();
  await expect(page.getByTestId('favorites-count')).toHaveText('0');
});

test.describe('mobile', () => {
  test.use({ viewport: { width: 360, height: 780 }, isMobile: true, hasTouch: true });

  test('le cœur reste utilisable, le compteur est dans le menu et rien ne déborde', async ({ page }) => {
    await page.goto('/fr/liste');
    const card = page.locator('[data-testid^="event-card-"]').first();
    await expect(card).toBeVisible();
    await card.getByRole('button', { name: /aux favoris$/ }).tap();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.getByRole('button', { name: 'Menu principal' }).tap();
    await expect(page.getByTestId('favorites-count-menu')).toHaveText('1');
    await page.getByRole('link', { name: 'Mes favoris : 1 événement' }).tap();
    await expect(page).toHaveURL(/\/fr\/favoris$/);
    await expect(page.locator('[data-testid^="event-card-"]')).toHaveCount(1);
  });
});

test('Le chemin localisé fonctionne dans une autre langue', async ({ page }) => {
  await page.goto('/en/favorites');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('My favourites');
  await expect(page.getByTestId('favorites-empty')).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, follow');
});
