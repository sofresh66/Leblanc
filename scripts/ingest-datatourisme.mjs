import 'dotenv/config';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { createDatatourismeClient, DatatourismePageError } from './lib/datatourisme-client.mjs';
import { normalizeDatatourismeEvent } from './lib/datatourisme-normalizer.mjs';
import { carryRecordMismatch, contentFingerprint, validateTranslations } from './lib/translation-validator.mjs';
import { loadTranslationOverrides, reportRows, writeTranslationReport } from './lib/translation-report.mjs';

const OVERRIDES_FILE = new URL('../data/translation-overrides.json', import.meta.url);
const REPORT_FILE = new URL('../artifacts/translation-report.csv', import.meta.url);

const SOURCE = 'datatourisme';
const CENTER = { latitude: 46.6333, longitude: 1.0833, radiusKm: 20 };
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function log(step, count = 0, errors = 0, details = {}) {
  console.log(
    JSON.stringify({ step, timestamp: new Date().toISOString(), count, errors, ...details }),
  );
}

function parseLimit(args) {
  const option = args.find((arg) => arg.startsWith('--limit='));
  if (
    args.some((arg) => !arg.startsWith('--limit=')) ||
    args.filter((arg) => arg.startsWith('--limit=')).length > 1
  ) {
    throw new Error('Argument attendu : --limit=N');
  }
  if (!option) return null;
  const value = Number(option.slice('--limit='.length));
  if (!Number.isSafeInteger(value) || value < 1)
    throw new Error('--limit doit être un entier positif');
  return value;
}

async function upsertEvent(client, item, translationRows = []) {
  const { rows } = await client.query(
    'SELECT event_id FROM source_records WHERE source = $1 AND external_id = $2 FOR UPDATE',
    [SOURCE, item.externalId],
  );
  const existingId = rows[0]?.event_id;
  if (item.translationStatus) {
    // Un rejet de fiche (embeddings) n'est conservé que si le contenu source est inchangé.
    const previous = existingId
      ? (await client.query('SELECT translation_status FROM events WHERE id = $1', [existingId])).rows[0]?.translation_status
      : null;
    const carried = carryRecordMismatch(item.translationStatus, previous,
      contentFingerprint(item.event.titleI18n, item.event.descriptionI18n));
    item.translationStatus = carried.status;
    translationRows.push(...reportRows({ eventId: existingId ?? '', externalId: item.externalId,
      titleFr: item.event.titleI18n.fr }, carried.status, { rescore: carried.rescore }));
  }
  const eventId = existingId ?? crypto.randomUUID();
  const e = item.event;
  await client.query(
    `
    INSERT INTO events (
      id, category, title_i18n, description_i18n, source_language,
      venue_name, address, postal_code, city, latitude, longitude, location,
      public_url, image_url, is_free, price_min, currency, status,
      normalized_title, translation_status, last_seen_at
    ) VALUES (
      $1, $2, $3::jsonb, $4::jsonb, $5,
      $6, $7, $8, $9, $10, $11, ST_SetSRID(ST_MakePoint($11, $10), 4326)::geography,
      $12, $13, $14, $15, $16, 'published', $17, $18::jsonb, now()
    )
    ON CONFLICT (id) DO UPDATE SET
      category = EXCLUDED.category, title_i18n = EXCLUDED.title_i18n,
      description_i18n = EXCLUDED.description_i18n, source_language = EXCLUDED.source_language,
      venue_name = EXCLUDED.venue_name, address = EXCLUDED.address,
      postal_code = EXCLUDED.postal_code, city = EXCLUDED.city,
      latitude = EXCLUDED.latitude, longitude = EXCLUDED.longitude,
      location = EXCLUDED.location, public_url = EXCLUDED.public_url,
      image_url = EXCLUDED.image_url, is_free = EXCLUDED.is_free,
      price_min = EXCLUDED.price_min, currency = EXCLUDED.currency,
      status = EXCLUDED.status, normalized_title = EXCLUDED.normalized_title,
      translation_status = EXCLUDED.translation_status, last_seen_at = now()
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
      e.normalizedTitle,
      JSON.stringify(item.translationStatus ?? {}),
    ],
  );

  await client.query(
    `
    INSERT INTO source_records (id, source, external_id, event_id, source_url, source_updated_at, raw_excerpt, last_seen_at)
    VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6::jsonb, now())
    ON CONFLICT (source, external_id) DO UPDATE SET
      source_url = EXCLUDED.source_url, source_updated_at = EXCLUDED.source_updated_at,
      raw_excerpt = EXCLUDED.raw_excerpt, last_seen_at = now()
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
    await client.query(
      `
      INSERT INTO event_occurrences (id, event_id, starts_at, ends_at, timezone, status, source_fingerprint, all_day)
      VALUES (gen_random_uuid(), $1, $2, $3, 'Europe/Paris', 'scheduled', $4, $5)
      ON CONFLICT (event_id, source_fingerprint) DO UPDATE SET
        starts_at = EXCLUDED.starts_at, ends_at = EXCLUDED.ends_at,
        timezone = EXCLUDED.timezone, status = 'scheduled', all_day = EXCLUDED.all_day
    `,
      [eventId, occurrence.startsAt, occurrence.endsAt, occurrence.fingerprint, occurrence.allDay === true],
    );
  }
  await client.query(
    `
    UPDATE event_occurrences SET status = 'cancelled'
    WHERE event_id = $1 AND source_fingerprint LIKE 'datatourisme:%'
      AND source_fingerprint <> ALL($2::text[])
  `,
    [eventId, item.occurrences.map((occurrence) => occurrence.fingerprint)],
  );

  const { rows: similar } = await client.query(
    `
    SELECT DISTINCT other.id
    FROM events other JOIN event_occurrences occ ON occ.event_id = other.id
    WHERE other.id <> $1 AND other.normalized_title = $2
      AND other.status = 'published' AND occ.status = 'scheduled'
      AND ST_DWithin(other.location, ST_SetSRID(ST_MakePoint($3, $4), 4326)::geography, 200)
      AND EXISTS (SELECT 1 FROM unnest($5::timestamptz[]) AS candidate(start_at)
                  WHERE occ.starts_at BETWEEN candidate.start_at - interval '2 hours'
                                          AND candidate.start_at + interval '2 hours')
    LIMIT 20
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
    await client.query(
      `
      INSERT INTO dedupe_candidates (id, left_event_id, right_event_id, score, reason)
      VALUES (gen_random_uuid(), $1, $2, 0.900, $3::jsonb)
      ON CONFLICT (left_event_id, right_event_id) DO NOTHING
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
  }
  return existingId ? 'updated' : 'created';
}

async function main() {
  const limit = parseLimit(process.argv.slice(2));
  const databaseUrl = process.env.DATABASE_URL_DIRECT;
  const apiKey = process.env.DATATOURISME_API_KEY;
  if (!databaseUrl || !apiKey)
    throw new Error('DATABASE_URL_DIRECT et DATATOURISME_API_KEY requis');
  const api = createDatatourismeClient({ apiKey });
  const overrides = await loadTranslationOverrides(OVERRIDES_FILE);
  const translationRows = [];
  const client = new pg.Client({
    connectionString: databaseUrl,
    connectionTimeoutMillis: 30_000,
    query_timeout: 30_000,
    statement_timeout: 30_000,
  });
  const runId = crypto.randomUUID();
  let leaseOwned = false;
  let runStarted = false;
  const counts = {
    fetched: 0,
    accepted: 0,
    rejected: 0,
    created: 0,
    updated: 0,
    pageErrors: 0,
    allDay: 0,
  };
  try {
    await client.connect();
    const lease = await client.query(
      `
      INSERT INTO sync_state (source, last_attempt_at, lease_until)
      VALUES ($1, now(), now() + interval '1 hour')
      ON CONFLICT (source) DO UPDATE SET
        last_attempt_at = now(), lease_until = now() + interval '1 hour'
      WHERE sync_state.lease_until IS NULL OR sync_state.lease_until < now()
      RETURNING source
    `,
      [SOURCE],
    );
    if (lease.rowCount !== 1) throw new Error('Ingestion DATAtourisme déjà en cours');
    leaseOwned = true;
    await client.query('INSERT INTO ingestion_runs (id, source, status) VALUES ($1, $2, $3)', [
      runId,
      SOURCE,
      'running',
    ]);
    runStarted = true;
    log('start', 0, 0, { runId, limit });

    const pageSize = Math.min(50, limit ?? 50);
    let totalPages = 1;
    let consecutiveFailures = 0;
    let nextUrl = null;
    for (let page = 1; page <= totalPages && (limit === null || counts.fetched < limit); page++) {
      let payload;
      try {
        payload = await api.fetchPage({ page, pageSize, nextUrl, ...CENTER });
        totalPages = payload.meta.total_pages;
        nextUrl = payload.meta.next ?? null;
        consecutiveFailures = 0;
      } catch (error) {
        nextUrl = null;
        counts.pageErrors++;
        consecutiveFailures++;
        log('page_failed', 0, 1, {
          page,
          totalPages,
          code: error instanceof DatatourismePageError ? error.status : 'UNKNOWN',
        });
        if (page === 1 || consecutiveFailures >= 5) throw error;
        // Après 1 s et 4 s entre tentatives, laisser 16 s avant la page suivante.
        await delay(16_000);
        continue;
      }
      const remaining =
        limit === null ? payload.objects.length : Math.max(0, limit - counts.fetched);
      const objects = payload.objects.slice(0, remaining);
      counts.fetched += objects.length;
      const accepted = objects.map(normalizeDatatourismeEvent);
      const valid = accepted.filter((item) => item.ok);
      // Statut réévalué à chaque ingestion ; la donnée brute reste intacte.
      for (const item of valid) {
        item.translationStatus = validateTranslations(
          { titleI18n: item.event.titleI18n, descriptionI18n: item.event.descriptionI18n },
          { source: SOURCE, externalId: item.externalId, overrides },
        );
      }
      counts.rejected += accepted.length - valid.length;
      counts.allDay += valid.reduce(
        (sum, item) => sum + item.occurrences.filter((occurrence) => occurrence.allDay).length,
        0,
      );
      for (let index = 0; index < valid.length; index += 50) {
        const batch = valid.slice(index, index + 50);
        let batchCreated = 0;
        let batchUpdated = 0;
        await client.query('BEGIN');
        try {
          for (const item of batch) {
            const result = await upsertEvent(client, item, translationRows);
            if (result === 'created') batchCreated++;
            else batchUpdated++;
          }
          await client.query(
            `
            UPDATE ingestion_runs SET fetched_count = $2, accepted_count = $3,
              rejected_count = $4, merged_count = 0 WHERE id = $1
          `,
            [runId, counts.fetched, counts.accepted + batch.length, counts.rejected],
          );
          await client.query(
            "UPDATE sync_state SET lease_until = now() + interval '1 hour' WHERE source = $1",
            [SOURCE],
          );
          await client.query('COMMIT');
          counts.accepted += batch.length;
          counts.created += batchCreated;
          counts.updated += batchUpdated;
        } catch (error) {
          await client.query('ROLLBACK');
          throw error;
        }
      }
      if (valid.length === 0) {
        await client.query(
          'UPDATE ingestion_runs SET fetched_count=$2, rejected_count=$3 WHERE id=$1',
          [runId, counts.fetched, counts.rejected],
        );
      }
      log('page', counts.fetched, counts.rejected, {
        page,
        totalPages,
        accepted: counts.accepted,
        created: counts.created,
        updated: counts.updated,
      });
      if (page < totalPages && (limit === null || counts.fetched < limit)) await delay(300);
    }
    const translations = await writeTranslationReport(translationRows, fileURLToPath(REPORT_FILE));
    log('translations', translations.rejected, 0, translations);
    const status = counts.pageErrors ? 'partial' : 'success';
    await client.query(
      `UPDATE ingestion_runs SET status=$2, finished_at=now(), fetched_count=$3,
      accepted_count=$4, rejected_count=$5, merged_count=0,
      error_summary=$6 WHERE id=$1`,
      [
        runId,
        status,
        counts.fetched,
        counts.accepted,
        counts.rejected,
        counts.pageErrors ? `${counts.pageErrors} page(s) échouée(s)` : null,
      ],
    );
    await client.query(
      `UPDATE sync_state SET lease_until=NULL,
      last_success_at=CASE WHEN $2 THEN now() ELSE last_success_at END,
      failure_count=CASE WHEN $3 THEN failure_count+1 ELSE 0 END,
      last_error_code=CASE WHEN $3 THEN 'PAGE_FAILED' ELSE NULL END
      WHERE source=$1`,
      [SOURCE, limit === null && !counts.pageErrors, counts.pageErrors > 0],
    );
    leaseOwned = false;
    log('finished', counts.accepted, counts.pageErrors, { runId, status, ...counts });
    if (counts.pageErrors) process.exitCode = 1;
  } catch (error) {
    const code =
      error instanceof DatatourismePageError
        ? error.status
        : typeof error?.code === 'string'
          ? error.code
          : 'INGEST_FAILED';
    if (runStarted) {
      try {
        await client.query(
          `UPDATE ingestion_runs SET status='failed', finished_at=now(),
          fetched_count=$2, accepted_count=$3, rejected_count=$4, merged_count=0,
          error_summary=$5 WHERE id=$1`,
          [runId, counts.fetched, counts.accepted, counts.rejected, String(code)],
        );
      } catch {
        /* La connexion peut être indisponible. */
      }
    }
    if (leaseOwned) {
      try {
        await client.query(
          'UPDATE sync_state SET lease_until=NULL, failure_count=failure_count+1, last_error_code=$2 WHERE source=$1',
          [SOURCE, String(code)],
        );
      } catch {
        /* Le bail expirera en cas de panne de la connexion. */
      }
    }
    log('failed', counts.accepted, 1, { runId, code: String(code) });
    process.exitCode = 1;
  } finally {
    await client.end().catch(() => {});
  }
}

await main();
