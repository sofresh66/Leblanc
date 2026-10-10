import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  OSM_ATTRIBUTION_TEXT,
  TrailDetailSchema,
  TrailGeoResponseSchema,
  TrailListResponseSchema,
} from '@leblanc/shared';
import { handleRequest } from '../index.js';
import { CACHE_PROFILES } from '../http/cache.js';
import { buildGpx, gpxFileName } from '../http/gpx.js';
import { mapDbRowToTrailDetail, mapDbRowToTrailSummary, type TrailDbRow } from '../mappers/route.js';
import {
  decodeTrailCursor,
  encodeTrailCursor,
  parseTrailGeoQuery,
  parseTrailLang,
  parseTrailListQuery,
} from '../validation/routesQuery.js';

const { executeQuery } = vi.hoisted(() => ({ executeQuery: vi.fn() }));
vi.mock('../db/client.js', async (original) => ({
  ...await original<typeof import('../db/client.js')>(),
  executeQuery,
}));

const id = 'c1000000-0000-4000-8000-000000000001';
const nowIso = '2026-10-10T12:00:00.000Z';
const track = JSON.stringify({ type: 'MultiLineString', coordinates: [[[1.17, 46.63], [1.18, 46.64]], [[1.19, 46.65], [1.2, 46.66]]] });
const row = (overrides: Partial<TrailDbRow> = {}): TrailDbRow => ({
  id,
  title_i18n: { fr: 'Balade à pied n°14 - Rive gauche, rive droite', en: 'Walk 14 - Left bank, right bank', de: 'Rive gauche' },
  description_i18n: { fr: 'Une boucle entre les deux rives de la Creuse.', en: 'A loop between both banks.', de: 'Ein Rundweg.' },
  translation_status: { de: { status: 'rejected', reason: 'override:cross_record_translation' } },
  modes: ['foot'],
  is_loop: true,
  distance_m: 11500,
  duration_min: null,
  duration_days: '0.5',
  start_latitude: 46.63,
  start_longitude: 1.17,
  start_city: 'Ruffec',
  start_postal_code: '36300',
  distance_le_blanc_m: 6640,
  has_track: true,
  track_geojson: track,
  track_osm_relation_id: '18248594',
  official_url: 'http://www.parc-naturel-brenne.fr/',
  image_url: 'https://centre.media.tourinsoft.eu/upload/photo.jpg',
  image_credit: 'CRT Centre Val de Loire',
  image_license: 'By-NC-ND 4.0',
  producer: 'Destination Brenne',
  content_updated_at: '2026-01-04T00:00:00Z',
  ...overrides,
});
const url = (search: string) => new URL(`https://api.example.test/api/v1/routes${search}`);
const env = { DATABASE_URL: 'db', ALLOWED_ORIGINS: 'https://allowed.example' };
const request = (path: string) => new Request(`https://api.example.test${path}`, { headers: { Origin: 'https://allowed.example' } });

beforeEach(() => { executeQuery.mockReset(); });

describe('Validation des paramètres des parcours', () => {
  it('montre à pied, vélo et VTT par défaut ; l’équitation seulement sur demande', () => {
    expect(parseTrailListQuery(url(''), nowIso)).toMatchObject({ lang: 'fr', modes: ['foot', 'bike', 'mtb'], limit: 20, asOf: nowIso });
    expect(parseTrailListQuery(url('?modes=horse'), nowIso).modes).toEqual(['horse']);
    expect(parseTrailListQuery(url('?modes=foot,horse&modes=foot'), nowIso).modes).toEqual(['foot', 'horse']);
  });

  it('lit les filtres booléens, distances et durée', () => {
    expect(parseTrailListQuery(url('?with_track=true&loop=false&min_km=5&max_km=12.5&max_duration=180&q=Anglin'), nowIso))
      .toMatchObject({ withTrack: true, loop: false, minDistanceM: 5000, maxDistanceM: 12500, maxDurationMin: 180, q: 'Anglin' });
  });

  it.each([
    '?modes=car', '?modes=', '?with_track=1', '?loop=yes', '?limit=0', '?limit=51', '?limit=2.5',
    '?min_km=10&max_km=5', '?max_duration=0', '?lang=pt', '?difficulty=easy', '?cursor=@@', '?limit=5&limit=6',
  ])('rejette %s', (search) => {
    expect(() => parseTrailListQuery(url(search), nowIso)).toThrow();
  });

  it('refuse la pagination sur la carte et tout paramètre sur la fiche sauf lang', () => {
    expect(() => parseTrailGeoQuery(url('?limit=5'))).toThrow(/inconnu/);
    expect(parseTrailGeoQuery(url('?modes=horse&with_track=true'))).toMatchObject({ modes: ['horse'], withTrack: true });
    expect(parseTrailLang(url('?lang=de'))).toBe('de');
    expect(() => parseTrailLang(url('?modes=foot'))).toThrow(/inconnu/);
  });
});

describe('Curseur à trois clés', () => {
  const cursor = { t: 1 as const, d: 6640, i: id, a: nowIso };

  it('encode et décode de façon canonique', () => {
    expect(decodeTrailCursor(encodeTrailCursor(cursor))).toEqual(cursor);
    const padded = `${encodeTrailCursor(cursor)}=`;
    expect(() => decodeTrailCursor(padded)).toThrow();
    expect(() => decodeTrailCursor(btoa(JSON.stringify({ ...cursor, t: 2 })))).toThrow();
  });

  it('reprend la date de référence et expire après 24 h', () => {
    const value = encodeTrailCursor(cursor);
    expect(parseTrailListQuery(url(`?cursor=${value}`), '2026-10-11T11:00:00.000Z')).toMatchObject({ decodedCursor: cursor, asOf: nowIso });
    expect(() => parseTrailListQuery(url(`?cursor=${value}`), '2026-10-11T12:00:01.000Z')).toThrow(/expiré/);
  });
});

describe('Mapper des parcours', () => {
  it('sert la langue demandée, sans traduction rejetée, avec repli sur le français', () => {
    expect(mapDbRowToTrailDetail(row(), 'en')).toMatchObject({
      title: 'Walk 14 - Left bank, right bank', description: 'A loop between both banks.', contentLanguage: 'en', isFallback: false,
    });
    // Traductions allemandes rejetées (override) : français.
    expect(mapDbRowToTrailDetail(row(), 'de')).toMatchObject({
      title: 'Balade à pied n°14 - Rive gauche, rive droite', contentLanguage: 'fr', descriptionLanguage: 'fr', isFallback: true,
    });
  });

  it('expose durée en jours, boucle inconnue, lien officiel, crédit et licence de l’image', () => {
    expect(mapDbRowToTrailSummary(row({ is_loop: null }), 'fr')).toMatchObject({
      durationDays: 0.5, isLoop: null, officialUrl: 'http://www.parc-naturel-brenne.fr/',
      imageCredit: 'CRT Centre Val de Loire', imageLicense: 'By-NC-ND 4.0', hasTrack: true, distanceFromLeBlancM: 6640,
    });
  });

  it('cite OSM (ODbL) et la relation quand un tracé est servi', () => {
    const detail = mapDbRowToTrailDetail(row(), 'fr');
    expect(detail).toMatchObject({ osmRelationId: 18248594, gpxAvailable: true, track: { type: 'MultiLineString' } });
    expect(detail.track?.coordinates).toHaveLength(2);
    expect(detail.attributions).toEqual([
      expect.objectContaining({ source: 'datatourisme', producer: 'Destination Brenne', license: 'Licence Ouverte 2.0' }),
      expect.objectContaining({ source: 'osm', text: OSM_ATTRIBUTION_TEXT, license: 'ODbL 1.0', osmRelationId: 18248594 }),
    ]);
  });

  it('sans tracé : ni attribution OSM, ni GPX', () => {
    const detail = mapDbRowToTrailDetail(row({ has_track: false, track_geojson: null, track_osm_relation_id: null }), 'fr');
    expect(detail).toMatchObject({ track: null, osmRelationId: null, gpxAvailable: false });
    expect(detail.attributions.map((attribution) => attribution.source)).toEqual(['datatourisme']);
  });
});

describe('GPX', () => {
  it('produit un GPX 1.1 sous ODbL, un segment par morceau, texte échappé', () => {
    const gpx = buildGpx({ title: 'Balade <A & B>', osmRelationId: 42, trackGeojson: track });
    expect(gpx).toContain('<gpx version="1.1"');
    expect(gpx).toContain('<license>https://opendatacommons.org/licenses/odbl/1-0/</license>');
    expect(gpx).toContain('© contributeurs OpenStreetMap, ODbL');
    expect(gpx).toContain('https://www.openstreetmap.org/relation/42');
    expect(gpx).toContain('<name>Balade &lt;A &amp; B&gt;</name>');
    expect(gpx.match(/<trkseg>/g)).toHaveLength(2);
    expect(gpx).toContain('<trkpt lat="46.63" lon="1.17"/>');
    expect(gpxFileName("Balade à pied n°14 - L'Anglin")).toBe('balade-a-pied-n-14-l-anglin.gpx');
  });
});

describe('Routage, statuts et cache des parcours', () => {
  it('route /routes/geo vers la carte, jamais vers une fiche', async () => {
    executeQuery.mockResolvedValue([row()]);
    const response = await handleRequest(request('/api/v1/routes/geo'), env);
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe(CACHE_PROFILES.eventsGeo);
    const sql = String(executeQuery.mock.calls[0]?.[1]);
    expect(sql).toContain('ST_AsGeoJSON(r.track_simplified, 5)');
    expect(sql).not.toContain('r.id = $1');
    const body = TrailGeoResponseSchema.parse(await response.json());
    expect(body.items[0]).toMatchObject({ osmRelationId: 18248594, hasTrack: true });
    expect(body.attributions).toContainEqual(expect.objectContaining({ text: OSM_ATTRIBUTION_TEXT, osmRelationId: 18248594 }));
  });

  it('sert la liste triée avec tracé d’abord et un curseur à trois clés', async () => {
    executeQuery.mockResolvedValue([row(), row({ id: 'c1000000-0000-4000-8000-000000000002', has_track: false })]);
    const response = await handleRequest(request('/api/v1/routes?limit=1'), env);
    expect(response.headers.get('Cache-Control')).toBe(CACHE_PROFILES.routesList);
    const body = TrailListResponseSchema.parse(await response.json());
    expect(body.items).toHaveLength(1);
    expect(decodeTrailCursor(body.nextCursor ?? '')).toMatchObject({ t: 1, d: 6640, i: id });
    const sql = String(executeQuery.mock.calls[0]?.[1]);
    expect(sql).toContain('ORDER BY (r.track IS NOT NULL) DESC, r.distance_le_blanc_m ASC, r.id ASC');
    expect(sql).toContain(`r.status = 'published'`);
    expect(executeQuery.mock.calls[0]?.[2]).toContainEqual(['foot', 'bike', 'mtb']);
  });

  it('renvoie la fiche, 404 si inconnue ou masquée, 400 si l’identifiant est invalide', async () => {
    executeQuery.mockResolvedValueOnce([row()]);
    const detail = await handleRequest(request(`/api/v1/routes/${id}?lang=en`), env);
    expect(detail.status).toBe(200);
    expect(detail.headers.get('Access-Control-Allow-Origin')).toBe('https://allowed.example');
    expect(TrailDetailSchema.parse(await detail.json()).title).toBe('Walk 14 - Left bank, right bank');
    expect(String(executeQuery.mock.calls[0]?.[1])).toContain(`r.status = 'published'`);
    executeQuery.mockResolvedValueOnce([]);
    expect((await handleRequest(request(`/api/v1/routes/${id}`), env)).status).toBe(404);
    expect((await handleRequest(request('/api/v1/routes/pas-un-uuid'), env)).status).toBe(400);
    expect((await handleRequest(request('/api/v1/routes/geo/gpx'), env)).status).toBe(400);
  });

  it('sert le GPX d’un tracé OSM en pièce jointe, 404 sans tracé', async () => {
    executeQuery.mockResolvedValueOnce([{ title: 'Rive gauche, rive droite', osm_relation_id: '18248594', track_geojson: track }]);
    const gpx = await handleRequest(request(`/api/v1/routes/${id}/gpx`), env);
    expect(gpx.status).toBe(200);
    expect(gpx.headers.get('Content-Type')).toContain('application/gpx+xml');
    expect(gpx.headers.get('Content-Disposition')).toBe('attachment; filename="rive-gauche-rive-droite.gpx"');
    expect(await gpx.text()).toContain('<trkseg>');
    executeQuery.mockResolvedValueOnce([]);
    expect((await handleRequest(request(`/api/v1/routes/${id}/gpx`), env)).status).toBe(404);
  });

  it('cherche événements et lieux autour du départ avec des paramètres SQL liés', async () => {
    executeQuery.mockResolvedValueOnce([{ lat: 46.63, lng: 1.17 }]).mockResolvedValue([]);
    const response = await handleRequest(request(`/api/v1/routes/${id}/nearby`), env);
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe(CACHE_PROFILES.routeNearby);
    expect(await response.json()).toMatchObject({ radiusM: 5000, events: [], places: [] });
    const [eventsCall, placesCall] = executeQuery.mock.calls.slice(1);
    expect(String(eventsCall?.[1])).toMatch(/ST_MakePoint\(\$6::double precision, \$7::double precision\).*\$8::double precision/s);
    expect(eventsCall?.[2]?.slice(5, 8)).toEqual([1.17, 46.63, 5000]);
    expect(String(placesCall?.[1])).toContain('ST_MakePoint($3, $4)');
    expect(placesCall?.[2]).toEqual([1.0833, 46.6333, 1.17, 46.63, 5000, 6]);
  });

  it('renvoie 404 pour « à proximité » d’un parcours inconnu, 404 pour un sous-chemin inconnu', async () => {
    executeQuery.mockResolvedValueOnce([]);
    expect((await handleRequest(request(`/api/v1/routes/${id}/nearby`), env)).status).toBe(404);
    expect((await handleRequest(request(`/api/v1/routes/${id}/photos`), env)).status).toBe(404);
  });

  it('signale un curseur expiré avec un code distinct', async () => {
    const old = encodeTrailCursor({ t: 0, d: 1, i: id, a: '2020-01-01T00:00:00.000Z' });
    const response = await handleRequest(request(`/api/v1/routes?cursor=${old}`), env);
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: 'CURSOR_EXPIRED' } });
    expect(executeQuery).not.toHaveBeenCalled();
  });
});

describe('Recherche « autour d’un point » (interne, bornée)', () => {
  it('borne coordonnées et rayon (5 km au plus)', async () => {
    const { assertNearPoint } = await import('../db/near.js');
    expect(assertNearPoint({ lng: 1.17, lat: 46.63, radiusM: 5000 })).toEqual({ lng: 1.17, lat: 46.63, radiusM: 5000 });
    for (const near of [
      { lng: 1.17, lat: 46.63, radiusM: 5001 }, { lng: 1.17, lat: 46.63, radiusM: 0 },
      { lng: 181, lat: 46.63, radiusM: 100 }, { lng: 1.17, lat: -91, radiusM: 100 },
      { lng: Number.NaN, lat: 46.63, radiusM: 100 }, { lng: 1.17, lat: 46.63, radiusM: Number.POSITIVE_INFINITY },
    ]) {
      expect(() => assertNearPoint(near)).toThrow(/hors bornes/);
    }
  });

  it('refuse un rayon trop grand avant toute requête SQL', async () => {
    const { listPlacesNearFromDb } = await import('../db/places.js');
    await expect(listPlacesNearFromDb('db', { lng: 1.17, lat: 46.63 }, 20000, 6, 'fr', new Date())).rejects.toThrow(/hors bornes/);
    expect(executeQuery).not.toHaveBeenCalled();
  });

  it('n’est activable par aucun paramètre d’URL', async () => {
    executeQuery.mockResolvedValue([]);
    await handleRequest(request('/api/v1/events?lat=0&lng=0&radius=999999&near=1'), env);
    expect(String(executeQuery.mock.calls[0]?.[1])).not.toContain('::double precision');
    expect((await handleRequest(request('/api/v1/places?lat=0&lng=0&radius=999999'), env)).status).toBe(400);
  });
});
