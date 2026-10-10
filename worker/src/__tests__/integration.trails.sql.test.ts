import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  OSM_ATTRIBUTION_TEXT,
  TrailDetailSchema,
  TrailGeoResponseSchema,
  TrailListResponseSchema,
  TrailNearbyResponseSchema,
  type TrailSummary,
} from '@leblanc/shared';
import { handleRequest } from '../index.js';

const databaseUrl = process.env.DATABASE_URL_DIRECT ?? '';
const isCI = process.env.CI === 'true' || !!process.env.GITHUB_ACTIONS;
const PRODUCTION_HOST = 'ep-jolly-dawn-b2ezqckv.c-6.eu-central-1.aws.neon.tech';

if (!databaseUrl && !isCI) {
  throw new Error('DATABASE_URL_DIRECT est requis pour exécuter test:integration en local.');
}
if (databaseUrl && new URL(databaseUrl).hostname === PRODUCTION_HOST) {
  // Un test masque puis republie un parcours : jamais sur la production.
  throw new Error('Tests d’intégration des parcours refusés sur la base de production.');
}

const env = { DATABASE_URL: databaseUrl, ALLOWED_ORIGINS: 'https://allowed.example' };
async function get(path: string): Promise<Response> {
  return handleRequest(new Request(`https://api.example.test${path}`), env);
}

// Données réelles de la branche dev, issues de l'ingestion (lot 2).
describe.skipIf(!databaseUrl)('API des parcours sur la branche Neon dev', () => {
  const client = new pg.Client({ connectionString: databaseUrl, connectionTimeoutMillis: 30000 });
  let expected: { total: number; tracks: number; horse: number };
  let tracked: { id: string; relation: string };

  beforeAll(async () => {
    await client.connect();
    const counts = await client.query<{ total: string; tracks: string; horse: string }>(`
      SELECT count(*) FILTER (WHERE modes && ARRAY['foot','bike','mtb']) AS total,
        count(*) FILTER (WHERE modes && ARRAY['foot','bike','mtb'] AND track IS NOT NULL) AS tracks,
        count(*) FILTER (WHERE modes && ARRAY['horse']) AS horse
      FROM routes WHERE status = 'published'`);
    const row = counts.rows[0];
    if (!row || Number(row.tracks) < 2 || Number(row.total) - Number(row.tracks) < 2) {
      throw new Error('Fixtures dev insuffisantes : lancer npm run db:ingest:routes sur la branche dev');
    }
    expected = { total: Number(row.total), tracks: Number(row.tracks), horse: Number(row.horse) };
    const first = await client.query<{ id: string; relation: string }>(`
      SELECT id, track_osm_relation_id::text AS relation FROM routes
      WHERE status = 'published' AND track IS NOT NULL ORDER BY distance_le_blanc_m, id LIMIT 1`);
    tracked = first.rows[0] ?? { id: '', relation: '' };
  });

  let hiddenByTest: string | null = null;
  afterAll(async () => {
    // Secours si le test de masquage est interrompu (délai dépassé) avant son finally.
    if (hiddenByTest) await client.query(`UPDATE routes SET status = 'published' WHERE id = $1`, [hiddenByTest]);
    await client.end();
  });

  it('parcourt toute la liste sans doublon ni trou, à travers la frontière avec / sans tracé', async () => {
    const seen: TrailSummary[] = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      const response = await get(`/api/v1/routes?limit=7${cursor ? `&cursor=${cursor}` : ''}`);
      expect(response.status).toBe(200);
      const body = TrailListResponseSchema.parse(await response.json());
      seen.push(...body.items);
      cursor = body.nextCursor;
      pages++;
    } while (cursor && pages < 100);
    expect(new Set(seen.map((item) => item.id)).size).toBe(seen.length);
    expect(seen).toHaveLength(expected.total);
    // Tous les tracés d'abord, puis distance et id croissants dans chaque groupe.
    const boundary = seen.findIndex((item) => !item.hasTrack);
    expect(boundary).toBe(expected.tracks);
    expect(seen.slice(boundary).every((item) => !item.hasTrack)).toBe(true);
    for (let index = 1; index < seen.length; index++) {
      const [previous, current] = [seen[index - 1], seen[index]];
      if (!previous || !current || previous.hasTrack !== current.hasTrack) continue;
      const ordered = previous.distanceFromLeBlancM < current.distanceFromLeBlancM
        || (previous.distanceFromLeBlancM === current.distanceFromLeBlancM && previous.id < current.id);
      expect(ordered).toBe(true);
    }
    // La frontière tombe au milieu d'une page (7 n'est pas un diviseur) : le curseur la traverse.
    expect(expected.tracks % 7).not.toBe(0);
  });

  it('exclut l’équitation par défaut et la sert sur demande', async () => {
    const byDefault = TrailListResponseSchema.parse(await (await get('/api/v1/routes?limit=50')).json());
    expect(byDefault.items.every((item) => item.modes.some((mode) => mode !== 'horse'))).toBe(true);
    const horse = TrailGeoResponseSchema.parse(await (await get('/api/v1/routes/geo?modes=horse')).json());
    expect(horse.items).toHaveLength(expected.horse);
    expect(horse.items.every((item) => item.modes.includes('horse'))).toBe(true);
  });

  it('filtre avec tracé et boucle', async () => {
    const withTrack = TrailGeoResponseSchema.parse(await (await get('/api/v1/routes/geo?with_track=true')).json());
    expect(withTrack.items).toHaveLength(expected.tracks);
    const loops = TrailListResponseSchema.parse(await (await get('/api/v1/routes?loop=true&limit=50')).json());
    expect(loops.items.length).toBeGreaterThan(0);
    expect(loops.items.every((item) => item.isLoop === true)).toBe(true);
  });

  it('sert la carte allégée (moins de 150 Ko) avec l’attribution OSM de chaque relation', async () => {
    const response = await get('/api/v1/routes/geo');
    const text = await response.text();
    expect(new TextEncoder().encode(text).length).toBeLessThan(150_000);
    const body = TrailGeoResponseSchema.parse(JSON.parse(text));
    expect(body.truncated).toBe(false);
    const relations = body.items.flatMap((item) => (item.osmRelationId === null ? [] : [item.osmRelationId]));
    expect(relations).toHaveLength(expected.tracks);
    for (const relation of new Set(relations)) {
      expect(body.attributions).toContainEqual(expect.objectContaining({ text: OSM_ATTRIBUTION_TEXT, osmRelationId: relation }));
    }
  });

  it('sert la fiche d’un parcours tracé avec attribution, relation et GPX', async () => {
    const detail = TrailDetailSchema.parse(await (await get(`/api/v1/routes/${tracked.id}?lang=en`)).json());
    expect(detail.track?.type).toBe('MultiLineString');
    expect(detail.osmRelationId).toBe(Number(tracked.relation));
    expect(detail.attributions).toContainEqual(expect.objectContaining({ source: 'osm', osmRelationId: Number(tracked.relation) }));
    const gpx = await get(`/api/v1/routes/${tracked.id}/gpx`);
    expect(gpx.status).toBe(200);
    expect(await gpx.text()).toContain('<license>https://opendatacommons.org/licenses/odbl/1-0/</license>');
  });

  it('ne sert pas les descriptions traduites retirées (sans description française)', async () => {
    const rows = await client.query<{ id: string }>(`
      SELECT id FROM routes WHERE status = 'published' AND description_i18n->>'fr' = ''
        AND coalesce(description_i18n->>'en', '') <> '' ORDER BY id LIMIT 1`);
    const id = rows.rows[0]?.id;
    if (!id) throw new Error('Fixture sans description française absente');
    const detail = TrailDetailSchema.parse(await (await get(`/api/v1/routes/${id}?lang=en`)).json());
    expect(detail.description).toBe('');
  });

  it('renvoie à proximité du départ des événements et lieux à 5 km au plus', async () => {
    const response = await get(`/api/v1/routes/${tracked.id}/nearby?lang=fr`);
    const raw: unknown = await response.json();
    expect(response.status, JSON.stringify(raw)).toBe(200);
    const body = TrailNearbyResponseSchema.parse(raw);
    expect(body.radiusM).toBe(5000);
    expect([...body.events, ...body.places].every((item) => item.distanceFromStartM <= 5000)).toBe(true);
  });

  it('répond 404 pour un parcours masqué, puis le republie', async () => {
    hiddenByTest = tracked.id;
    await client.query(`UPDATE routes SET status = 'hidden' WHERE id = $1`, [tracked.id]);
    try {
      expect((await get(`/api/v1/routes/${tracked.id}`)).status).toBe(404);
      expect((await get(`/api/v1/routes/${tracked.id}/gpx`)).status).toBe(404);
      expect((await get(`/api/v1/routes/${tracked.id}/nearby`)).status).toBe(404);
    } finally {
      await client.query(`UPDATE routes SET status = 'published' WHERE id = $1`, [tracked.id]);
      hiddenByTest = null;
    }
    expect((await get(`/api/v1/routes/${tracked.id}`)).status).toBe(200);
  });
});
