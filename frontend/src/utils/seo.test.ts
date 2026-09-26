import { describe, expect, it, vi } from 'vitest';
import { MockEventsRepository } from '../api/eventsRepository';
import { eventStructuredData, serializeJsonLd } from './seo';
import { generateSitemap } from '../../vite-plugins/sitemap';

async function fixture() {
  const repository = new MockEventsRepository();
  const first = (await repository.listEvents({ lang: 'fr', limit: 1 })).items[0]!;
  return (await repository.getEventById(first.id, 'fr'))!;
}

describe('SEO et sitemap', () => {
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
      );
    const result = await generateSitemap(
      'https://example.test',
      'https://api.example.test/api',
      fetcher,
    );
    expect(result.partial).toBe(false);
    expect(result.count).toBe(30);
    expect(result.xml).toContain(`/de/veranstaltungen/${event.id}`);
    expect(result.xml).toContain('/it/chi-siamo');
    expect(String(fetcher.mock.calls[1]![0])).toContain('cursor=page2');
    expect(new URL(String(fetcher.mock.calls[0]![0])).searchParams.has('from')).toBe(false);
    expect(result.xml).not.toContain('/admin');
    expect(result.robots).toContain('Sitemap: https://example.test/sitemap.xml');
  });

  it('revient aux seules 24 pages en cas de panne pendant la pagination', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({ items: [await fixture()], nextCursor: 'page2', generatedAt: 'now' }),
      )
      .mockRejectedValueOnce(new Error('offline'));
    const result = await generateSitemap('https://example.test', '/api', fetcher);
    expect(result.partial).toBe(true);
    expect(result.count).toBe(24);
    expect(result.xml).not.toContain('/evenements/');
  });

  it('revient aux 24 pages pour une réponse invalide ou HTTP 503', async () => {
    for (const response of [Response.json({ invalid: true }), new Response('', { status: 503 })]) {
      const result = await generateSitemap(
        'https://example.test',
        '/api',
        vi.fn<typeof fetch>().mockResolvedValue(response),
      );
      expect(result.partial).toBe(true);
      expect(result.count).toBe(24);
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
    expect(result.count).toBe(24);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
