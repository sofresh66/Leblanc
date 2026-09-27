import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { OpeningHoursRuleSchema, RawPlaceSchema } from '@leblanc/shared';
import {
  createDatatourismePlacesClient,
  DatatourismePlacesPageError,
} from './lib/datatourisme-places-client.mjs';
import { normalizeDatatourismePlace } from './lib/datatourisme-places-normalizer.mjs';
import { PLACES_LOCK_ID, PLACES_SOURCE, upsertPlace } from './lib/places-store.mjs';

const log = (step, details = {}) =>
  console.log(JSON.stringify({ step, timestamp: new Date().toISOString(), ...details }));

function options(args) {
  const limits = args.filter((arg) => arg.startsWith('--limit='));
  if (limits.length > 1 || args.some((arg) => arg !== '--dry-run' && !arg.startsWith('--limit='))) {
    throw new Error('Arguments attendus : --dry-run et/ou --limit=N');
  }
  const limit = limits.length ? Number(limits[0].slice(8)) : null;
  if (limit !== null && (!Number.isSafeInteger(limit) || limit < 1))
    throw new Error('--limit invalide');
  return { dryRun: args.includes('--dry-run'), limit };
}

async function main() {
  const { dryRun, limit } = options(process.argv.slice(2));
  const api = createDatatourismePlacesClient({ apiKey: process.env.DATATOURISME_API_KEY });
  if (!dryRun && !process.env.DATABASE_URL_DIRECT) throw new Error('DATABASE_URL_DIRECT requise');
  const client = dryRun
    ? null
    : new pg.Client({
        connectionString: process.env.DATABASE_URL_DIRECT,
        connectionTimeoutMillis: 30_000,
        query_timeout: 30_000,
        statement_timeout: 30_000,
      });
  const runId = randomUUID();
  let locked = false;
  let started = false;
  let transaction = false;
  const counts = {
    fetched: 0,
    accepted: 0,
    rejected: 0,
    duplicates: 0,
    created: 0,
    updated: 0,
    openingHours: 0,
    unknownHours: 0,
    partialHours: 0,
    warnings: 0,
    byType: { restaurant: 0, bar: 0, cafe: 0, fast_food: 0, food_truck: 0, other_food: 0 },
  };
  try {
    if (client) {
      await client.connect();
      const lock = await client.query('SELECT pg_try_advisory_lock($1) AS acquired', [
        PLACES_LOCK_ID,
      ]);
      if (!lock.rows[0]?.acquired) throw new Error('Ingestion places déjà en cours');
      locked = true;
      await client.query("INSERT INTO ingestion_runs (id,source,status) VALUES ($1,$2,'running')", [
        runId,
        PLACES_SOURCE,
      ]);
      started = true;
    }
    log('start', { runId, dryRun, limit });
    // Tout récupérer/valider avant la première écriture dans places.
    const items = [];
    const seen = new Set();
    const cursors = new Set();
    let nextUrl = null;
    const pageSize = Math.min(50, limit ?? 50);
    for (let page = 1; ; page++) {
      if (page > 1000) throw new Error('Pagination excessive');
      const payload = await api.fetchPage({ page, pageSize, nextUrl });
      const objects = payload.objects.slice(0, limit === null ? undefined : limit - counts.fetched);
      for (const raw of objects) {
        counts.fetched++;
        const item = normalizeDatatourismePlace(raw);
        if (!item.ok) {
          counts.rejected++;
          log('rejected', { reason: item.reason });
          continue;
        }
        if (seen.has(item.externalId)) {
          counts.duplicates++;
          continue;
        }
        seen.add(item.externalId);
        const placeId = randomUUID();
        if (
          !RawPlaceSchema.safeParse({ id: placeId, ...item.place }).success ||
          item.openingHours.some(
            (rule) =>
              !OpeningHoursRuleSchema.safeParse({
                id: randomUUID(),
                placeId,
                ...rule,
              }).success,
          )
        ) {
          throw new Error('Contrat places invalide');
        }
        items.push(item);
        counts.accepted++;
        counts.byType[item.place.type]++;
        counts.openingHours += item.openingHours.length;
        counts.unknownHours += Number(item.place.openingHoursStatus === 'unknown');
        counts.partialHours += Number(item.place.openingHoursStatus === 'partial');
        counts.warnings += item.warnings.length;
      }
      log('page', {
        page,
        fetched: counts.fetched,
        accepted: counts.accepted,
        total: payload.meta.total,
      });
      if (limit !== null && counts.fetched >= limit) break;
      nextUrl = payload.meta.next ?? null;
      if (!nextUrl) {
        if (page < payload.meta.total_pages || counts.fetched !== payload.meta.total) {
          throw new Error('Pagination incomplète');
        }
        break;
      }
      if (!payload.objects.length || cursors.has(nextUrl))
        throw new Error('Pagination répétée ou vide');
      cursors.add(nextUrl);
    }
    if (client) {
      await client.query('BEGIN');
      transaction = true;
      for (const item of items) counts[await upsertPlace(client, item)]++;
      await client.query(
        `UPDATE ingestion_runs SET status=$2, finished_at=now(),
        fetched_count=$3, accepted_count=$4, rejected_count=$5, error_summary=$6 WHERE id=$1`,
        [
          runId,
          counts.rejected || counts.warnings || limit !== null ? 'partial' : 'success',
          counts.fetched,
          counts.accepted,
          counts.rejected,
          JSON.stringify({ ...counts, limited: limit !== null }),
        ],
      );
      await client.query('COMMIT');
      transaction = false;
    }
    log('finished', { runId, dryRun, limited: limit !== null, ...counts });
  } catch (error) {
    if (transaction) await client.query('ROLLBACK').catch(() => {});
    const code =
      error instanceof DatatourismePlacesPageError
        ? error.status
        : typeof error?.code === 'string'
          ? error.code
          : 'INGEST_PLACES_FAILED';
    if (started) {
      await client
        .query(
          `UPDATE ingestion_runs SET status='failed', finished_at=now(),
        fetched_count=$2, accepted_count=0, rejected_count=$3, error_summary=$4 WHERE id=$1`,
          [runId, counts.fetched, counts.rejected, code],
        )
        .catch(() => {});
    }
    // Ni URI de connexion, ni corps HTTP, ni secret dans les logs d'erreur.
    log('failed', { runId, code });
    process.exitCode = 1;
  } finally {
    if (locked)
      await client.query('SELECT pg_advisory_unlock($1)', [PLACES_LOCK_ID]).catch(() => {});
    await client?.end().catch(() => {});
  }
}

main().catch(() => {
  log('failed', { code: 'INVALID_CONFIGURATION' });
  process.exitCode = 1;
});
