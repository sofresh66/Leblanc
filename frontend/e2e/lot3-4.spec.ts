import { expect, test } from '@playwright/test';
import { PlaceApiListResponseSchema, type PlaceApi } from '@leblanc/shared';

let realPlace: PlaceApi;

test.beforeAll(async ({ request }) => {
  for (let attempt = 0; attempt < 8; attempt++) {
    const response = await request.get('http://localhost:8787/api/v1/places?lang=fr&limit=50', { timeout: 35_000 });
    if (response.ok()) {
      const data = PlaceApiListResponseSchema.parse(await response.json());
      const place = data.items.find((item) => item.type === 'restaurant') ?? data.items[0];
      if (!place) throw new Error('Les tests E2E nécessitent un lieu publié dans l’API');
      realPlace = place;
      return;
    }
    if (response.status() !== 503) throw new Error(`Découverte des lieux impossible : HTTP ${response.status()}`);
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error('L’API des lieux ne répond toujours pas après huit essais');
});

test('une PlaceCard ouvre la fiche correspondante', async ({ page }) => {
  await page.goto('/fr/ou-manger');
  const card = page.locator('[data-testid^="place-card-"]').first();
  await expect(card).toBeVisible();
  const title = await card.locator('h2').innerText();
  await card.locator('a').click();
  await expect(page).toHaveURL(/\/fr\/lieux\/[0-9a-f-]{36}$/i);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(title);
});

test('le changement de langue conserve l’identifiant de la fiche', async ({ page }) => {
  await page.goto(`/fr/lieux/${realPlace.id}`);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await page.getByTestId('language-switcher').selectOption('en');
  await expect(page).toHaveURL(`/en/places/${realPlace.id}`);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
});

test('un accès direct avec un UUID réel affiche la fiche et son JSON-LD', async ({ page }) => {
  await page.goto(`/fr/lieux/${realPlace.id}`);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(realPlace.title);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'index, follow');
  const scripts = await page.locator('script[type="application/ld+json"]').allTextContents();
  const types = scripts.map((script) => JSON.parse(script) as { '@type'?: string }).map((data) => data['@type']);
  const expectedType = {
    restaurant: 'Restaurant', bar: 'BarOrPub', cafe: 'CafeOrCoffeeShop',
    fast_food: 'FastFoodRestaurant', food_truck: 'FoodEstablishment', other_food: 'FoodEstablishment',
  }[realPlace.type];
  expect(types).toContain(expectedType);
});

test('un UUID invalide affiche la 404 localisée', async ({ page }) => {
  await page.goto('/fr/lieux/invalid-uuid');
  await expect(page.getByRole('heading', { name: 'Lieu introuvable' })).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, follow');
});
