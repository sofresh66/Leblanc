import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import type { Event } from '@leblanc/shared';
import { discoverEvents } from './fixtures';

let events: Event[];

test.beforeAll(async ({ request }) => {
  events = await discoverEvents(request);
});

test('1. L’accueil affiche des événements réels', async ({ page }) => {
  await page.goto('/fr');
  await expect(page.getByTestId(`event-card-${events[0]!.id}`)).toBeVisible();
  await expect(page.getByTestId('error-state')).toHaveCount(0);
});

test('2. Le filtre culture ne montre que cette catégorie', async ({ page }) => {
  await page.goto('/fr/liste?category=culture');
  const cards = page.locator('[data-testid^="event-card-"]');
  await expect(cards.first()).toBeVisible();
  const count = await cards.count();
  for (let index = 0; index < count; index++) {
    await expect(cards.nth(index)).toContainText('Culture');
  }
});

test('3. Le filtre gratuit ne montre que des événements gratuits', async ({ page }) => {
  await page.goto('/fr/liste?isFree=true');
  const cards = page.locator('[data-testid^="event-card-"]');
  await expect(cards.first()).toBeVisible();
  const count = await cards.count();
  for (let index = 0; index < count; index++) {
    await expect(cards.nth(index)).toContainText('Gratuit');
  }
});

test('4. Le rayon de cinq kilomètres est envoyé en mètres et appliqué', async ({ page }) => {
  const responsePromise = page.waitForResponse((response) =>
    response.url().includes('/api/v1/events?') && response.url().includes('maxDistance=5000'),
  );
  await page.goto('/fr/liste?maxDistance=5000');
  const response = await responsePromise;
  expect(response.ok()).toBe(true);
  const body = await response.json() as { items: Array<{ distance: number }> };
  expect(body.items.length).toBeGreaterThan(0);
  expect(body.items.every((event) => event.distance <= 5000)).toBe(true);
  await expect(page.locator('[data-testid^="event-card-"]').first()).toBeVisible();
});

test('5. Charger plus ajoute la deuxième page sans doublon', async ({ page }) => {
  expect(events.length, 'La pagination nécessite au moins 21 événements actifs').toBeGreaterThan(20);
  await page.goto('/fr/liste');
  const cards = page.locator('[data-testid^="event-card-"]');
  await expect(cards).toHaveCount(20);
  const firstIds = await cards.evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-testid')));
  await page.getByRole('button', { name: /Charger plus/ }).click();
  await expect.poll(() => cards.count()).toBeGreaterThan(20);
  const allIds = await cards.evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-testid')));
  expect(new Set(allIds).size).toBe(allIds.length);
  expect(firstIds.every((id, index) => allIds[index] === id)).toBe(true);
});

test('6. Une fiche réelle affiche ses informations et ses occurrences', async ({ page, request }) => {
  const event = events[0]!;
  const detailResponse = await request.get(`http://localhost:8787/api/v1/events/${event.id}?lang=fr`);
  expect(detailResponse.ok()).toBe(true);
  const detail = await detailResponse.json() as { occurrences: Array<{ id: string }> };
  await page.goto(`/fr/evenements/${event.id}`);
  await expect(page.getByRole('heading', { level: 1 })).toContainText(event.title);
  await expect(page.getByRole('heading', { name: 'Toutes les dates' })).toBeVisible();
  await expect(page.getByTestId('event-occurrence')).toHaveCount(detail.occurrences.length);
  await expect(page.getByText('Lieu', { exact: true })).toBeVisible();
});

test('7. Un identifiant UUID absent affiche le message localisé', async ({ page }) => {
  const ids = new Set(events.map((event) => event.id));
  let missingId = randomUUID();
  while (ids.has(missingId)) missingId = randomUUID();
  await page.goto(`/fr/evenements/${missingId}`);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Cet événement n’existe pas');
  await expect(page.getByTestId('error-state')).toHaveCount(0);
});

test('8. La carte affiche un marqueur et ouvre sa fiche dans une popup', async ({ page }) => {
  await page.route('**/tile.openstreetmap.org/**', (route) => route.abort());
  await page.goto('/fr/carte');
  await expect(page.locator('.leaflet-marker-icon').first()).toBeVisible();
  await page.locator('.leaflet-marker-icon').first().click();
  await expect(page.locator('.leaflet-popup-content a').first()).toBeVisible();
});

test('9. Le changement de langue conserve le filtre de catégorie', async ({ page }) => {
  await page.goto('/fr/liste?category=culture');
  await page.getByTestId('language-switcher').selectOption('en');
  await expect(page).toHaveURL(/\/en\/list\?category=culture/);
  await expect(page.locator('[data-testid^="event-card-"]').first()).toBeVisible();
});

test('10. Une panne réseau affiche une erreur et permet de réessayer', async ({ page }) => {
  await page.route('**/api/v1/events?*', (route) => route.abort('failed'));
  await page.goto('/fr/liste');
  await expect(page.getByTestId('error-state')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Réessayer' })).toBeVisible();
  await page.goto('/fr');
  await expect(page.getByTestId('error-state')).toBeVisible();
});

test('11. Après un 503, le bouton Réessayer recharge la liste', async ({ page }) => {
  let calls = 0;
  await page.route('**/api/v1/events?*', (route) => {
    calls++;
    if (calls === 1) {
      return route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ error: { code: 'SERVICE_UNAVAILABLE', message: 'Réveil du service' } }),
      });
    }
    return route.continue();
  });
  await page.goto('/fr/liste');
  await expect(page.getByTestId('error-state')).toContainText('Le service se réveille');
  await page.getByRole('button', { name: 'Réessayer' }).click();
  await expect(page.locator('[data-testid^="event-card-"]').first()).toBeVisible();
  expect(calls).toBeGreaterThanOrEqual(2);
});
