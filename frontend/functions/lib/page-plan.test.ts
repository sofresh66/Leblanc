import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { securityHeaders, type EventDetail, type SupportedLanguage, type TrailDetail } from '@leblanc/shared';
import { placeFixture } from '../../src/components/places/__tests__/fixture';
import { planPage, type PlanDeps } from './page-plan';

const LOCALES = join(__dirname, '../../public/locales');
const locale = (lang: SupportedLanguage, namespace: string) =>
  JSON.parse(readFileSync(join(LOCALES, lang, `${namespace}.json`), 'utf8')) as Record<string, unknown>;

const eventId = 'df0d2109-8eba-4b52-a0cf-4704fccd4314';
const event: EventDetail = {
  id: eventId, title_i18n: { fr: 'Musique ! <script>alert("x")</script>' }, description_i18n: { fr: 'Une exposition' },
  category: 'culture', startDate: '2026-10-01T12:00:00.000Z', endDate: '2026-11-10T16:30:00.000Z',
  timezone: 'Europe/Paris', allDay: false, venueName: 'Château Naillac', address: null, postalCode: '36300',
  city: 'Le Blanc', latitude: 46.63, longitude: 1.06, imageUrl: 'https://centre.media.tourinsoft.eu/musique.jpg',
  isFree: false, priceMin: 3.5, currency: 'EUR', publicUrl: null, source: 'datatourisme',
  title: 'Musique ! <script>alert("x")</script>', description: '<p>Une exposition   sur les pratiques musicales.</p>',
  contentLanguage: 'fr', descriptionLanguage: 'fr', isFallback: false, distance: 1700, occurrences: [],
};

function deps(api: (path: string) => { status: number; body: unknown } | Promise<never>): PlanDeps & { fetchApi: ReturnType<typeof vi.fn> } {
  return {
    siteUrl: 'https://leblanc-et-moi.pages.dev',
    loadLocale: (lang, namespace) => Promise.resolve(locale(lang, namespace)),
    fetchApi: vi.fn((path: string) => Promise.resolve(api(path))),
  };
}

describe('planPage', () => {
  it('sert la racine telle quelle (redirection côté client)', async () => {
    expect(await planPage('/', deps(() => ({ status: 200, body: null })))).toBeNull();
  });

  it('pose le titre, la description, canonical et hreflang ×6 + x-default d’une page statique', async () => {
    const plan = await planPage('/de/karte', deps(() => ({ status: 200, body: null })));
    expect(plan).toMatchObject({ status: 200, lang: 'de' });
    expect(plan?.head.title).toBe(locale('de', 'seo').map && (locale('de', 'seo').map as { title: string }).title);
    const html = plan?.head.tagsHtml ?? '';
    expect(html.match(/rel="alternate"/g)).toHaveLength(7);
    expect(html).toContain('hreflang="fr" href="https://leblanc-et-moi.pages.dev/fr/carte"');
    expect(html).toContain('hreflang="x-default" href="https://leblanc-et-moi.pages.dev/fr/carte"');
    expect(html).toContain('rel="canonical" href="https://leblanc-et-moi.pages.dev/de/karte"');
    expect(html).toContain('content="index, follow"');
    expect(html).toContain('property="og:locale" content="de_DE"');
    expect(html.split('data-rh="true"').length - 1).toBe(html.split('<').length - 1 - (html.match(/<\/script>/g)?.length ?? 0));
  });

  it('sert « Se balader » en 200 avec titre, fil d’Ariane et hreflang des six segments', async () => {
    const d = deps(() => ({ status: 200, body: null }));
    const plan = await planPage('/nl/routes', d);
    expect(plan).toMatchObject({ status: 200, lang: 'nl', head: { title: 'Routes rond Le Blanc — Le Blanc & Moi' } });
    const html = plan?.head.tagsHtml ?? '';
    for (const path of ['/fr/se-balader', '/en/trails', '/es/rutas', '/de/touren', '/it/percorsi', '/nl/routes']) {
      expect(html).toContain(`href="https://leblanc-et-moi.pages.dev${path}"`);
    }
    expect(html).toContain('"name":"Routes"');
    expect(d.fetchApi).not.toHaveBeenCalled();
  });

  describe('fiche parcours', () => {
    const trail: TrailDetail = {
      id: 'c1000000-0000-4000-8000-000000000001', title: 'Rive gauche, rive droite <b>', contentLanguage: 'en',
      modes: ['foot'], isLoop: true, distanceM: 11500, durationMin: 180, durationDays: null, start: { lat: 46.63, lng: 1.17 },
      startCity: 'Fontgombault', distanceFromLeBlancM: 8758, hasTrack: true,
      imageUrl: 'https://centre.media.tourinsoft.eu/upload/rive.jpg', imageCredit: '© Hellio', imageLicense: null,
      officialUrl: 'http://www.parc-naturel-brenne.fr/', producer: 'Destination Brenne', updatedAt: '2026-01-04T00:00:00.000Z',
      description: 'A loop between both banks of the Creuse.', descriptionLanguage: 'en', isFallback: false,
      startPostalCode: '36220', track: null, osmRelationId: null, gpxAvailable: false,
      attributions: [{ source: 'datatourisme', text: 'DATAtourisme', license: 'Licence Ouverte 2.0',
        licenseUrl: 'https://www.etalab.gouv.fr/licence-ouverte-open-licence/', url: 'https://www.datatourisme.fr/', producer: 'Destination Brenne', osmRelationId: null }],
    };

    it('pose titre, description, canonical, hreflang ×6 et og:image de la photo', async () => {
      const d = deps((path) => ({ status: path === `/v1/routes/${trail.id}?lang=en` ? 200 : 500, body: trail }));
      const plan = await planPage(`/en/trails/${trail.id}`, d);
      expect(plan).toMatchObject({ status: 200, lang: 'en', head: { title: 'Rive gauche, rive droite <b> — Le Blanc & Moi' } });
      const html = plan?.head.tagsHtml ?? '';
      expect(html).toContain(`rel="canonical" href="https://leblanc-et-moi.pages.dev/en/trails/${trail.id}"`);
      for (const path of ['/fr/se-balader', '/en/trails', '/es/rutas', '/de/touren', '/it/percorsi', '/nl/routes']) {
        expect(html).toContain(`href="https://leblanc-et-moi.pages.dev${path}/${trail.id}"`);
      }
      expect(html).toContain('property="og:image" content="https://centre.media.tourinsoft.eu/upload/rive.jpg"');
      expect(html).toContain('content="A loop between both banks of the Creuse."');
      expect(html).not.toContain('<b>');
    });

    it('JSON-LD TouristTrip limité aux champs présents dans les données', async () => {
      const plan = await planPage(`/fr/se-balader/${trail.id}`, deps(() => ({ status: 200, body: trail })));
      const html = plan?.head.tagsHtml ?? '';
      const json = /<script[^>]*application\/ld\+json[^>]*>([^<]*)<\/script>/.exec(html)?.[1] ?? '';
      const graph = (JSON.parse(json) as { '@graph': Record<string, unknown>[] })['@graph'];
      const trip = graph.find((node) => node['@type'] === 'TouristTrip');
      expect(trip).toEqual({
        '@type': 'TouristTrip', name: trail.title, description: trail.description,
        url: `https://leblanc-et-moi.pages.dev/fr/se-balader/${trail.id}`, image: trail.imageUrl,
        itinerary: { '@type': 'Place', name: 'Fontgombault', geo: { '@type': 'GeoCoordinates', latitude: 46.63, longitude: 1.17 } },
      });
      // Ni distance, ni durée, ni difficulté, ni organisateur inventés.
      expect(Object.keys(trip ?? {})).not.toEqual(expect.arrayContaining(['distance']));
      expect(json).not.toMatch(/duration|difficulty|organizer|offers/);
    });

    it('sans description ni photo : description factuelle et JSON-LD sans description ni image', async () => {
      const bare = { ...trail, description: '', imageUrl: null };
      const plan = await planPage(`/de/touren/${trail.id}`, deps(() => ({ status: 200, body: bare })));
      const html = plan?.head.tagsHtml ?? '';
      // Balises retirées du titre dans la description (summarizeText).
      expect(html).toContain('name="description" content="Rive gauche, rive droite : 11,5 km lange Tour ab Fontgombault, rund um Le Blanc und in der Brenne."');
      const json = /<script[^>]*application\/ld\+json[^>]*>([^<]*)<\/script>/.exec(html)?.[1] ?? '';
      const trip = (JSON.parse(json) as { '@graph': Record<string, unknown>[] })['@graph'].find((node) => node['@type'] === 'TouristTrip');
      expect(trip).not.toHaveProperty('description');
      expect(trip).not.toHaveProperty('image');
    });

    it('précharge la photo d’en-tête (élément LCP), et rien sans photo', async () => {
      const withPhoto = await planPage(`/fr/se-balader/${trail.id}`, deps(() => ({ status: 200, body: trail })));
      expect(withPhoto?.head.tagsHtml).toContain('<link data-rh="true" rel="preload" as="image" href="https://centre.media.tourinsoft.eu/upload/rive.jpg" fetchpriority="high">');
      const without = await planPage(`/fr/se-balader/${trail.id}`, deps(() => ({ status: 200, body: { ...trail, imageUrl: null } })));
      expect(without?.head.tagsHtml).not.toContain('rel="preload"');
    });

    it('sans photo : image par défaut du site', async () => {
      const plan = await planPage(`/fr/se-balader/${trail.id}`, deps(() => ({ status: 200, body: { ...trail, imageUrl: null } })));
      expect(plan?.head.tagsHtml).toContain('property="og:image" content="https://leblanc-et-moi.pages.dev/images/hero-le-blanc.jpg"');
    });

    it('répond 404 pour un parcours inconnu ou masqué (404 de l’API)', async () => {
      const plan = await planPage(`/de/touren/${trail.id}`, deps(() => ({ status: 404, body: null })));
      expect(plan).toMatchObject({ status: 404, head: { robots: 'noindex, follow' } });
    });
  });

  it.each(['/fr/page-inconnue', '/xx/carte', '/fr/evenements', '/fr/evenements/pas-un-uuid', '/fr/lieux/123', '/fr/se-balader/123'])(
    'répond 404 noindex pour %s sans appeler l’API', async (path) => {
      const d = deps(() => ({ status: 200, body: null }));
      const plan = await planPage(path, d);
      expect(plan?.status).toBe(404);
      expect(plan?.head.robots).toBe('noindex, follow');
      expect(plan?.head.tagsHtml).not.toContain('hreflang');
      expect(plan?.head.tagsHtml).not.toContain('BreadcrumbList');
      expect(d.fetchApi).not.toHaveBeenCalled();
    });

  it('répond 404 quand l’API ne connaît pas la fiche', async () => {
    const plan = await planPage(`/fr/evenements/${eventId}`, deps(() => ({ status: 404, body: null })));
    expect(plan?.status).toBe(404);
  });

  it('sert le HTML générique (fail-open) quand l’API est en panne', async () => {
    expect(await planPage(`/fr/evenements/${eventId}`, deps(() => ({ status: 503, body: null })))).toBeNull();
    const broken = deps(() => Promise.reject(new Error('réseau')));
    await expect(planPage(`/fr/lieux/${placeFixture.id}`, broken)).rejects.toThrow('réseau');
  });

  it('construit le <head> d’un événement : titre, image, JSON-LD Event, valeurs échappées', async () => {
    const d = deps((path) => ({ status: path.startsWith(`/v1/events/${eventId}?lang=en`) ? 200 : 500, body: event }));
    const plan = await planPage(`/en/events/${eventId}`, d);
    expect(plan?.status).toBe(200);
    expect(plan?.head.title).toBe('Musique ! <script>alert("x")</script> — Le Blanc & Moi');
    const html = plan?.head.tagsHtml ?? '';
    expect(html).not.toContain('<script>alert');
    expect(html).toContain('property="og:title" content="Musique ! &lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; — Le Blanc &amp; Moi"');
    expect(html).toContain('name="description" content="Une exposition sur les pratiques musicales."');
    expect(html).toContain('property="og:image" content="https://centre.media.tourinsoft.eu/musique.jpg"');
    const jsonLd = JSON.parse(/<script data-rh="true" type="application\/ld\+json">(.*)<\/script>/.exec(html)?.[1] ?? '{}') as { '@graph': { '@type': string; name?: string }[] };
    expect(jsonLd['@graph'].map((node) => node['@type'])).toEqual(['Organization', 'BreadcrumbList', 'Event']);
    expect(d.fetchApi).toHaveBeenCalledWith(`/v1/events/${eventId}?lang=en`);
  });

  it('nomme le lieu seul dans le fil d’Ariane et sert un Restaurant sans @context imbriqué', async () => {
    const plan = await planPage(`/it/luoghi/${placeFixture.id}`, deps(() => ({ status: 200, body: placeFixture })));
    const html = plan?.head.tagsHtml ?? '';
    const jsonLd = JSON.parse(/application\/ld\+json">(.*)<\/script>/.exec(html)?.[1] ?? '{}') as { '@graph': Record<string, unknown>[] };
    const breadcrumb = jsonLd['@graph'].find((node) => node['@type'] === 'BreadcrumbList') as { itemListElement: { name: string }[] };
    expect(breadcrumb.itemListElement.at(-1)?.name).toBe('La Table');
    const restaurant = jsonLd['@graph'].find((node) => node['@type'] === 'Restaurant');
    expect(restaurant).toMatchObject({ name: 'La Table' });
    expect(restaurant).not.toHaveProperty('@context');
    expect(plan?.head.title).toBe('La Table — Le Blanc & Moi');
  });
});

describe('_headers', () => {
  it('reprend exactement les en-têtes de sécurité du middleware et le cache immuable des assets', () => {
    const file = readFileSync(join(__dirname, '../../public/_headers'), 'utf8');
    expect(file).toContain('/assets/*\n  Cache-Control: public, max-age=31536000, immutable');
    for (const [name, value] of Object.entries(securityHeaders())) expect(file).toContain(`  ${name}: ${value}\n`);
  });

  it('exclut les fichiers statiques du middleware', () => {
    const routes = JSON.parse(readFileSync(join(__dirname, '../../public/_routes.json'), 'utf8')) as { include: string[]; exclude: string[] };
    expect(routes.include).toEqual(['/*']);
    expect(routes.exclude).toEqual(expect.arrayContaining(['/assets/*', '/images/*', '/fonts/*', '/locales/*', '/sitemap.xml', '/robots.txt', '/favicon.svg']));
  });
});
