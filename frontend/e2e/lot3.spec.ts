import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import type { Event } from '@leblanc/shared';
import { discoverEvents } from './fixtures';

const SCREENSHOTS_DIR = path.resolve('screenshots');

let realEvent: Event;

test.beforeAll(async ({ request }) => {
  realEvent = (await discoverEvents(request))[0]!;
  if (!fs.existsSync(SCREENSHOTS_DIR)) {
    fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
  }
});

test.describe('Lot 3 - Composants UI et fonctionnalités', () => {
  test('1. Affichage de la HomePage avec ses sections et captures d’écran FR + EN', async ({ page }) => {
    // 1a. Accueil en français
    await page.goto('/fr');
    await expect(page.locator('h1')).toContainText('Bienvenue au Blanc & Moi');
    await expect(page.locator('text=Top du moment')).toBeVisible();
    await expect(page.locator('text=Ce week-end')).toBeVisible();
    await expect(page.locator('text=Explorer par thématique')).toBeVisible();
    await expect(page.locator('text=Derniers ajouts')).toBeVisible();

    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, 'home-fr.png'),
      fullPage: true,
    });

    // 1b. Accueil en anglais
    await page.goto('/en');
    await expect(page.locator('h1')).toContainText('Welcome to Le Blanc & Moi');
    await expect(page.locator('text=Highlights')).toBeVisible();
    await expect(page.locator('text=This Weekend')).toBeVisible();
    await expect(page.locator('text=Browse by Theme')).toBeVisible();
    await expect(page.locator('text=Latest Additions')).toBeVisible();

    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, 'home-en.png'),
      fullPage: true,
    });
  });

  test('2. Navigation depuis une EventCard vers la fiche détaillée', async ({ page }) => {
    await page.goto('/fr');
    const firstCardLink = page.locator('[data-testid^="event-card-"]').first().locator('a').first();
    const cardTitle = await firstCardLink.textContent();

    await firstCardLink.click();
    await expect(page).toHaveURL(new RegExp(`/fr/evenements/${realEvent.id}$`));
    if (cardTitle) {
      await expect(page.locator('h1')).toContainText(cardTitle.trim());
    }
  });

  test('3. Filtrage sur ListPage : appliquer un filtre catégorie et capture', async ({ page }) => {
    await page.goto('/fr/liste');
    await expect(page.locator('h1')).toContainText('Agenda complet des événements');

    // Sélectionner la catégorie "culture"
    const categorySelect = page.locator('#category-select');
    await categorySelect.selectOption('culture');

    // Appliquer les filtres
    await page.getByRole('button', { name: 'Appliquer' }).click();

    // Vérifier la mise à jour de l'URL
    await expect(page).toHaveURL(/category=culture/);

    // Vérifier que les cartes affichées possèdent le badge Culture
    const firstCard = page.locator('[data-testid^="event-card-"]').first();
    await expect(firstCard).toBeVisible();
    await expect(firstCard).toContainText('Culture');

    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, 'list-filtered.png'),
      fullPage: true,
    });
  });

  test('4. Filtrage sur ListPage : filtre gratuité + distance', async ({ page }) => {
    await page.goto('/fr/liste');

    // Choisir gratuit uniquement
    const freeRadio = page.locator('input[value="free"]');
    await freeRadio.check({ force: true });

    // Régler le curseur de distance à 10 km
    const distanceRange = page.locator('#distance-range');
    await distanceRange.fill('10');

    await page.getByRole('button', { name: 'Appliquer' }).click();

    await expect(page).toHaveURL(/isFree=true/);
    await expect(page).toHaveURL(/maxDistance=10000/);

    const firstCard = page.locator('[data-testid^="event-card-"]').first();
    await expect(firstCard).toBeVisible();
    await expect(firstCard).toContainText('Gratuit');
  });

  test('5. Réinitialisation des filtres', async ({ page }) => {
    await page.goto('/fr/liste?category=sport&isFree=true');
    await expect(page).toHaveURL(/category=sport/);

    // Cliquer sur le bouton Réinitialiser
    await page.getByRole('button', { name: 'Réinitialiser' }).click();

    // L'URL ne contient plus les filtres
    await expect(page).not.toHaveURL(/category=/);
    await expect(page).not.toHaveURL(/isFree=/);
  });

  test('6. Page événement : affichage des détails et capture d’écran', async ({ page }) => {
    await page.goto(`/fr/evenements/${realEvent.id}`);

    await expect(page.locator('h1')).toContainText(realEvent.title);
    await expect(page.getByTestId('event-occurrence').first()).toBeVisible();

    // Boutons d'actions principaux
    await expect(page.getByRole('link', { name: /Y aller/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Ajouter à mon agenda/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Partager/i })).toBeVisible();

    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, 'event-detail.png'),
      fullPage: true,
    });
  });

  test('7. Page événement : bouton "Ajouter à mon agenda" génère bien le .ics', async ({ page }) => {
    await page.goto(`/fr/evenements/${realEvent.id}`);

    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: /Ajouter à mon agenda/i }).click();
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toContain('.ics');
  });

  test('8. MapPage : affichage du conteneur Leaflet et des marqueurs (NB4 - interception tuiles OSM)', async ({
    page,
  }) => {
    // Intercepter les tuiles OSM publiques selon NB4
    await page.route('**/tile.openstreetmap.org/**', (route) => route.abort());

    await page.goto('/fr/carte');
    await expect(page.locator('h1')).toContainText('Carte des événements');

    // Vérifier la présence du conteneur Leaflet
    const mapContainer = page.locator('.leaflet-container');
    await expect(mapContainer).toBeVisible();

    // Vérifier la présence des marqueurs
    const marker = page.locator('.leaflet-marker-icon').first();
    await expect(marker).toBeVisible();
  });

  test('9. MapPage : clic sur un marqueur ouvre une popup et capture d’écran (NB4)', async ({ page }) => {
    await page.route('**/tile.openstreetmap.org/**', (route) => route.abort());

    await page.goto('/fr/carte');
    const marker = page.locator('.leaflet-marker-icon').first();
    await expect(marker).toBeVisible();
    await marker.click();

    // Vérifier l'ouverture de la popup
    const popup = page.locator('.leaflet-popup-content');
    await expect(popup).toBeVisible();
    await expect(popup.locator('a')).toBeVisible();

    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, 'map-with-popup.png'),
    });
  });

  test('10. Changement de langue depuis ListPage conserve les filtres (NB3)', async ({ page }) => {
    await page.goto('/fr/liste?category=sport');
    await expect(page).toHaveURL(/category=sport/);

    const switcher = page.getByTestId('language-switcher');
    await switcher.selectOption('en');

    // Vérifier que l'URL reste /en/list?category=sport
    await expect(page).toHaveURL(/\/en\/list\?category=sport/);
    await expect(page.locator('h1')).toContainText('Complete Event Calendar');
  });
});
