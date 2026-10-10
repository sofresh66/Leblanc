import { describe, expect, it, vi } from 'vitest';
import { MockEventsRepository } from '../api/eventsRepository';
import { eventStructuredData, serializeJsonLd } from './seo';
import { generateSitemap } from '../../vite-plugins/sitemap';
import { placeFixture } from '../components/places/__tests__/fixture';

async function fixture() {
  const repository = new MockEventsRepository();
  const first = (await repository.listEvents({ lang: 'fr', limit: 1 })).items[0]!;
  return (await repository.getEventById(first.id, 'fr'))!;
}

describe('SEO et sitemap', () => {
  it('ne déclare ni gratuité ni offre pour un tarif inconnu', async () => {
    const schema = eventStructuredData(
      { ...(await fixture()), isFree: null, priceMin: null },
      'https://example.test/event', 'https://example.test/image',
    );
    expect(schema).not.toHaveProperty('offers');
    expect(schema).not.toHaveProperty('isAccessibleForFree');
  });
  it('sérialise les contenus externes sans fermeture de script HTML', () => {
    const value = { description: '</script><script>alert(1)</script>' };
    const json = serializeJsonLd(value);
    expect(json).not.toContain('<');
    expect(JSON.parse(json)).toEqual(value);
  });

  it('omet prix, adresse, fin et organisateur inconnus', async () => {
    const event = {
      ...(await fixture()),
      isFree: false,
      priceMin: null,
      venueName: null,
      address: null,
      postalCode: null,
      city: null,
      endDate: null,
    };
    const schema = eventStructuredData(
      event,
      'https://example.test/fr/evenements/1',
      'https://example.test/image.jpg',
    );
    expect(schema).not.toHaveProperty('offers');
    expect(schema).not.toHaveProperty('organizer');
    expect(schema).not.toHaveProperty('endDate');
    expect(schema.location).not.toHaveProperty('address');
    expect(schema.location).toHaveProperty('geo.latitude', event.latitude);
  });

  it('représente un événement gratuit avec une offre à zéro', async () => {
    const schema = eventStructuredData(
      { ...(await fixture()), isFree: true },
      'https://example.test/event',
      'https://example.test/image',
    );
    expect(schema.offers).toHaveProperty('price', 0);
  });

  it('suit les curseurs, déduplique et traduit les URLs du sitemap', async () => {
    const event = await fixture();
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({ items: [event], nextCursor: 'page2', generatedAt: 'now' }),
      )
      .mockResolvedValueOnce(
        Response.json({ items: [event], nextCursor: null, generatedAt: 'now' }),
      )
      .mockResolvedValueOnce(
        Response.json({ items: [placeFixture], nextCursor: null, generatedAt: new Date().toISOString() }),
      )
      .mockResolvedValueOnce(Response.json({ items: [], nextCursor: null, attributions: [], generatedAt: new Date().toISOString() }));
    const result = await generateSitemap(
      'https://example.test',
      'https://api.example.test/api',
      fetcher,
    );
    expect(result.partial).toBe(false);
    expect(result.count).toBe(60);
    expect(result.xml).toContain(`/de/veranstaltungen/${event.id}`);
    expect(result.xml).toContain(`/nl/plekken/${placeFixture.id}`);
    expect(result.xml).toContain('/it/chi-siamo');
    for (const path of ["/fr/ou-manger","/en/where-to-eat","/es/donde-comer","/de/wo-essen","/it/dove-mangiare","/nl/waar-eten"]) expect(result.xml).toContain(path);
    for (const path of ['/fr/confidentialite', '/en/privacy', '/es/privacidad', '/de/datenschutz', '/it/privacy', '/nl/privacy']) expect(result.xml).toContain(path);
    for (const path of ['/fr/credits', '/en/credits', '/es/creditos', '/de/bildnachweise', '/it/crediti', '/nl/credits']) expect(result.xml).toContain(path);
    expect(String(fetcher.mock.calls[1]![0])).toContain('cursor=page2');
    expect(new URL(String(fetcher.mock.calls[0]![0])).searchParams.has('from')).toBe(false);
    expect(result.xml).not.toContain('/admin');
    expect(result.robots).toContain('Sitemap: https://example.test/sitemap.xml');
  });

  it('ajoute lastmod : mise à jour du contenu pour les fiches, date du build sinon', async () => {
    const event = { ...await fixture(), updatedAt: '2026-09-16T00:00:00.000Z' };
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ items: [event], nextCursor: null, generatedAt: 'now' }))
      .mockResolvedValueOnce(Response.json({ items: [placeFixture], nextCursor: null, generatedAt: new Date().toISOString() }))
      .mockResolvedValueOnce(Response.json({ items: [], nextCursor: null, attributions: [], generatedAt: new Date().toISOString() }));
    const result = await generateSitemap('https://example.test', '/api', fetcher, new Date('2026-10-08T03:00:00Z'));
    expect(result.xml).toContain(`<loc>https://example.test/fr/evenements/${event.id}</loc><lastmod>2026-09-16</lastmod>`);
    expect(result.xml).toContain(`<loc>https://example.test/fr/lieux/${placeFixture.id}</loc><lastmod>2026-10-08</lastmod>`);
    expect(result.xml).toContain('<loc>https://example.test/fr/carte</loc><lastmod>2026-10-08</lastmod>');
    expect(result.xml.match(/<url>/g)?.length).toBe(result.xml.match(/<lastmod>/g)?.length);
  });

  it('pagine les lieux, déduplique les IDs et ignore les lieux non publiés', async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ items: [], nextCursor: null, generatedAt: 'now' }))
      .mockResolvedValueOnce(Response.json({ items: [placeFixture], nextCursor: 'page2', generatedAt: new Date().toISOString() }))
      .mockResolvedValueOnce(Response.json({ items: [placeFixture, { ...placeFixture, id: 'a1000000-0000-4000-8000-000000000002', status: 'hidden' }], nextCursor: null, generatedAt: new Date().toISOString() }))
      .mockResolvedValueOnce(Response.json({ items: [], nextCursor: null, attributions: [], generatedAt: new Date().toISOString() }));
    const result = await generateSitemap('https://example.test', '/api', fetcher);
    expect(result.partial).toBe(false);
    expect(result.count).toBe(54);
    // Six <loc> (une par langue) ; l'identifiant figure aussi dans les alternates.
    expect(result.xml.match(new RegExp(`<loc>[^<]*${placeFixture.id}</loc>`, 'g'))).toHaveLength(6);
    expect(String(fetcher.mock.calls[2]![0])).toContain('cursor=page2');
  });

  it('conserve les événements si la collecte des lieux échoue', async () => {
    const event = await fixture();
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ items: [event], nextCursor: null, generatedAt: 'now' }))
      .mockRejectedValueOnce(new Error('places offline'));
    const result = await generateSitemap('https://example.test', '/api', fetcher);
    expect(result.partial).toBe(true);
    expect(result.count).toBe(54);
    expect(result.xml).toContain(event.id);
    expect(result.xml).not.toContain(placeFixture.id);
  });

  it('revient aux seules 48 pages principales en cas de panne pendant la pagination', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({ items: [await fixture()], nextCursor: 'page2', generatedAt: 'now' }),
      )
      .mockRejectedValueOnce(new Error('offline'))
      .mockRejectedValueOnce(new Error('offline'));
    const result = await generateSitemap('https://example.test', '/api', fetcher);
    expect(result.partial).toBe(true);
    expect(result.count).toBe(48);
    expect(result.xml).not.toContain('/evenements/');
  });

  it('revient aux 48 pages principales pour une réponse invalide ou HTTP 503', async () => {
    for (const response of [Response.json({ invalid: true }), new Response('', { status: 503 })]) {
      const result = await generateSitemap(
        'https://example.test',
        '/api',
        vi.fn<typeof fetch>().mockResolvedValue(response),
      );
      expect(result.partial).toBe(true);
      expect(result.count).toBe(48);
    }
  });

  it('interrompt un curseur répété au lieu de boucler indéfiniment', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementation(async () =>
        Response.json({ items: [await fixture()], nextCursor: 'loop', generatedAt: 'now' }),
      );
    const result = await generateSitemap('https://example.test', '/api', fetcher);
    expect(result.partial).toBe(true);
    expect(result.count).toBe(48);
    // Événements : 2 appels (curseur répété) ; lieux : 1 (réponse invalide) ; parcours : 2.
    expect(fetcher).toHaveBeenCalledTimes(5);
  });

  describe('parcours', () => {
    const trailId = 'c1000000-0000-4000-8000-000000000001';
    const trail = {
      id: trailId, title: 'Rive gauche, rive droite', contentLanguage: 'fr', modes: ['foot'], isLoop: true,
      distanceM: 11500, durationMin: 180, durationDays: null, start: { lat: 46.63, lng: 1.17 }, startCity: 'Fontgombault',
      distanceFromLeBlancM: 8758, hasTrack: true, imageUrl: null, imageCredit: null, imageLicense: null,
      officialUrl: null, producer: 'Destination Brenne', updatedAt: '2026-01-04T00:00:00.000Z',
    };
    const empty = () => Response.json({ items: [], nextCursor: null, generatedAt: new Date().toISOString() });

    it('ajoute la liste et les fiches publiées, tous modes, avec alternates ×6 et x-default', async () => {
      const fetcher = vi.fn<typeof fetch>()
        .mockResolvedValueOnce(empty()).mockResolvedValueOnce(empty())
        .mockResolvedValueOnce(Response.json({ items: [trail, { ...trail, id: 'pas-un-uuid' }, { ...trail, id: undefined }],
          nextCursor: null, attributions: [], generatedAt: new Date().toISOString() }));
      const result = await generateSitemap('https://example.test', '/api', fetcher);
      expect(result.partial).toBe(false);
      expect(result.walkCount).toBe(1);
      expect(result.count).toBe((8 + 1) * 6);
      const request = new URL(String(fetcher.mock.calls[2]![0]));
      expect(request.pathname).toBe('/api/v1/routes');
      expect(request.searchParams.get('modes')).toBe('foot,bike,mtb,horse');
      for (const path of ['/fr/se-balader', '/en/trails', '/es/rutas', '/de/touren', '/it/percorsi', '/nl/routes']) {
        expect(result.xml).toContain(`<loc>https://example.test${path}</loc>`);
        expect(result.xml).toContain(`<loc>https://example.test${path}/${trailId}</loc><lastmod>2026-01-04</lastmod>`);
      }
      const entry = result.xml.split('\n').find((line) => line.includes(`<loc>https://example.test/de/touren/${trailId}</loc>`)) ?? '';
      for (const [lang, path] of [['fr', 'se-balader'], ['en', 'trails'], ['es', 'rutas'], ['de', 'touren'], ['it', 'percorsi'], ['nl', 'routes'], ['x-default', 'se-balader']]) {
        expect(entry).toContain(`<xhtml:link rel="alternate" hreflang="${lang}" href="https://example.test/${lang === 'x-default' ? 'fr' : lang}/${path}/${trailId}"/>`);
      }
      expect(result.xml).toContain('xmlns:xhtml="http://www.w3.org/1999/xhtml"');
      // Aucune URL invalide.
      expect(result.xml).not.toContain('pas-un-uuid');
      expect(result.xml).not.toContain('undefined');
      expect(result.nearLimits).toBe(false);
    });

    it('sans réponse de l’API des parcours : sitemap partiel, autres fiches conservées', async () => {
      const fetcher = vi.fn<typeof fetch>()
        .mockResolvedValueOnce(empty())
        .mockResolvedValueOnce(Response.json({ items: [placeFixture], nextCursor: null, generatedAt: new Date().toISOString() }))
        .mockResolvedValueOnce(new Response('{}', { status: 503 }));
      const result = await generateSitemap('https://example.test', '/api', fetcher);
      expect(result.partial).toBe(true);
      expect(result.walkCount).toBe(0);
      expect(result.xml).toContain(placeFixture.id);
      expect(result.xml).toContain('<loc>https://example.test/fr/se-balader</loc>');
    });
  });
});
