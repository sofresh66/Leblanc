// Ingestion des parcours « Se balader » : itinéraires DATAtourisme (/v1/tour)
// dont le départ est à 20 km au plus du Blanc ou dans le PNR de la Brenne, avec
// tracé OpenStreetMap quand la correspondance est sûre.
// Usage : node scripts/ingest-routes.mjs [--dry-run] [--limit=N]
// --dry-run : rien n'est écrit (lecture seule de la base pour le décompte).
import 'dotenv/config';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { createDatatourismeRoutesClient, DatatourismeRoutesPageError } from './lib/datatourisme-routes-client.mjs';
import { normalizeDatatourismeRoute } from './lib/datatourisme-routes-normalizer.mjs';
import { LE_BLANC, haversineMeters, pointInGeometry } from './lib/geo.mjs';
import { createOverpassClient, OverpassError } from './lib/overpass-client.mjs';
import { OVERPASS_ROUTES_QUERY, indexMatchDecisions, matchRoute, prepareRelations } from './lib/route-osm-match.mjs';
import { ROUTES_LOCK_ID, ROUTES_RUN_SOURCE, ROUTES_SOURCE, hideStaleRoutes, upsertRoute } from './lib/routes-store.mjs';
import { validateTranslations } from './lib/translation-validator.mjs';
import { loadTranslationAllowlist, loadTranslationOverrides, summarize, writeTranslationReport } from './lib/translation-report.mjs';

const OVERRIDES_FILE = new URL('../data/translation-overrides.json', import.meta.url);
const ALLOWLIST_FILE = new URL('../data/translation-allowlist.json', import.meta.url);
const PNR_FILE = new URL('../data/pnr-brenne.geojson', import.meta.url);
const MATCHES_FILE = new URL('../data/route-osm-matches.json', import.meta.url);
const REPORT_FILE = new URL('../artifacts/translation-report-routes.csv', import.meta.url);
const RADIUS_M = 20_000;
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function log(step, details = {}) {
  console.log(JSON.stringify({ step, timestamp: new Date().toISOString(), ...details }));
}

export function parseArgs(args) {
  const allowed = args.every((arg) => arg === '--dry-run' || /^--limit=\d+$/.test(arg));
  if (!allowed || args.filter((arg) => arg.startsWith('--limit=')).length > 1) {
    throw new Error('Arguments attendus : [--dry-run] [--limit=N]');
  }
  const option = args.find((arg) => arg.startsWith('--limit='));
  const limit = option ? Number(option.slice('--limit='.length)) : null;
  if (limit !== null && (!Number.isSafeInteger(limit) || limit < 1)) throw new Error('--limit doit être un entier positif');
  return { dryRun: args.includes('--dry-run'), limit };
}

async function readJson(url, fallback) {
  try {
    return JSON.parse(await fs.readFile(url, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return fallback;
    throw error;
  }
}

async function appendSummary(lines) {
  if (process.env.GITHUB_STEP_SUMMARY) await fs.appendFile(process.env.GITHUB_STEP_SUMMARY, `${lines.join('\n')}\n`, 'utf8');
}

async function fetchAllTours(api, limit, counts) {
  const objects = [];
  let totalPages = 1;
  let nextUrl = null;
  let consecutiveFailures = 0;
  for (let page = 1; page <= totalPages && (limit === null || objects.length < limit); page++) {
    try {
      const payload = await api.fetchPage({ page, pageSize: 50, nextUrl });
      totalPages = payload.meta.total_pages;
      nextUrl = payload.meta.next ?? null;
      consecutiveFailures = 0;
      objects.push(...payload.objects);
      log('page', { page, totalPages, fetched: objects.length });
    } catch (error) {
      nextUrl = null;
      counts.pageErrors++;
      consecutiveFailures++;
      log('page_failed', { page, code: error instanceof DatatourismeRoutesPageError ? error.status : 'UNKNOWN' });
      if (page === 1 || consecutiveFailures >= 5) throw error;
      await delay(16_000);
      continue;
    }
    if (page < totalPages) await delay(300);
  }
  return limit === null ? objects : objects.slice(0, limit);
}

async function fetchRelations() {
  try {
    const overpass = createOverpassClient({ query: OVERPASS_ROUTES_QUERY, timeoutMs: 200_000 });
    const { elements, serverIndex } = await overpass.fetchElements();
    return { available: true, relations: prepareRelations(elements), serverIndex };
  } catch (error) {
    if (!(error instanceof OverpassError)) throw error;
    return { available: false, relations: [], code: error.code, serverCodes: error.serverCodes };
  }
}

async function main() {
  const { dryRun, limit } = parseArgs(process.argv.slice(2));
  const databaseUrl = process.env.DATABASE_URL_DIRECT;
  const apiKey = process.env.DATATOURISME_API_KEY;
  if (!databaseUrl || !apiKey) throw new Error('DATABASE_URL_DIRECT et DATATOURISME_API_KEY requis');
  console.error(`Base : ${new URL(databaseUrl).hostname} (${dryRun ? 'lecture seule' : 'ÉCRITURE'})`);

  const pnr = JSON.parse(await fs.readFile(PNR_FILE, 'utf8')).geometry;
  const decisions = indexMatchDecisions(await readJson(MATCHES_FILE, []));
  const overrides = await loadTranslationOverrides(OVERRIDES_FILE);
  const allowlist = await loadTranslationAllowlist(ALLOWLIST_FILE);
  const counts = { fetched: 0, pageErrors: 0, excluded: {}, outsidePerimeter: 0, accepted: 0, created: 0, updated: 0,
    withTrack: 0, forcedMatches: 0, hidden: 0, byMode: {} };

  const objects = await fetchAllTours(createDatatourismeRoutesClient({ apiKey }), limit, counts);
  counts.fetched = objects.length;
  const items = [];
  for (const raw of objects) {
    const item = normalizeDatatourismeRoute(raw);
    if (!item.ok) {
      counts.excluded[item.reason] = (counts.excluded[item.reason] ?? 0) + 1;
      continue;
    }
    if (haversineMeters(item.route.start, LE_BLANC) > RADIUS_M && !pointInGeometry(item.route.start, pnr)) {
      counts.outsidePerimeter++;
      continue;
    }
    item.translationStatus = validateTranslations(
      { titleI18n: item.route.titleI18n, descriptionI18n: item.route.descriptionI18n },
      { source: ROUTES_SOURCE, externalId: item.externalId, overrides, allowlist },
    );
    items.push(item);
  }

  const osm = await fetchRelations();
  log('osm', { available: osm.available, relations: osm.relations.length, code: osm.code ?? null,
    serverCodes: osm.serverCodes ?? null });
  for (const item of items) {
    item.match = osm.available ? matchRoute(item, osm.relations, decisions) : null;
    if (item.match) counts.withTrack++;
    if (item.match?.forced) counts.forcedMatches++;
    for (const mode of item.route.modes) counts.byMode[mode] = (counts.byMode[mode] ?? 0) + 1;
  }

  const client = new pg.Client({ connectionString: databaseUrl, connectionTimeoutMillis: 30_000,
    query_timeout: 60_000, statement_timeout: 60_000 });
  const runId = crypto.randomUUID();
  const translationRows = [];
  let locked = false;
  let runStarted = false;
  try {
    await client.connect();
    if (dryRun) {
      await client.query('BEGIN TRANSACTION READ ONLY');
      const { rows } = await client.query(
        'SELECT external_id FROM route_source_records WHERE source = $1 AND external_id = ANY($2::text[])',
        [ROUTES_SOURCE, items.map((item) => item.externalId)]);
      await client.query('ROLLBACK');
      counts.updated = rows.length;
      counts.created = items.length - rows.length;
      counts.accepted = items.length;
      const translations = summarize(items.flatMap((item) => Object.entries(item.translationStatus)
        .filter(([, entry]) => entry.status === 'rejected').map(([lang, entry]) => ({ lang, status: 'rejected', reason: entry.reason }))));
      log('dry_run', { ...counts, osmAvailable: osm.available, translationsRejected: translations.rejected,
        translationsByReason: translations.byReason });
      return;
    }

    const lock = await client.query('SELECT pg_try_advisory_lock($1) AS acquired', [ROUTES_LOCK_ID]);
    if (!lock.rows[0]?.acquired) throw new Error('Ingestion des parcours déjà en cours');
    locked = true;
    await client.query('INSERT INTO ingestion_runs (id, source, status) VALUES ($1, $2, $3)', [runId, ROUTES_RUN_SOURCE, 'running']);
    runStarted = true;

    for (let index = 0; index < items.length; index += 50) {
      const batch = items.slice(index, index + 50);
      await client.query('BEGIN');
      try {
        let created = 0;
        for (const item of batch) {
          const result = await upsertRoute(client, item, { match: item.match, osmAvailable: osm.available, translationRows });
          if (result === 'created') created++;
        }
        await client.query('UPDATE ingestion_runs SET fetched_count = $2, accepted_count = $3, rejected_count = $4, merged_count = 0 WHERE id = $1',
          [runId, counts.fetched, counts.accepted + batch.length, counts.fetched - items.length]);
        await client.query('COMMIT');
        counts.accepted += batch.length;
        counts.created += created;
        counts.updated += batch.length - created;
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    }
    // Masquage seulement après une collecte complète du flux.
    if (limit === null && counts.pageErrors === 0) counts.hidden = await hideStaleRoutes(client);

    const translations = await writeTranslationReport(translationRows, fileURLToPath(REPORT_FILE),
      { title: 'Traductions DATAtourisme (parcours)', idHeader: 'routeId' });
    const status = counts.pageErrors ? 'partial' : 'success';
    await client.query(`UPDATE ingestion_runs SET status = $2, finished_at = now(), fetched_count = $3, accepted_count = $4,
      rejected_count = $5, merged_count = 0, error_summary = $6 WHERE id = $1`,
    [runId, status, counts.fetched, counts.accepted, counts.fetched - items.length,
      [counts.pageErrors ? `${counts.pageErrors} page(s) échouée(s)` : null, osm.available ? null : `Overpass indisponible (${(osm.serverCodes ?? [osm.code]).join(', ')})`]
        .filter(Boolean).join(' ; ') || null]);

    await appendSummary([
      '### Parcours « Se balader »',
      `- Itinéraires reçus : ${counts.fetched}, publiés ou mis à jour : ${counts.accepted} (${counts.created} nouveaux)`,
      `- Hors périmètre (20 km ou PNR) : ${counts.outsidePerimeter} ; exclus : ${JSON.stringify(counts.excluded)}`,
      `- Avec tracé OSM : ${counts.withTrack}${counts.forcedMatches ? ` (dont ${counts.forcedMatches} forcés)` : ''}`,
      `- Masqués (absents du flux depuis 3 jours) : ${counts.hidden}`,
      osm.available ? '' : `\n> **Avertissement : Overpass indisponible (${(osm.serverCodes ?? [osm.code]).join(', ')}).** Les tracés existants ont été conservés.`,
      '',
    ]);
    log('finished', { runId, status, osmAvailable: osm.available, ...counts, translations });
    if (!osm.available) console.log(`::warning::Overpass indisponible (${(osm.serverCodes ?? [osm.code]).join(', ')}) : tracés existants conservés`);
    if (counts.pageErrors) process.exitCode = 1;
  } catch (error) {
    const code = error instanceof DatatourismeRoutesPageError ? error.status : (typeof error?.code === 'string' ? error.code : 'INGEST_FAILED');
    if (runStarted) {
      await client.query(`UPDATE ingestion_runs SET status = 'failed', finished_at = now(), error_summary = $2 WHERE id = $1`,
        [runId, String(code)]).catch(() => {});
    }
    log('failed', { runId, code: String(code), message: error instanceof Error ? error.message : String(error) });
    process.exitCode = 1;
  } finally {
    if (locked) await client.query('SELECT pg_advisory_unlock($1)', [ROUTES_LOCK_ID]).catch(() => {});
    await client.end().catch(() => {});
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) await main();
