import 'dotenv/config';
import crypto from 'node:crypto';
import pg from 'pg';
import { createOpenAgendaClient, OpenAgendaError } from './lib/openagenda-client.mjs';
import { normalizeOpenAgendaEvent } from './lib/openagenda-normalizer.mjs';

const SOURCE = 'openagenda';
const SLUGS = new Map([
  ['86244142', 'culture'],
  ['54621', 'jep-2026-centre-val-de-loire'],
]);
const log = (step, details) =>
  console.log(JSON.stringify({ step, at: new Date().toISOString(), ...details }));

function parseLimit(args) {
  if (args.length === 0) return null;
  if (args.length !== 1 || !/^--limit=\d+$/.test(args[0]))
    throw new Error('Argument attendu : --limit=N');
  const limit = Number(args[0].slice(8));
  if (!Number.isSafeInteger(limit) || limit < 1) throw new Error('--limit invalide');
  return limit;
}

async function insideRadius(db, longitude, latitude) {
  const { rows } = await db.query(
    `
    SELECT ST_DWithin(
      ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
      ST_SetSRID(ST_MakePoint(1.0833, 46.6333), 4326)::geography,
      20000
    ) AS inside
  `,
    [longitude, latitude],
  );
  return rows[0].inside;
}

async function upsertEvent(db, item) {
  const { rows } = await db.query(
    'SELECT event_id FROM source_records WHERE source=$1 AND external_id=$2 FOR UPDATE',
    [SOURCE, item.externalId],
  );
  const existingId = rows[0]?.event_id;
  const eventId = existingId ?? crypto.randomUUID();
  const e = item.event;
  await db.query(
    `
    INSERT INTO events (
      id, category, title_i18n, description_i18n, source_language,
      venue_name, address, postal_code, city, latitude, longitude, location,
      public_url, image_url, is_free, price_min, currency, status,
      normalized_title, last_seen_at
    ) VALUES (
      $1,$2,$3::jsonb,$4::jsonb,$5,$6,$7,$8,$9,$10,$11,
      ST_SetSRID(ST_MakePoint($11,$10),4326)::geography,
      $12,$13,$14,$15,$16,$17,$18,now()
    ) ON CONFLICT (id) DO UPDATE SET
      category=EXCLUDED.category, title_i18n=EXCLUDED.title_i18n,
      description_i18n=EXCLUDED.description_i18n, source_language=EXCLUDED.source_language,
      venue_name=EXCLUDED.venue_name, address=EXCLUDED.address,
      postal_code=EXCLUDED.postal_code, city=EXCLUDED.city,
      latitude=EXCLUDED.latitude, longitude=EXCLUDED.longitude,
      location=EXCLUDED.location, public_url=EXCLUDED.public_url,
      image_url=EXCLUDED.image_url, is_free=EXCLUDED.is_free,
      price_min=EXCLUDED.price_min, currency=EXCLUDED.currency,
      status=EXCLUDED.status, normalized_title=EXCLUDED.normalized_title,
      last_seen_at=now()
  `,
    [
      eventId,
      e.category,
      JSON.stringify(e.titleI18n),
      JSON.stringify(e.descriptionI18n),
      e.sourceLanguage,
      e.venueName,
      e.address,
      e.postalCode,
      e.city,
      e.latitude,
      e.longitude,
      e.publicUrl,
      e.imageUrl,
      e.isFree,
      e.priceMin,
      e.currency,
      e.status,
      e.normalizedTitle,
    ],
  );
  await db.query(
    `
    INSERT INTO source_records (id,source,external_id,event_id,source_url,
      source_updated_at,raw_excerpt,last_seen_at)
    VALUES (gen_random_uuid(),$1,$2,$3,$4,$5,$6::jsonb,now())
    ON CONFLICT (source,external_id) DO UPDATE SET
      source_url=EXCLUDED.source_url,source_updated_at=EXCLUDED.source_updated_at,
      raw_excerpt=EXCLUDED.raw_excerpt,last_seen_at=now()
  `,
    [
      SOURCE,
      item.externalId,
      eventId,
      item.sourceUrl,
      item.sourceUpdatedAt,
      JSON.stringify(item.rawExcerpt),
    ],
  );
  for (const occurrence of item.occurrences) {
    await db.query(
      `
      INSERT INTO event_occurrences
        (id,event_id,starts_at,ends_at,timezone,status,source_fingerprint)
      VALUES (gen_random_uuid(),$1,$2,$3,'Europe/Paris',$4,$5)
      ON CONFLICT (event_id,source_fingerprint) DO UPDATE SET
        starts_at=EXCLUDED.starts_at,ends_at=EXCLUDED.ends_at,
        status=EXCLUDED.status
    `,
      [
        eventId,
        occurrence.startsAt,
        occurrence.endsAt,
        e.status === 'cancelled' ? 'cancelled' : 'scheduled',
        occurrence.fingerprint,
      ],
    );
  }
  await db.query(
    `
    UPDATE event_occurrences SET status='cancelled'
    WHERE event_id=$1 AND source_fingerprint LIKE 'openagenda:%'
      AND source_fingerprint <> ALL($2::text[])
  `,
    [eventId, item.occurrences.map((occurrence) => occurrence.fingerprint)],
  );
  let candidates = 0;
  if (e.status === 'published') {
    const { rows: similar } = await db.query(
      `
      SELECT DISTINCT other.id
      FROM events other
      JOIN event_occurrences occ ON occ.event_id=other.id
      WHERE other.id<>$1 AND other.normalized_title=$2
        AND other.status='published' AND occ.status='scheduled'
        AND ST_DWithin(other.location,
          ST_SetSRID(ST_MakePoint($3,$4),4326)::geography,200)
        AND EXISTS (
          SELECT 1 FROM unnest($5::timestamptz[]) AS candidate(start_at)
          WHERE occ.starts_at BETWEEN candidate.start_at - interval '2 hours'
            AND candidate.start_at + interval '2 hours'
        ) LIMIT 20
    `,
      [
        eventId,
        e.normalizedTitle,
        e.longitude,
        e.latitude,
        item.occurrences.map((occurrence) => occurrence.startsAt),
      ],
    );
    for (const row of similar) {
      const [leftId, rightId] = [eventId, row.id].sort();
      const result = await db.query(
        `
        INSERT INTO dedupe_candidates
          (id,left_event_id,right_event_id,score,reason)
        VALUES (gen_random_uuid(),$1,$2,0.900,$3::jsonb)
        ON CONFLICT (left_event_id,right_event_id) DO NOTHING
      `,
        [
          leftId,
          rightId,
          JSON.stringify({
            rules: ['normalized_title', 'distance_200m', 'starts_within_2h'],
            source: SOURCE,
          }),
        ],
      );
      candidates += result.rowCount;
    }
  }
  return { created: !existingId, candidates };
}

async function main() {
  const limit = parseLimit(process.argv.slice(2));
  if (!process.env.DATABASE_URL_DIRECT || !process.env.OPENAGENDA_API_KEY)
    throw new Error('DATABASE_URL_DIRECT et OPENAGENDA_API_KEY requis');
  const api = createOpenAgendaClient({
    apiKey: process.env.OPENAGENDA_API_KEY,
    maxRequests: 100,
    intervalMs: 250,
  });
  const db = new pg.Client({
    connectionString: process.env.DATABASE_URL_DIRECT,
    connectionTimeoutMillis: 30_000,
    query_timeout: 30_000,
    statement_timeout: 30_000,
  });
  let leaseOwned = false;
  try {
    await db.connect();
    const lease = await db.query(
      `
      INSERT INTO sync_state (source,last_attempt_at,lease_until)
      VALUES ($1,now(),now()+interval '1 hour')
      ON CONFLICT (source) DO UPDATE SET
        last_attempt_at=now(),lease_until=now()+interval '1 hour'
      WHERE sync_state.lease_until IS NULL OR sync_state.lease_until<now()
      RETURNING source
    `,
      [SOURCE],
    );
    if (lease.rowCount !== 1) throw new Error('Ingestion OpenAgenda déjà en cours');
    leaseOwned = true;
    const { rows: agendas } = await db.query(`
      SELECT agenda_uid,name,priority FROM source_agendas
      WHERE enabled=true ORDER BY priority DESC,agenda_uid
    `);
    if (agendas.length === 0) throw new Error('Aucun agenda OpenAgenda activé');
    if (agendas.some((agenda) => !SLUGS.has(agenda.agenda_uid)))
      throw new Error('Agenda activé non prévu dans cet import limité');
    const seen = new Set();
    let allSuccess = true;
    for (const agenda of agendas) {
      const runId = crypto.randomUUID();
      const counts = {
        fetched: 0,
        accepted: 0,
        rejected: 0,
        outside: 0,
        created: 0,
        updated: 0,
        repeated: 0,
        candidates: 0,
      };
      await db.query(
        `INSERT INTO ingestion_runs (id,source,status)
        VALUES ($1,$2,'running')`,
        [runId, `${SOURCE}:${agenda.agenda_uid}`],
      );
      try {
        let after = null;
        const cursors = new Set();
        do {
          const page = await api.fetchEventPage({ agendaUid: agenda.agenda_uid, after, size: 100 });
          for (const raw of page.events) {
            if (limit !== null && counts.fetched >= limit) break;
            counts.fetched++;
            const item = normalizeOpenAgendaEvent(raw, {
              agendaUid: agenda.agenda_uid,
              agendaSlug: SLUGS.get(agenda.agenda_uid),
              priority: agenda.priority,
            });
            if (!item.ok) {
              counts.rejected++;
              continue;
            }
            if (!(await insideRadius(db, item.event.longitude, item.event.latitude))) {
              counts.outside++;
              continue;
            }
            if (seen.has(item.externalId)) {
              counts.repeated++;
              continue;
            }
            await db.query('BEGIN');
            try {
              const result = await upsertEvent(db, item);
              await db.query('COMMIT');
              seen.add(item.externalId);
              counts.accepted++;
              counts[result.created ? 'created' : 'updated']++;
              counts.candidates += result.candidates;
            } catch (error) {
              await db.query('ROLLBACK');
              throw error;
            }
          }
          if (limit !== null && counts.fetched >= limit) break;
          after = page.after;
          if (after !== null) {
            const key = JSON.stringify(after);
            if (cursors.has(key)) throw new OpenAgendaError('REPEATED_CURSOR');
            cursors.add(key);
          }
        } while (after !== null);
        await db.query(
          `UPDATE ingestion_runs SET status='success',finished_at=now(),
          fetched_count=$2,accepted_count=$3,rejected_count=$4,merged_count=0
          WHERE id=$1`,
          [runId, counts.fetched, counts.accepted, counts.rejected + counts.outside],
        );
        log('agenda_finished', { agendaUid: agenda.agenda_uid, runId, ...counts });
      } catch (error) {
        allSuccess = false;
        const code =
          error instanceof OpenAgendaError
            ? error.code
            : typeof error?.code === 'string'
              ? error.code
              : 'INGEST_FAILED';
        await db.query(
          `UPDATE ingestion_runs SET status='failed',finished_at=now(),
          fetched_count=$2,accepted_count=$3,rejected_count=$4,merged_count=0,
          error_summary=$5 WHERE id=$1`,
          [runId, counts.fetched, counts.accepted, counts.rejected + counts.outside, code],
        );
        log('agenda_failed', { agendaUid: agenda.agenda_uid, runId, code });
        throw error;
      }
    }
    await db.query(
      `UPDATE sync_state SET lease_until=NULL,
      last_success_at=CASE WHEN $2 THEN now() ELSE last_success_at END,
      failure_count=CASE WHEN $2 THEN 0 ELSE failure_count+1 END,
      last_error_code=CASE WHEN $2 THEN NULL ELSE 'INGEST_FAILED' END
      WHERE source=$1`,
      [SOURCE, allSuccess && limit === null],
    );
    leaseOwned = false;
    log('finished', { requests: api.requestCount, agendas: agendas.length });
  } catch (error) {
    if (leaseOwned)
      await db
        .query(
          `UPDATE sync_state SET lease_until=NULL,
      failure_count=failure_count+1,last_error_code=$2 WHERE source=$1`,
          [SOURCE, error instanceof OpenAgendaError ? error.code : 'INGEST_FAILED'],
        )
        .catch(() => {});
    throw error;
  } finally {
    await db.end().catch(() => {});
  }
}

await main().catch((error) => {
  log('failed', {
    code:
      error instanceof OpenAgendaError
        ? error.code
        : typeof error?.code === 'string'
          ? error.code
          : 'INGEST_FAILED',
  });
  process.exitCode = 1;
});
