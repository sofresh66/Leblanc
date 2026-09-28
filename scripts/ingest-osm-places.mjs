import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { RawPlaceSchema } from '@leblanc/shared';
import { createOverpassClient } from './lib/overpass-client.mjs';
import { normalizeOsmPlace } from './lib/overpass-normalizer.mjs';
import { dedupeOsmPlace, OSM_LOCK_ID, OSM_SOURCE, upsertOsmPlace } from './lib/osm-places-store.mjs';

const log = (step, details = {}) =>
  console.log(JSON.stringify({ step, timestamp: new Date().toISOString(), ...details }));

async function main() {
  if (!process.env.DATABASE_URL_DIRECT) throw new Error('DATABASE_URL_DIRECT_MISSING');
  const runId = randomUUID();
  log('collecting', { runId });

  // Aucune connexion à la base avant une collecte complète et validée.
  const payload = await createOverpassClient().fetchPlaces();
  const counts = {
    fetched: payload.elements.length, accepted: 0, rejected: {}, created: 0, updated: 0,
    level1: 0, level2: 0, level3: 0, nonDuplicates: 0,
    byType: { restaurant: 0, bar: 0, cafe: 0, fast_food: 0 },
  };
  const items = [];
  const seen = new Set();
  for (const element of payload.elements) {
    const item = normalizeOsmPlace(element);
    if (!item.ok) {
      counts.rejected[item.reason] = (counts.rejected[item.reason] ?? 0) + 1;
      continue;
    }
    if (seen.has(item.externalId)) {
      counts.rejected.duplicate_external_id = (counts.rejected.duplicate_external_id ?? 0) + 1;
      continue;
    }
    seen.add(item.externalId);
    if (!RawPlaceSchema.safeParse({ id: randomUUID(), ...item.place }).success)
      throw new Error('INVALID_PLACE_CONTRACT');
    items.push(item);
    counts.byType[item.place.type]++;
  }
  counts.accepted = items.length;
  if (!items.length) throw new Error('NO_VALID_OSM_PLACES');
  log('collected', { runId, serverIndex: payload.serverIndex, ...counts });

  const client = new pg.Client({
    connectionString: process.env.DATABASE_URL_DIRECT,
    connectionTimeoutMillis: 30_000,
    query_timeout: 30_000,
    statement_timeout: 30_000,
  });
  let locked = false;
  let transaction = false;
  try {
    await client.connect();
    const migration = await client.query(`
      SELECT EXISTS (SELECT 1 FROM schema_migrations WHERE version='007_places_osm_hours.sql')
        AND EXISTS (SELECT 1 FROM information_schema.columns
          WHERE table_name='places' AND column_name='opening_hours_raw')
        AND to_regclass('place_dedupe_candidates') IS NOT NULL AS ready`);
    if (!migration.rows[0]?.ready) throw new Error('MIGRATION_007_REQUIRED');
    const lock = await client.query('SELECT pg_try_advisory_lock($1) AS acquired', [OSM_LOCK_ID]);
    if (!lock.rows[0]?.acquired) throw new Error('OSM_INGEST_ALREADY_RUNNING');
    locked = true;
    await client.query('BEGIN');
    transaction = true;
    await client.query("INSERT INTO ingestion_runs (id,source,status) VALUES ($1,$2,'running')",
      [runId, OSM_SOURCE]);
    const examples = [];
    for (const item of items) {
      const stored = await upsertOsmPlace(client, item);
      counts[stored.action]++;
      const candidate = await dedupeOsmPlace(client, item, stored.placeId);
      if (candidate?.decision === 'merge') counts[`level${candidate.level}`]++;
      else if (candidate?.decision === 'pending') counts.level3++;
      else counts.nonDuplicates++;
      if (candidate && examples.length < 10) examples.push({
        osm: item.place.title_i18n.fr, datatourisme: candidate.reason.datatourismeName,
        level: candidate.level, distanceMeters: candidate.distanceMeters,
        score: candidate.score, decision: candidate.decision,
      });
    }
    await client.query(`
      UPDATE ingestion_runs SET status=$2,finished_at=now(),fetched_count=$3,
        accepted_count=$4,rejected_count=$5,error_summary=$6 WHERE id=$1`,
      [runId, Object.values(counts.rejected).some(Boolean) ? 'partial' : 'success',
        counts.fetched, counts.accepted,
        Object.values(counts.rejected).reduce((a, b) => a + b, 0), JSON.stringify(counts)]);
    await client.query('COMMIT');
    transaction = false;
    log('finished', { runId, ...counts, examples });
  } catch (error) {
    if (transaction) await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    if (locked) await client.query('SELECT pg_advisory_unlock($1)', [OSM_LOCK_ID]).catch(() => {});
    await client.end().catch(() => {});
  }
}

main().catch((error) => {
  // Ne jamais afficher l'URI Neon, une réponse Overpass ou les secrets.
  log('failed', { code: typeof error?.code === 'string' ? error.code :
    /^([A-Z_0-9]+)$/.test(error?.message ?? '') ? error.message : 'OSM_INGEST_FAILED' });
  process.exitCode = 1;
});
