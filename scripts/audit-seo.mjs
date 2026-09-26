/* global document, innerWidth */
import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { gzipSync } from 'node:zlib';

// Démarrer le Worker local et vite preview avant ce contrôle du build de production.
const preview = process.env.SEO_PREVIEW_URL || 'http://127.0.0.1:4173';
const api = process.env.SITEMAP_API_URL || 'http://127.0.0.1:8787/api';
const site = (process.env.VITE_SITE_URL || 'https://leblanc-et-moi.pages.dev').replace(/\/+$/, '');
const output = new URL('../artifacts/lot8-2/', import.meta.url);
await fs.mkdir(output, { recursive: true });
const { items } = await (await fetch(`${api}/v1/events?lang=fr&limit=50`)).json();
assert(items?.length, 'Au moins une fiche réelle est nécessaire');
const chosen = items.reduce((a, b) => (a.title.length > b.title.length ? a : b));
const routes = {
  fr: ['liste', 'carte', 'a-propos', 'evenements'],
  en: ['list', 'map', 'about', 'events'],
  es: ['lista', 'mapa', 'acerca-de', 'eventos'],
  de: ['liste', 'karte', 'ueber-uns', 'veranstaltungen'],
  it: ['lista', 'mappa', 'chi-siamo', 'eventi'],
  nl: ['lijst', 'kaart', 'over-ons', 'evenementen'],
};
const report = { pages: [], errors: [], chunks: [], sample: null };
const browser = await chromium.launch();
let closing = false;
try {
  const context = await browser.newContext({
    viewport: { width: 320, height: 900 },
    reducedMotion: 'reduce',
  });
  // Lire les réponses réelles du Worker local, sans changer la configuration de production.
  await context.route('**/api/**', async (route) => {
    try {
      const url = new URL(route.request().url());
      const response = await context.request.get(
        `${api}${url.pathname.replace(/^\/api/, '')}${url.search}`,
      );
      await route.fulfill({ response });
    } catch (error) {
      if (!closing) report.errors.push(String(error));
    }
  });
  const page = await context.newPage();
  page.on('pageerror', (error) => report.errors.push(error.message));
  for (const [lang, [list, map, about, events]] of Object.entries(routes)) {
    const seo = JSON.parse(
      await fs.readFile(
        new URL(`../frontend/public/locales/${lang}/seo.json`, import.meta.url),
        'utf8',
      ),
    );
    const event = await (await fetch(`${api}/v1/events/${chosen.id}?lang=${lang}`)).json();
    for (const [section, path] of Object.entries({
      home: `/${lang}`,
      list: `/${lang}/${list}`,
      map: `/${lang}/${map}`,
      about: `/${lang}/${about}`,
      event: `/${lang}/${events}/${chosen.id}`,
      notFound: `/${lang}/inexistante`,
    })) {
      const scripts = [];
      const onRequest = (request) => {
        if (request.resourceType() === 'script') scripts.push(request.url());
      };
      page.on('request', onRequest);
      await page.goto(`${preview}${path}?audit=seo`);
      await page.locator('h1').waitFor();
      const title =
        section === 'event'
          ? seo.event.dynamicTitle.replace('{{title}}', event.title)
          : seo[section].title;
      await expect(page).toHaveTitle(title);
      await page.evaluate(() => document.fonts.ready);
      if (section === 'map') await expect(page.locator('.leaflet-container')).toBeVisible();
      const meta = await page.evaluate(() => ({
        title: document.title,
        descriptions: [...document.querySelectorAll('meta[name="description"]')].map(
          (e) => e.content,
        ),
        canonical: [...document.querySelectorAll('link[rel="canonical"]')].map((e) => e.href),
        alternate: [...document.querySelectorAll('link[hreflang]')].map((e) => ({
          lang: e.hreflang,
          href: e.href,
        })),
        og: Object.fromEntries(
          [...document.querySelectorAll('meta[property^="og:"]')].map((e) => [
            e.getAttribute('property'),
            e.content,
          ]),
        ),
        twitter: document.querySelector('meta[name="twitter:card"]')?.content,
        robots: document.querySelector('meta[name="robots"]')?.content,
        json: [...document.querySelectorAll('script[type="application/ld+json"]')].map((e) =>
          JSON.parse(e.textContent),
        ),
        width: innerWidth,
        scrollWidth: document.documentElement.scrollWidth,
        headerRight: Math.max(
          ...[...document.querySelectorAll('header > div > *')].map(
            (e) => e.getBoundingClientRect().right,
          ),
        ),
      }));
      assert.equal(meta.descriptions.length, 1);
      assert(meta.descriptions[0]);
      assert.deepEqual(meta.canonical, [`${site}${path}`]);
      assert.equal(meta.og['og:title'], title);
      assert.equal(meta.og['og:url'], `${site}${path}`);
      assert.equal(meta.og['og:type'], 'website');
      assert(meta.og['og:image'].startsWith('http'));
      assert.equal(meta.twitter, 'summary_large_image');
      assert.equal(meta.json.length, 1);
      assert(meta.json[0]['@graph'].some((e) => e['@type'] === 'Organization'));
      assert(meta.headerRight <= 320, `${lang} ${section} : navigation débordante`);
      if (section === 'notFound') {
        assert.equal(meta.robots, 'noindex, follow');
        assert.equal(meta.alternate.length, 0);
      } else {
        assert.equal(meta.alternate.length, 7);
        for (const [target, segments] of Object.entries(routes)) {
          const suffix = {
            home: '',
            list: `/${segments[0]}`,
            map: `/${segments[1]}`,
            about: `/${segments[2]}`,
            event: `/${segments[3]}/${chosen.id}`,
          }[section];
          assert(
            meta.alternate.some(
              (a) => a.lang === target && a.href === `${site}/${target}${suffix}`,
            ),
          );
        }
        assert.equal(
          meta.alternate.find((a) => a.lang === 'x-default').href,
          meta.alternate.find((a) => a.lang === 'fr').href,
        );
      }
      if (section === 'event') {
        const schema = meta.json[0]['@graph'].find((e) => e['@type'] === 'Event');
        assert.equal(schema.name, event.title);
        assert.equal(schema.startDate, event.startDate);
        assert.equal(schema.location.geo.latitude, event.latitude);
        if (lang === 'fr') {
          report.sample = meta;
          await fs.writeFile(
            new URL('event-head.html', output),
            await page.locator('head').innerHTML(),
          );
        }
      }
      if (section !== 'map')
        assert(!scripts.some((url) => /MapPage.*\.js/.test(url)), 'Leaflet téléchargé hors carte');
      if (section === 'home') {
        await page.locator('button[aria-controls="mobile-navigation"]').click();
        assert.equal(
          await page.locator('#mobile-navigation').evaluate((e) => e.scrollWidth <= e.clientWidth),
          true,
        );
        await page.screenshot({
          path: new URL(`${lang}-menu-320.png`, output).pathname.replace(/^\/(\w:)/, '$1'),
        });
        await page.keyboard.press('Escape');
      }
      await page.screenshot({
        path: new URL(`${lang}-${section}-320.png`, output).pathname.replace(/^\/(\w:)/, '$1'),
      });
      report.pages.push({
        lang,
        section,
        title,
        width: meta.width,
        scrollWidth: meta.scrollWidth,
        headerRight: meta.headerRight,
        alternates: meta.alternate.length,
      });
      page.off('request', onRequest);
    }
  }
  // Navigation SPA : vérifie le remplacement des balises sans doublon ni ancien JSON-LD.
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`${preview}/fr/evenements/${chosen.id}`);
  await expect(page).toHaveTitle(`${chosen.title} — Le Blanc & Moi`);
  await page.locator('header nav a[href="/fr/liste"]').click();
  await expect(page).toHaveTitle('Liste des événements — Le Blanc & Moi');
  assert.equal(await page.locator('meta[name="description"]').count(), 1);
  assert(
    !(await page.locator('script[type="application/ld+json"]').textContent()).includes(
      '"@type":"Event"',
    ),
  );
  await page.locator('header nav a[href="/fr/a-propos"]').focus();
  await page.locator('header nav a[href="/fr/a-propos"]').click();
  await expect(page).toHaveTitle('À propos — Le Blanc & Moi');
  await page.screenshot({
    path: new URL('about-desktop.png', output).pathname.replace(/^\/(\w:)/, '$1'),
  });
  // Les événements inconnus doivent être noindex sans données Event résiduelles.
  await page.goto(`${preview}/fr/evenements/00000000-0000-4000-8000-000000000000`);
  await expect(page).toHaveTitle('Page introuvable — Le Blanc & Moi');
  assert.equal(
    await page.locator('meta[name="robots"]').getAttribute('content'),
    'noindex, follow',
  );
  assert.equal(await page.locator('link[hreflang]').count(), 0);
  assert.deepEqual(report.errors, []);
  closing = true;
  await context.unrouteAll({ behavior: 'wait' });
  await context.close();
} finally {
  closing = true;
  await browser.close();
}
const dist = new URL('../frontend/dist/', import.meta.url);
for (const file of (await fs.readdir(new URL('assets/', dist))).filter((file) =>
  file.endsWith('.js'),
)) {
  const bytes = await fs.readFile(new URL(`assets/${file}`, dist));
  report.chunks.push({ file, bytes: bytes.length, gzip: gzipSync(bytes).length });
}
const sitemap = await fs.readFile(new URL('sitemap.xml', dist), 'utf8');
report.sitemap = { urls: [...sitemap.matchAll(/<loc>(.*?)<\/loc>/g)].map((match) => match[1]) };
assert.equal(new Set(report.sitemap.urls).size, report.sitemap.urls.length);
await fs.writeFile(new URL('browser-audit.json', output), JSON.stringify(report, null, 2));
console.log(
  JSON.stringify(
    {
      pages: report.pages.length,
      errors: report.errors,
      sitemapUrls: report.sitemap.urls.length,
      chunks: report.chunks,
    },
    null,
    2,
  ),
);
