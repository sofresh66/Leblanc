import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const SCREENSHOTS_DIR = path.resolve('screenshots');

test.beforeAll(() => {
  if (!fs.existsSync(SCREENSHOTS_DIR)) {
    fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
  }
});

test.describe('Multilingual Routing and i18n', () => {
  test('1. Redirection de la racine / vers /fr', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/fr\/?$/);
    await expect(page.locator('h1')).toContainText('Bienvenue au Blanc & Moi');
    expect(await page.getAttribute('html', 'lang')).toBe('fr');
  });

  test('2. Affichage correct des 6 pages d’accueil et captures d’écran', async ({ page }) => {
    const expectations: Record<string, { title: string; htmlLang: string }> = {
      fr: { title: 'Bienvenue au Blanc & Moi', htmlLang: 'fr' },
      en: { title: 'Welcome to Le Blanc & Moi', htmlLang: 'en' },
      es: { title: 'Bienvenido a Le Blanc & Moi', htmlLang: 'es' },
      de: { title: 'Willkommen bei Le Blanc & Moi', htmlLang: 'de' },
      it: { title: 'Benvenuti su Le Blanc & Moi', htmlLang: 'it' },
      nl: { title: 'Welkom bij Le Blanc & Moi', htmlLang: 'nl' },
    };

    for (const [lang, exp] of Object.entries(expectations)) {
      await page.goto(`/${lang}`);
      await expect(page.locator('h1')).toContainText(exp.title);
      expect(await page.getAttribute('html', 'lang')).toBe(exp.htmlLang);

      await page.screenshot({
        path: path.join(SCREENSHOTS_DIR, `home-${lang}.png`),
        fullPage: true,
      });
    }
  });

  test('3. Les 30 routes localisées répondent avec le bon contenu traduit', async ({ page }) => {
    const routesToTest: Array<{ url: string; expectedText: string }> = [
      // FR (5)
      { url: '/fr', expectedText: 'Bienvenue au Blanc & Moi' },
      { url: '/fr/carte', expectedText: 'Carte des événements' },
      { url: '/fr/liste', expectedText: 'Liste des événements' },
      { url: '/fr/evenements/42', expectedText: '42' },
      { url: '/fr/a-propos', expectedText: 'À propos' },

      // EN (5)
      { url: '/en', expectedText: 'Welcome to Le Blanc & Moi' },
      { url: '/en/map', expectedText: 'Event Map' },
      { url: '/en/list', expectedText: 'Event List' },
      { url: '/en/events/42', expectedText: '42' },
      { url: '/en/about', expectedText: 'About' },

      // ES (5)
      { url: '/es', expectedText: 'Bienvenido a Le Blanc & Moi' },
      { url: '/es/mapa', expectedText: 'Mapa de eventos' },
      { url: '/es/lista', expectedText: 'Lista de eventos' },
      { url: '/es/eventos/42', expectedText: '42' },
      { url: '/es/acerca-de', expectedText: 'Acerca de' },

      // DE (5)
      { url: '/de', expectedText: 'Willkommen bei Le Blanc & Moi' },
      { url: '/de/karte', expectedText: 'Veranstaltungskarte' },
      { url: '/de/liste', expectedText: 'Veranstaltungsliste' },
      { url: '/de/veranstaltungen/42', expectedText: '42' },
      { url: '/de/ueber-uns', expectedText: 'Über uns' },

      // IT (5)
      { url: '/it', expectedText: 'Benvenuti su Le Blanc & Moi' },
      { url: '/it/mappa', expectedText: 'Mappa degli eventi' },
      { url: '/it/lista', expectedText: 'Elenco degli eventi' },
      { url: '/it/eventi/42', expectedText: '42' },
      { url: '/it/chi-siamo', expectedText: 'Chi siamo' },

      // NL (5)
      { url: '/nl', expectedText: 'Welkom bij Le Blanc & Moi' },
      { url: '/nl/kaart', expectedText: 'Evenementenkaart' },
      { url: '/nl/lijst', expectedText: 'Evenementenlijst' },
      { url: '/nl/evenementen/42', expectedText: '42' },
      { url: '/nl/over-ons', expectedText: 'Over ons' },
    ];

    expect(routesToTest.length).toBe(30);

    for (const route of routesToTest) {
      await page.goto(route.url);
      await expect(page.locator('main')).toContainText(route.expectedText);
    }
  });

  test('4. Page 404 localisée pour route inconnue et capture d’écran', async ({ page }) => {
    await page.goto('/fr/page-totalement-inconnue');
    await expect(page.locator('h1')).toContainText('Page introuvable');
    await expect(page.locator('main')).toContainText('La page que vous cherchez n\'existe pas.');

    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, 'not-found-fr.png'),
      fullPage: true,
    });
  });

  test('5. Changement de langue via LanguageSwitcher sans rechargement', async ({ page }) => {
    await page.goto('/fr');
    await expect(page.locator('h1')).toContainText('Bienvenue au Blanc & Moi');

    const switcher = page.getByTestId('language-switcher');
    await switcher.selectOption('en');

    await expect(page).toHaveURL(/\/en\/?$/);
    await expect(page.locator('h1')).toContainText('Welcome to Le Blanc & Moi');
    expect(await page.getAttribute('html', 'lang')).toBe('en');
  });

  test('6. Persistance du choix de langue après rechargement', async ({ page }) => {
    await page.goto('/fr');
    const switcher = page.getByTestId('language-switcher');
    await switcher.selectOption('de');
    await expect(page).toHaveURL(/\/de\/?$/);

    // Recharger la page
    await page.reload();
    await expect(page).toHaveURL(/\/de\/?$/);
    await expect(page.locator('h1')).toContainText('Willkommen bei Le Blanc & Moi');
  });

  test('7. Conservation des paramètres d’URL (ID événement) lors du changement de langue', async ({
    page,
  }) => {
    await page.goto('/fr/evenements/abc123');
    await expect(page.locator('main')).toContainText('abc123');

    const switcher = page.getByTestId('language-switcher');
    await switcher.selectOption('en');

    await expect(page).toHaveURL('/en/events/abc123');
    await expect(page.locator('main')).toContainText('You are viewing event: abc123');
  });

  test('8. Capture d’écran avec focus sur le LanguageSwitcher', async ({ page }) => {
    await page.goto('/fr');
    const switcher = page.getByTestId('language-switcher');
    await switcher.focus();

    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, 'language-switcher-header.png'),
    });
  });
});
