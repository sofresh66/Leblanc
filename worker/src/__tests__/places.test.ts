import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PlaceApiSchema, PlaceApiListResponseSchema } from '@leblanc/shared';
import { handleRequest } from '../index.js';
import { listPlacesFromDb } from '../db/places.js';
import { computeIsOpenNow, mapDbRowToPlace, type PlaceDbRow } from '../mappers/place.js';
import { decodePlaceCursor, parsePlaceListQuery } from '../validation/placesQuery.js';

const { executeQuery } = vi.hoisted(() => ({ executeQuery: vi.fn() }));
vi.mock('../db/client.js', async (original) => ({
  ...await original<typeof import('../db/client.js')>(),
  executeQuery,
}));

const id = 'a1000000-0000-4000-8000-000000000001';
const ruleId = 'b1000000-0000-4000-8000-000000000001';
const now = new Date('2026-09-28T10:00:00Z'); // lundi, 12 h à Paris
const rule = {
  id: ruleId, placeId: id, validFrom: null, validThrough: null,
  dayOfWeek: [1], opens: '11:00:00', closes: '14:00:00', weekOfMonth: null,
};
const row: PlaceDbRow = {
  id, type: 'restaurant', subtypes: ['Restaurant'],
  title_i18n: { fr: 'La Table', en: 'The Table' },
  description_i18n: { fr: 'Cuisine locale' }, source_language: 'fr',
  venue_name: null, address: '1 rue du Centre', postal_code: '36300', city: 'Le Blanc',
  latitude: 46.6333, longitude: 1.0833, phone: null, email: null, website: null,
  image_url: null, public_url: null, cuisines: ['French'],
  price_range_min: '12.50', price_range_max: '30.00', currency: 'EUR',
  price_details: [], takeaway: null, opening_hours_status: 'provided',
  status: 'published', normalized_title: 'la table', source: 'datatourisme_places',
  distance_m: 123.456, opening_hours: [rule],
};
const query = (search: string) => parsePlaceListQuery(new URL(`https://example.test/api/v1/places${search}`));

beforeEach(() => { executeQuery.mockReset(); });

describe('validation des lieux', () => {
  it('accepte les types et cuisines répétés ou séparés par virgules', () => {
    expect(query('?type=restaurant,bar&type=cafe&cuisine=French&cuisine=Italian,Asian&isOpenNow=false'))
      .toMatchObject({ types: ['restaurant', 'bar', 'cafe'], cuisines: ['French', 'Italian', 'Asian'], isOpenNow: false });
    expect(query('')).toMatchObject({ lang: 'fr', maxDistance: 20000, limit: 20 });
  });

  it.each(['yes', '1', '', 'TRUE'])('rejette isOpenNow=%s', (value) => {
    expect(() => query(`?isOpenNow=${value}`)).toThrow();
  });

  it.each(['?lang=pt', '?type=invalid', '?cuisine=', '?maxDistance=20001', '?maxDistance=0',
    '?limit=0', '?limit=51', '?limit=2.5', '?cursor=@@', '?unknown=x'])('rejette %s', (search) => {
    expect(() => query(search)).toThrow();
  });
});

describe('horaires Europe/Paris', () => {
  it('renvoie inconnu sans horaires et fermé sans règle du jour', () => {
    expect(computeIsOpenNow([], now)).toBeNull();
    expect(computeIsOpenNow([{ ...rule, dayOfWeek: [2] }], now)).toBe(false);
  });
  it('détecte un créneau actif et un créneau terminé', () => {
    expect(computeIsOpenNow([rule], now)).toBe(true);
    expect(computeIsOpenNow([rule], new Date('2026-09-28T15:00:00Z'))).toBe(false);
  });
  it('gère la nuit en tenant compte du jour de départ', () => {
    const night = { ...rule, opens: '22:00:00', closes: '02:00:00' };
    expect(computeIsOpenNow([night], new Date('2026-09-28T23:00:00Z'))).toBe(true);
    expect(computeIsOpenNow([night], new Date('2026-09-29T01:00:00Z'))).toBe(false);
  });
  it('renvoie inconnu pour opens == closes', () => {
    expect(computeIsOpenNow([{ ...rule, opens: '00:00:00', closes: '00:00:00' }], now)).toBeNull();
  });
  it('respecte les dates saisonnières et Week0 (dernière semaine)', () => {
    expect(computeIsOpenNow([{ ...rule, validFrom: '2026-10-01' }], now)).toBe(false);
    expect(computeIsOpenNow([{ ...rule, weekOfMonth: 0 }], now)).toBe(true);
    expect(computeIsOpenNow([{ ...rule, weekOfMonth: 1 }], now)).toBe(false);
  });
});

describe('mapping et SQL des lieux', () => {
  it('résout les traductions, les prix, les horaires et le fallback', () => {
    const place = mapDbRowToPlace(row, 'en', now);
    expect(PlaceApiSchema.parse(place)).toEqual(place);
    expect(place).toMatchObject({ title: 'The Table', description: 'Cuisine locale',
      contentLanguage: 'en', isFallback: false, distance: 123, priceRangeMin: 12.5, isOpenNow: true });
    const fallback = mapDbRowToPlace({ ...row, title_i18n: JSON.stringify({ fr: 'La Table' }),
      opening_hours: JSON.stringify([rule]) }, 'nl', now);
    expect(fallback).toMatchObject({ title: 'La Table', contentLanguage: 'fr', isFallback: true });
  });

  it('construit un curseur avec distance non arrondie et id', async () => {
    const second = { ...row, id: 'a1000000-0000-4000-8000-000000000002', distance_m: 123.789 };
    executeQuery.mockResolvedValue([row, second]);
    const result = await listPlacesFromDb('db', query('?limit=1'), now);
    expect(result.items).toHaveLength(1);
    expect(decodePlaceCursor(result.nextCursor ?? '')).toEqual({ d: 123.456, i: id });
    const sql = executeQuery.mock.calls[0]?.[1] as string;
    expect(sql).toContain('ST_DWithin');
    expect(sql).toContain("p.status = 'published'");
    expect(sql).toContain('ORDER BY distance_m ASC, id ASC');
  });

  it('filtre les types et cuisines avec des paramètres SQL', async () => {
    executeQuery.mockResolvedValue([]);
    await listPlacesFromDb('db', query('?type=restaurant&type=bar&cuisine=French&limit=3'), now);
    const [databaseUrl, sql, params] = executeQuery.mock.calls[0] as [string, string, unknown[]];
    expect(databaseUrl).toBe('db');
    expect(sql).toContain('p.type = ANY');
    expect(sql).toContain('p.cuisines &&');
    expect(params).toContainEqual(['restaurant', 'bar']);
    expect(params).toContainEqual(['French']);
  });

  it('remplit les pages filtrées par lots et borne à cinq requêtes', async () => {
    const rows = Array.from({ length: 300 }, (_, index): PlaceDbRow => ({
      ...row,
      id: `a1000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
      distance_m: index + 1,
      opening_hours: [25, 75, 125].includes(index + 1) ? [rule] : [],
    }));
    executeQuery.mockImplementation((_databaseUrl: string, _sql: string, params: unknown[]) => {
      const cursorDistance = params.length > 4 ? Number(params[3]) : 0;
      return rows.filter((item) => Number(item.distance_m) > cursorDistance).slice(0, 50);
    });
    const first = await listPlacesFromDb('db', query('?isOpenNow=true&limit=2'), now);
    expect(first.items.map((place) => place.distance)).toEqual([25, 75]);
    expect(decodePlaceCursor(first.nextCursor ?? '').d).toBe(75);
    expect(executeQuery).toHaveBeenCalledTimes(3);
    executeQuery.mockClear();
    const second = await listPlacesFromDb('db', query(`?isOpenNow=true&limit=2&cursor=${first.nextCursor}`), now);
    expect(second.items.map((place) => place.distance)).toEqual([125]);
    expect(second.nextCursor).toBeNull();

    executeQuery.mockClear();
    const empty = await listPlacesFromDb('db', query('?isOpenNow=true&limit=2&maxDistance=10000'),
      new Date('2026-09-29T10:00:00Z'));
    expect(empty.items).toEqual([]);
    expect(executeQuery).toHaveBeenCalledTimes(5);
    expect(decodePlaceCursor(empty.nextCursor ?? '').d).toBe(250);
  });
});

describe('routes, CORS et cache', () => {
  const env = { DATABASE_URL: 'db', ALLOWED_ORIGINS: 'https://allowed.example' };
  const request = (path: string, method = 'GET', origin = 'https://allowed.example') =>
    new Request(`https://api.example.test${path}`, { method, headers: { Origin: origin } });

  it('répond à la liste avec CORS et un cache selon le filtre', async () => {
    executeQuery.mockResolvedValue([row]);
    const response = await handleRequest(request('/api/v1/places?limit=2'), env);
    expect(response.status).toBe(200);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://allowed.example');
    expect(response.headers.get('Cache-Control')).toContain('max-age=60');
    expect(PlaceApiListResponseSchema.parse(await response.json()).items).toHaveLength(1);
    const filtered = await handleRequest(request('/api/v1/places?isOpenNow=true'), env);
    expect(filtered.headers.get('Cache-Control')).toContain('max-age=30');
  });

  it('répond au détail et aux catégories avec leurs profils de cache', async () => {
    executeQuery.mockResolvedValueOnce([row]).mockResolvedValueOnce([{
      types: [{ value: 'restaurant', count: 28 }], cuisines: [{ value: 'French', count: 15 }],
    }]);
    const detail = await handleRequest(request(`/api/v1/places/${id}?lang=en`), env);
    expect(detail.status).toBe(200);
    expect(detail.headers.get('Cache-Control')).toContain('max-age=120');
    expect(PlaceApiSchema.parse(await detail.json()).title).toBe('The Table');
    const categories = await handleRequest(request('/api/v1/places/categories'), env);
    expect(categories.status).toBe(200);
    expect(categories.headers.get('Cache-Control')).toContain('max-age=3600');
    expect(await categories.json()).toEqual({
      types: [{ value: 'restaurant', count: 28 }], cuisines: [{ value: 'French', count: 15 }],
    });
  });

  it('gère OPTIONS, 404, 405 et les paramètres invalides sans accès DB', async () => {
    expect((await handleRequest(request('/api/v1/places', 'OPTIONS'), env)).status).toBe(204);
    expect((await handleRequest(request('/api/v1/places/categories', 'POST'), env)).status).toBe(405);
    expect((await handleRequest(request('/api/v1/places/bad'), env)).status).toBe(400);
    expect((await handleRequest(request('/api/v1/places?isOpenNow=yes'), env)).status).toBe(400);
    expect((await handleRequest(request('/api/v1/places/extra/path'), env)).status).toBe(404);
    expect(executeQuery).not.toHaveBeenCalled();
  });

  it('ne révèle ni les paramètres dans les logs ni le CORS aux origines refusées', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const response = await handleRequest(request('/api/v1/places?lang=secret', 'GET', 'https://blocked.example'), env);
    expect(response.status).toBe(400);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull();
    expect(response.headers.get('Cache-Control')).toContain('no-store');
    expect(JSON.stringify(log.mock.calls)).not.toContain('secret');
    log.mockRestore();
  });
});
