import { describe, expect, it, vi } from 'vitest';
import { createDatatourismeRoutesClient, DatatourismeRoutesPageError } from '../lib/datatourisme-routes-client.mjs';
import { createOverpassClient, OVERPASS_QUERY } from '../lib/overpass-client.mjs';
import { OVERPASS_ROUTES_QUERY } from '../lib/route-osm-match.mjs';
import { routeRow } from '../lib/routes-store.mjs';
import { parseArgs } from '../ingest-routes.mjs';

const page = (objects = [], meta = {}) => ({ objects, meta: { total: objects.length, total_pages: 1, next: null, ...meta } });
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('Client DATAtourisme des itinéraires', () => {
  it('demande /v1/tour avec les champs des itinéraires et le rayon de 55 km', async () => {
    const fetchImpl = vi.fn(async () => json(page()));
    await createDatatourismeRoutesClient({ apiKey: 'k', fetchImpl }).fetchPage();
    const [url, options] = fetchImpl.mock.calls[0];
    expect(url.pathname).toBe('/v1/tour');
    expect(url.searchParams.get('geo_distance')).toBe('46.6333,1.0833,55km');
    expect(url.searchParams.get('fields')).toContain('tourDistance');
    expect(url.searchParams.get('fields')).toContain('hasTourType');
    expect(options.headers).toEqual({ 'X-API-Key': 'k' });
  });

  it('refuse un lien de pagination vers un autre hôte', async () => {
    const client = createDatatourismeRoutesClient({ apiKey: 'k', fetchImpl: vi.fn() });
    await expect(client.fetchPage({ nextUrl: 'https://evil.example/v1/tour?page=2' })).rejects.toThrow(/invalide/);
  });

  it('réessaie sur 503 puis échoue proprement', async () => {
    const fetchImpl = vi.fn(async () => json({}, 503));
    const sleep = vi.fn(async () => {});
    await expect(createDatatourismeRoutesClient({ apiKey: 'k', fetchImpl, sleep }).fetchPage())
      .rejects.toBeInstanceOf(DatatourismeRoutesPageError);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });
});

describe('Overpass : requête des parcours', () => {
  it('envoie la requête fournie, la requête des lieux restant celle par défaut', async () => {
    const fetchImpl = vi.fn(async () => json({ elements: [{ type: 'relation', id: 1 }] }));
    await createOverpassClient({ fetchImpl, servers: ['https://o.example/api'], query: OVERPASS_ROUTES_QUERY }).fetchElements();
    await createOverpassClient({ fetchImpl, servers: ['https://o.example/api'] }).fetchPlaces();
    expect(new URLSearchParams(fetchImpl.mock.calls[0][1].body).get('data')).toBe(OVERPASS_ROUTES_QUERY);
    expect(new URLSearchParams(fetchImpl.mock.calls[1][1].body).get('data')).toBe(OVERPASS_QUERY);
    expect(OVERPASS_ROUTES_QUERY).toContain('out geom');
  });

  it('garde le code de chaque serveur quand tous échouent', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(json({}, 500))
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValueOnce(json({ elements: [] }));
    const error = await createOverpassClient({ fetchImpl, servers: ['https://a.example', 'https://b.example', 'https://c.example'],
      query: OVERPASS_ROUTES_QUERY }).fetchElements().catch((caught) => caught);
    expect(error).toMatchObject({ code: 'EMPTY_PAYLOAD', serverCodes: ['HTTP_500', 'NETWORK_OR_TIMEOUT', 'EMPTY_PAYLOAD'] });
  });
});

describe('Ligne de parcours', () => {
  const item = { route: { start: [1.215031, 46.723668], isLoop: null } };

  it('garde le départ DATAtourisme sans tracé', () => {
    expect(routeRow(item, null)).toMatchObject({ start: [1.215031, 46.723668], trackWkt: null, trackRelationId: null, isLoop: null });
    // Rosnay : environ 14,2 km du Blanc.
    expect(routeRow(item, null).distanceLeBlancM).toBeGreaterThan(14_000);
    expect(routeRow(item, null).distanceLeBlancM).toBeLessThan(14_400);
  });

  it('prend le départ sur le tracé et la boucle OSM quand la source ne dit rien', () => {
    const match = { start: [1.0833, 46.6333], lines: [[[1.0833, 46.6333], [1.09, 46.64]]], relationId: 42, isLoop: true };
    expect(routeRow(item, match)).toMatchObject({ distanceLeBlancM: 0, isLoop: true, trackRelationId: 42,
      trackWkt: 'MULTILINESTRING((1.0833 46.6333, 1.09 46.64))' });
    expect(routeRow({ route: { ...item.route, isLoop: false } }, match).isLoop).toBe(false);
  });
});

describe('Arguments de l’ingestion', () => {
  it('accepte --dry-run et --limit=N', () => {
    expect(parseArgs([])).toEqual({ dryRun: false, limit: null });
    expect(parseArgs(['--dry-run', '--limit=5'])).toEqual({ dryRun: true, limit: 5 });
    expect(() => parseArgs(['--limit=0'])).toThrow(/positif/);
    expect(() => parseArgs(['--apply'])).toThrow(/Arguments attendus/);
  });
});
