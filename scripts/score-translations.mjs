// Rapport de similarité sémantique des traductions DATAtourisme (Workers AI
// @cf/baai/bge-m3). Par défaut : lecture seule, aucun statut modifié.
// --apply : rejette toutes les traductions d'une fiche dont toutes les
// descriptions traduites ont un score < 0,50 (record_mismatch), hors liste
// blanche, avec l'empreinte du contenu ; lève ce rejet si la fiche ne remplit
// plus la condition. Écrit aussi le CSV de signalement par producteur.
// Variables : DATABASE_URL_DIRECT, CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_AI_TOKEN.
// Usage : node scripts/score-translations.mjs [--apply] [--limit=N]
import 'dotenv/config';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import {
  RECORD_MISMATCH, applyRecordMismatch, comparableStatus, contentFingerprint, indexAllowlist, validateTranslations,
} from './lib/translation-validator.mjs';
import { loadTranslationOverrides } from './lib/translation-report.mjs';
import { createWorkersAiEmbedder, scoreDistribution, scoreTranslations } from './lib/translation-scoring.mjs';

const SOURCE = 'datatourisme';
const THRESHOLD = 0.5;
const APPLY = process.argv.includes('--apply');
const OVERRIDES_FILE = new URL('../data/translation-overrides.json', import.meta.url);
const ALLOWLIST_FILE = new URL('../data/translation-allowlist.json', import.meta.url);
const CSV_FILE = fileURLToPath(new URL('../artifacts/translation-scores.csv', import.meta.url));
const limitArg = process.argv.find((arg) => arg.startsWith('--limit='));
const limit = limitArg ? Number(limitArg.slice('--limit='.length)) : null;
if (APPLY && limit) throw new Error('--apply ne peut pas être combiné avec --limit');

const databaseUrl = process.env.DATABASE_URL_DIRECT;
if (!databaseUrl) throw new Error('DATABASE_URL_DIRECT est requis');
console.error(`Base : ${new URL(databaseUrl).hostname} (${APPLY ? 'ÉCRITURE des statuts' : 'lecture seule'})`);
const embed = createWorkersAiEmbedder({
  accountId: process.env.CLOUDFLARE_ACCOUNT_ID, apiToken: process.env.CLOUDFLARE_AI_TOKEN,
});
const overrides = await loadTranslationOverrides(OVERRIDES_FILE);
const allowlist = indexAllowlist(JSON.parse(await fs.readFile(ALLOWLIST_FILE, 'utf8')));

const cell = (value) => (/[",\n]/.test(String(value ?? '')) ? `"${String(value).replace(/"/g, '""')}"` : String(value ?? ''));
const toCsv = (columns, rows) => [columns.join(','), ...rows.map((row) => columns.map((column) => cell(row[column])).join(','))].join('\n') + '\n';

const client = new pg.Client({ connectionString: databaseUrl, connectionTimeoutMillis: 30000 });
await client.connect();
try {
  await client.query('BEGIN TRANSACTION READ ONLY');
  const { rows: dbRows } = await client.query(`
    SELECT e.id, sr.external_id, sr.source_url, sr.source_updated_at, sr.raw_excerpt->>'producer' AS producer,
      e.title_i18n, e.description_i18n, e.translation_status
    FROM events e JOIN source_records sr ON sr.event_id = e.id AND sr.source = $1
    WHERE e.status = 'published' ORDER BY e.id ${limit ? 'LIMIT ' + Math.max(1, Math.floor(limit)) : ''}`, [SOURCE]);
  await client.query('ROLLBACK');

  const checkedAt = new Date().toISOString();
  const events = dbRows.map((row) => ({
    ...row, externalId: row.external_id, titleI18n: row.title_i18n, descriptionI18n: row.description_i18n,
    translationStatus: validateTranslations({ titleI18n: row.title_i18n, descriptionI18n: row.description_i18n },
      { source: SOURCE, externalId: row.external_id, overrides, allowlist, checkedAt }),
  }));
  const scores = await scoreTranslations(events, embed);

  // Décision par fiche, sur les scores de description de toutes les langues.
  const decisions = events.map((event) => {
    const eventScores = scores.filter((row) => row.eventId === event.id);
    const decision = applyRecordMismatch(event.translationStatus, {
      scores: eventScores.map((row) => row.descriptionScore),
      fingerprint: contentFingerprint(event.titleI18n, event.descriptionI18n),
      allowlisted: allowlist.has(`${SOURCE}|${event.externalId}`),
      threshold: THRESHOLD, checkedAt,
    });
    const hadMismatch = Object.values(event.translation_status ?? {}).some((entry) => entry?.reason === RECORD_MISMATCH);
    return { event, ...decision, hadMismatch, enStart: eventScores.find((row) => row.lang === 'en')?.translatedStart ?? '' };
  });
  const flagged = decisions.filter((decision) => decision.flagged);
  const lifted = decisions.filter((decision) => !decision.flagged && decision.hadMismatch);
  const changes = decisions.filter((decision) => (decision.flagged || decision.hadMismatch)
    && comparableStatus(decision.status) !== comparableStatus(decision.event.translation_status));

  await fs.mkdir(new URL('../artifacts/', import.meta.url), { recursive: true });
  await fs.writeFile(CSV_FILE, toCsv(['eventId', 'externalId', 'lang', 'status', 'reason', 'titleScore', 'descriptionScore', 'titleFr', 'translatedStart'], scores));
  await fs.writeFile(CSV_FILE.replace(/\.csv$/, '.json'), JSON.stringify(scores, null, 1));

  // Signalement aux producteurs : une ligne par fiche à corriger dans la source.
  const reports = {};
  const reportLine = (event, motif, scoreMax, enStart) => {
    const producer = event.producer || 'inconnu';
    (reports[producer] ??= []).push({
      producteur: producer, motif, identifiantDatatourisme: event.external_id, uri: event.source_url ?? '',
      titreFr: event.title_i18n.fr, miseAJourSource: event.source_updated_at?.toISOString?.().slice(0, 10) ?? '',
      scoreMax, debutTraductionAnglaise: enStart,
    });
  };
  for (const { event, max, enStart } of flagged) {
    reportLine(event, 'traductions d’un autre événement', max.toFixed(3), enStart);
  }
  // Description française absente (traductions invérifiables), liste blanche comprise :
  // la source reste à corriger même si la traduction a été relue.
  for (const event of events) {
    const translated = Object.entries(event.descriptionI18n ?? {}).filter(([lang, text]) => lang !== 'fr' && String(text ?? '').trim());
    if (!String(event.descriptionI18n?.fr ?? '').trim() && translated.length) {
      const en = String(event.descriptionI18n.en ?? '').replace(/\s+/g, ' ').slice(0, 90);
      reportLine(event, 'description française absente', '', en);
    }
  }
  const reportFiles = [];
  for (const [producer, lines] of Object.entries(reports)) {
    const slug = producer.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const file = fileURLToPath(new URL(`../artifacts/signalement-${slug}.csv`, import.meta.url));
    await fs.writeFile(file, toCsv(Object.keys(lines[0]), lines.sort((a, b) => a.titreFr.localeCompare(b.titreFr, 'fr'))));
    reportFiles.push({ producer, fiches: lines.length, file });
  }

  if (APPLY && changes.length) {
    await client.query('BEGIN');
    try {
      for (const { event, status } of changes) {
        await client.query('UPDATE events SET translation_status = $2::jsonb WHERE id = $1', [event.id, JSON.stringify(status)]);
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    }
  }

  console.log(JSON.stringify({
    step: APPLY ? 'apply' : 'scores', events: events.length, pairs: scores.length, threshold: THRESHOLD,
    recordMismatch: flagged.length, allowlisted: allowlist.size, lifted: lifted.length,
    written: APPLY ? changes.length : 0, reportFiles, ...scoreDistribution(scores, [0.45, THRESHOLD, 0.55, 0.6]),
  }, (key, value) => (key === 'belowThreshold' ? Object.fromEntries(Object.entries(value).map(([t, list]) => [t, list.length])) : value), 2));
} finally {
  await client.end();
}
