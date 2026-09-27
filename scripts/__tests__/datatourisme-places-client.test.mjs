import { describe, expect, it, vi } from 'vitest';
import { createDatatourismePlacesClient } from '../lib/datatourisme-places-client.mjs';

const success = (payload = { objects: [], meta: { total: 0, total_pages: 0 } }) => ({
  ok: true,
  json: async () => payload,
});
describe('client DATAtourisme places', () => {
  it('demande une union explicite, six langues et les horaires imbriqués', async () => {
    const fetchImpl = vi.fn(async () => success());
    await createDatatourismePlacesClient({ apiKey: 'secret', fetchImpl }).fetchPage();
    const [url, options] = fetchImpl.mock.calls[0];
    expect(url.pathname).toBe('/v1/placeOfInterest');
    expect(url.searchParams.get('filters')).toContain(
      'type[in]=FoodEstablishment,Restaurant,BarOrPub,CafeOrTeahouse,FastFoodRestaurant,StreetFood',
    );
    expect(url.searchParams.get('fields')).toContain('isLocatedAt.openingHoursSpecification');
    expect(url.searchParams.get('geo_distance')).toBe('46.6333,1.0833,20km');
    expect(url.searchParams.get('lang')).toBe('fr,en,es,de,it,nl');
    expect(url.toString()).not.toContain('secret');
    expect(options).toMatchObject({ headers: { 'X-API-Key': 'secret' }, redirect: 'error' });
  });

  it('conserve le curseur opaque des pages suivantes', async () => {
    const fetchImpl = vi.fn(async () => success());
    await createDatatourismePlacesClient({ apiKey: 'secret', fetchImpl }).fetchPage({
      page: 2,
      nextUrl: '/v1/placeOfInterest?crs=opaque-cursor',
    });
    expect(fetchImpl.mock.calls[0][0].searchParams.get('crs')).toBe('opaque-cursor');
  });

  it.each([
    'https://evil.test/v1/placeOfInterest',
    'http://api.datatourisme.fr/v1/placeOfInterest',
    'https://api.datatourisme.fr/v1/catalog',
    'https://user:password@api.datatourisme.fr/v1/placeOfInterest',
    '/v1/placeOfInterest?api_key=secret',
  ])('refuse une pagination non autorisée %s', async (nextUrl) => {
    const fetchImpl = vi.fn();
    await expect(
      createDatatourismePlacesClient({ apiKey: 'secret', fetchImpl }).fetchPage({ nextUrl }),
    ).rejects.toThrow('pagination');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('réessaie 429 puis 503 avec temporisation', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 429 })
      .mockResolvedValueOnce({ ok: false, status: 503 })
      .mockResolvedValueOnce(success());
    const sleep = vi.fn();
    await createDatatourismePlacesClient({ apiKey: 'secret', fetchImpl, sleep }).fetchPage();
    expect(sleep.mock.calls).toEqual([[1000], [4000]]);
  });

  it('arrête les erreurs réseau après trois essais sans journaliser le secret', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('secret');
    });
    await expect(
      createDatatourismePlacesClient({
        apiKey: 'secret',
        fetchImpl,
        sleep: async () => {},
      }).fetchPage(),
    ).rejects.toThrow('NETWORK_OR_TIMEOUT');
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it('ne réessaie pas 401', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 401 }));
    await expect(
      createDatatourismePlacesClient({ apiKey: 'secret', fetchImpl }).fetchPage(),
    ).rejects.toThrow('HTTP_401');
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it('rejette une réponse tronquée plutôt que de la traiter comme vide', async () => {
    const fetchImpl = vi.fn(async () => success({ objects: [], meta: {} }));
    await expect(
      createDatatourismePlacesClient({ apiKey: 'secret', fetchImpl }).fetchPage(),
    ).rejects.toThrow('INVALID_PAYLOAD');
  });
});
