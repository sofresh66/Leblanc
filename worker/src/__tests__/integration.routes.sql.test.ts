import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const databaseUrl = process.env.DATABASE_URL_DIRECT ?? '';
const isCI = process.env.CI === 'true' || !!process.env.GITHUB_ACTIONS;
// Hôte de production (docs/deploiement-audit-2026-10.md) : ces tests écrivent,
// même si tout est annulé en fin de transaction.
const PRODUCTION_HOST = 'ep-jolly-dawn-b2ezqckv.c-6.eu-central-1.aws.neon.tech';

if (!databaseUrl && !isCI) {
  throw new Error('DATABASE_URL_DIRECT est requis pour exécuter test:integration en local.');
}
if (databaseUrl && new URL(databaseUrl).hostname === PRODUCTION_HOST) {
  throw new Error('Tests d’écriture du schéma des parcours refusés sur la base de production.');
}

// Une seule transaction, annulée à la fin : rien n'est écrit durablement.
describe.skipIf(!databaseUrl)('Schéma des parcours (migration 012), transaction annulée', () => {
  const client = new pg.Client({ connectionString: databaseUrl, connectionTimeoutMillis: 30000 });

  // Deux morceaux disjoints autour de Ruffec, comme une relation OSM discontinue.
  const twoPieces = 'MULTILINESTRING((1.170 46.630, 1.175 46.632, 1.180 46.633), (1.190 46.640, 1.195 46.642))';

  async function insertRoute(id: string, track: string | null): Promise<void> {
    await client.query(`
      INSERT INTO routes (
        id, title_i18n, source_language, modes, start_latitude, start_longitude, start_location,
        distance_le_blanc_m, track, track_simplified, track_source, track_osm_relation_id, normalized_title
      ) VALUES (
        $1, '{"fr":"Parcours de test"}'::jsonb, 'fr', ARRAY['foot'], 46.63, 1.17,
        ST_SetSRID(ST_MakePoint(1.17, 46.63), 4326)::geography, 6600,
        ST_GeogFromText($2), ST_GeomFromText($2, 4326),
        CASE WHEN $2::text IS NULL THEN NULL ELSE 'osm' END,
        CASE WHEN $2::text IS NULL THEN NULL ELSE 123456 END,
        'parcours de test'
      )`, [id, track]);
  }

  async function rejects(statement: () => Promise<void>): Promise<string> {
    await client.query('SAVEPOINT attempt');
    try {
      await statement();
    } catch (error) {
      await client.query('ROLLBACK TO SAVEPOINT attempt');
      return error instanceof Error ? error.message : String(error);
    }
    await client.query('RELEASE SAVEPOINT attempt');
    throw new Error('Instruction acceptée alors qu’un refus était attendu');
  }

  beforeAll(async () => {
    await client.connect();
    await client.query('BEGIN');
  });

  afterAll(async () => {
    await client.query('ROLLBACK');
    await client.end();
  });

  it('accepte une trace en deux morceaux et la conserve en MultiLineString', async () => {
    const id = randomUUID();
    await insertRoute(id, twoPieces);
    const { rows } = await client.query<{ parts: number; simplifiedParts: number; type: string }>(`
      SELECT ST_NumGeometries(track::geometry) AS parts,
        ST_NumGeometries(track_simplified) AS "simplifiedParts",
        GeometryType(track::geometry) AS type
      FROM routes WHERE id = $1`, [id]);
    expect(rows[0]).toEqual({ parts: 2, simplifiedParts: 2, type: 'MULTILINESTRING' });
  });

  it('accepte un parcours sans tracé', async () => {
    const id = randomUUID();
    await insertRoute(id, null);
    const { rows } = await client.query<{ track: string | null; source: string | null }>(
      'SELECT track::text AS track, track_source AS source FROM routes WHERE id = $1', [id]);
    expect(rows[0]).toEqual({ track: null, source: null });
  });

  it('refuse une géométrie qui n’est pas une MultiLineString', async () => {
    const message = await rejects(() => insertRoute(randomUUID(), 'POINT(1.17 46.63)'));
    expect(message).toMatch(/geometry type|type/i);
  });

  it('refuse un tracé sans source ni relation OSM', async () => {
    const message = await rejects(() => client.query(`
      INSERT INTO routes (id, title_i18n, source_language, modes, start_latitude, start_longitude,
        start_location, distance_le_blanc_m, track, track_simplified, normalized_title)
      VALUES ($1, '{"fr":"x"}', 'fr', ARRAY['foot'], 46.63, 1.17,
        ST_SetSRID(ST_MakePoint(1.17, 46.63), 4326)::geography, 0,
        ST_GeogFromText($2), ST_GeomFromText($2, 4326), 'x')`, [randomUUID(), twoPieces]).then(() => undefined));
    expect(message).toMatch(/check constraint/i);
  });

  it('refuse un mode inconnu', async () => {
    const message = await rejects(() => client.query(`
      INSERT INTO routes (id, title_i18n, source_language, modes, start_latitude, start_longitude,
        start_location, distance_le_blanc_m, normalized_title)
      VALUES ($1, '{"fr":"x"}', 'fr', ARRAY['car'], 46.63, 1.17,
        ST_SetSRID(ST_MakePoint(1.17, 46.63), 4326)::geography, 0, 'x')`, [randomUUID()]).then(() => undefined));
    expect(message).toMatch(/check constraint/i);
  });

  it('rattache une fiche source et la supprime en cascade', async () => {
    const id = randomUUID();
    await insertRoute(id, null);
    await client.query(`
      INSERT INTO route_source_records (id, source, external_id, route_id)
      VALUES ($1, 'datatourisme', $2, $3)`, [randomUUID(), `test-${id}`, id]);
    await client.query('DELETE FROM routes WHERE id = $1', [id]);
    const { rows } = await client.query('SELECT 1 FROM route_source_records WHERE route_id = $1', [id]);
    expect(rows).toHaveLength(0);
  });
});
