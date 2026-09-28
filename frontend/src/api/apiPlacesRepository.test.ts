import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  PlaceApiListResponseSchema,
  PlaceApiSchema,
  PlaceCategoriesResponseSchema,
} from '@leblanc/shared';
import { ApiError, ApiNetworkError } from './apiEventsRepository';
import { ApiPlacesRepository } from './apiPlacesRepository';
import { normalizePlaceListParams, PlaceHttpListParamsSchema } from './placesRepository';

const place = {
  id: 'a1000000-0000-4000-8000-000000000001',
  type: 'restaurant',
  subtypes: ['Restaurant'],
  title_i18n: { fr: 'La Table' },
  description_i18n: { fr: 'Cuisine locale' },
  sourceLanguage: 'fr',
  venueName: null,
  address: '1 rue du Centre',
  postalCode: '36300',
  city: 'Le Blanc',
  latitude: 46.6333,
  longitude: 1.0833,
  phone: null,
  email: null,
  website: null,
  imageUrl: null,
  publicUrl: null,
  cuisines: ['French'],
  priceRangeMin: 12.5,
  priceRangeMax: 30,
  currency: 'EUR',
  priceDetails: [],
  takeaway: null,
  openingHoursStatus: 'provided',
  status: 'published',
  normalizedTitle: 'la table',
  title: 'La Table',
  description: 'Cuisine locale',
  contentLanguage: 'fr',
  isFallback: false,
  distance: 123,
  source: 'datatourisme_places',
  openingHours: [],
  isOpenNow: null,
} as const;

const page = {
  items: [place],
  nextCursor: null,
  generatedAt: '2026-09-28T10:00:00Z',
};
const categories = {
  types: [{ value: 'restaurant', count: 28 }],
  cuisines: [{ value: 'French', count: 20 }],
};

function mockFetch(response: Response) {
  const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(response);
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('contrats HTTP des lieux', () => {
  it('valide le lieu complet, le statut inconnu et la réponse paginée', () => {
    expect(PlaceApiSchema.safeParse(place).success).toBe(true);
    expect(PlaceApiListResponseSchema.safeParse(page).success).toBe(true);
    expect(PlaceApiSchema.safeParse({ ...place, isOpenNow: 'unknown' }).success).toBe(false);
  });

  it('valide les comptes de catégories et rejette les valeurs invalides', () => {
    expect(PlaceCategoriesResponseSchema.safeParse(categories).success).toBe(true);
    expect(PlaceCategoriesResponseSchema.safeParse({ ...categories, types: [{ value: 'restaurant', count: -1 }] }).success).toBe(false);
  });
});

describe('ApiPlacesRepository', () => {
  const repository = new ApiPlacesRepository();

  it('sérialise les types et cuisines répétés, la valeur false et le curseur', async () => {
    const fetchMock = mockFetch(Response.json(page));
    vi.stubEnv('VITE_API_URL', 'https://api.example.test/api/');
    const result = await repository.listPlaces({
      lang: 'en', types: ['restaurant', 'bar'], cuisines: ['French', 'Italian'],
      isOpenNow: false, maxDistance: 5000, cursor: 'page 2', limit: 10,
    });
    const url = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(url.pathname).toBe('/api/v1/places');
    expect(url.searchParams.getAll('type')).toEqual(['restaurant', 'bar']);
    expect(url.searchParams.getAll('cuisine')).toEqual(['French', 'Italian']);
    expect(url.searchParams.get('isOpenNow')).toBe('false');
    expect(url.searchParams.get('maxDistance')).toBe('5000');
    expect(url.searchParams.get('cursor')).toBe('page 2');
    expect(url.searchParams.get('limit')).toBe('10');
    expect(url.searchParams.get('lang')).toBe('en');
    expect(result.items[0]?.isOpenNow).toBeNull();
  });

  it('applique les valeurs par défaut et refuse les filtres invalides avant fetch', async () => {
    const fetchMock = mockFetch(Response.json(page));
    await repository.listPlaces({});
    const url = new URL(String(fetchMock.mock.calls[0]?.[0]), 'https://example.test');
    expect(url.searchParams.get('lang')).toBe('fr');
    expect(url.searchParams.get('limit')).toBe('20');
    await expect(repository.listPlaces({ maxDistance: 20001 })).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('retourne null pour un détail 404 et encode son identifiant', async () => {
    const fetchMock = mockFetch(new Response('', { status: 404 }));
    expect(await repository.getPlaceById('un id/étrange', 'fr')).toBeNull();
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/v1/places/un%20id%2F%C3%A9trange?lang=fr');
  });

  it('valide le détail et les catégories', async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json(place))
      .mockResolvedValueOnce(Response.json(categories));
    vi.stubGlobal('fetch', fetchMock);
    expect((await repository.getPlaceById(place.id, 'en'))?.title).toBe('La Table');
    expect(await repository.listCategories()).toEqual(categories);
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain('/v1/places/categories');
  });

  it('convertit les réponses invalides en ApiError 502', async () => {
    mockFetch(Response.json({ ...page, items: [{ ...place, isOpenNow: 'maybe' }] }));
    await expect(repository.listPlaces({})).rejects.toMatchObject({
      name: 'ApiError', status: 502, code: 'INVALID_RESPONSE',
    });
  });

  it('remonte les erreurs HTTP avec code et identifiant de requête', async () => {
    mockFetch(Response.json({ error: { code: 'BAD_REQUEST', message: 'Filtre invalide', requestId: 'req-1' } }, { status: 400 }));
    await expect(repository.listPlaces({})).rejects.toMatchObject({
      name: 'ApiError', status: 400, code: 'BAD_REQUEST', requestId: 'req-1', message: 'Filtre invalide',
    });
  });

  it('différencie un 503 et une panne réseau', async () => {
    mockFetch(new Response('', { status: 503 }));
    await expect(repository.listPlaces({})).rejects.toMatchObject({
      name: 'ApiError', status: 503,
    });
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockRejectedValue(new TypeError('offline')));
    await expect(repository.listPlaces({})).rejects.toBeInstanceOf(ApiNetworkError);
  });

  it('interrompt la requête après 30 secondes', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockImplementation((_url, options) =>
      new Promise<Response>((_resolve, reject) => {
        options?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
      }),
    ));
    const request = repository.listPlaces({});
    const assertion = expect(request).rejects.toMatchObject({
      name: 'ApiNetworkError', isTimeout: true,
    });
    await vi.advanceTimersByTimeAsync(30_000);
    await assertion;
  });

  it('emploie une clé de cache stable pour les filtres équivalents', () => {
    expect(normalizePlaceListParams({ types: ['restaurant', 'bar', 'restaurant'], cuisines: ['French', 'Italian'] }))
      .toEqual(normalizePlaceListParams({ types: ['bar', 'restaurant'], cuisines: ['Italian', 'French'] }));
    expect(normalizePlaceListParams({ isOpenNow: false })).not.toEqual(normalizePlaceListParams({}));
    expect(normalizePlaceListParams({ cursor: 'next' })).not.toEqual(normalizePlaceListParams({}));
    expect(PlaceHttpListParamsSchema.safeParse({ city: 'Le Blanc' }).success).toBe(false);
  });

  it('conserve la classe ApiError commune aux événements', () => {
    expect(new ApiError(400, 'TEST', 'Erreur')).toBeInstanceOf(ApiError);
  });
});
