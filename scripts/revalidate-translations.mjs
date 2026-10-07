// Réévalue le statut des traductions des événements DATAtourisme déjà en base.
// Par défaut : simulation en lecture seule, avec le diff. --apply écrit les
// nouveaux statuts dans une transaction (jamais la donnée brute).
// Usage : node scripts/revalidate-translations.mjs [--apply] [--json]
import 'dotenv/config';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import {
  carryRecordMismatch, comparableStatus, contentFingerprint, validateTranslations,
} from './lib/translation-validator.mjs';
import { loadTranslationOverrides, reportRows, summarize, toCsv } from './lib/translation-report.mjs';
import fs from 'node:fs/promises';

const SOURCE = 'datatourisme';
const APPLY = process.argv.includes('--apply');
const OVERRIDES_FILE = new URL('../data/translation-overrides.json', import.meta.url);
const REPORT_FILE = fileURLToPath(new URL('../artifacts/translation-revalidation.csv', import.meta.url));

const databaseUrl = process.env.DATABASE_URL_DIRECT;
if (!databaseUrl) throw new Error('DATABASE_URL_DIRECT est requis');
console.error(`Base : ${new URL(databaseUrl).hostname} (${APPLY ? 'ÉCRITURE' : 'lecture seule'})`);

const overrides = await loadTranslationOverrides(OVERRIDES_FILE);
const client = new pg.Client({ connectionString: databaseUrl, connectionTimeoutMillis: 30000 });
await client.connect();
try {
  await client.query(APPLY ? 'BEGIN' : 'BEGIN TRANSACTION READ ONLY');
  const { rows } = await client.query(`
    SELECT e.id, sr.external_id, e.status, e.title_i18n, e.description_i18n, e.translation_status
    FROM events e JOIN source_records sr ON sr.event_id = e.id AND sr.source = $1
    ORDER BY e.id`, [SOURCE]);
  const checkedAt = new Date().toISOString();
  const changes = [];
  const report = [];
  for (const row of rows) {
    const { status: next, rescore } = carryRecordMismatch(validateTranslations(
      { titleI18n: row.title_i18n, descriptionI18n: row.description_i18n },
      { source: SOURCE, externalId: row.external_id, overrides, checkedAt },
    ), row.translation_status, contentFingerprint(row.title_i18n, row.description_i18n));
    report.push(...reportRows({ eventId: row.id, externalId: row.external_id, titleFr: row.title_i18n.fr }, next, { rescore })
      .map((line) => ({ ...line, eventStatus: row.status })));
    if (comparableStatus(next) !== comparableStatus(row.translation_status)) changes.push({ id: row.id, next });
  }

  const summary = summarize(report);
  const rejected = report.filter((line) => line.status === 'rejected');
  const output = {
    step: APPLY ? 'apply' : 'dry_run',
    events: rows.length,
    changed: changes.length,
    ...summary,
    rejected: rejected.map(({ eventId, lang, reason, titleFr, eventStatus }) => ({ eventId, lang, reason, eventStatus, titleFr })),
    ignoredTitlesByLang: countBy(report.filter((line) => line.titleStatus === 'ignored_identical'), 'lang'),
    ignoredDescriptionsByLang: countBy(report.filter((line) => line.descriptionStatus === 'ignored_identical'), 'lang'),
    warningsByType: countBy(report.flatMap((line) => line.warnings ? line.warnings.split('|').map((warning) => ({ warning })) : []), 'warning'),
    report: REPORT_FILE,
  };
  await fs.mkdir(new URL('../artifacts/', import.meta.url), { recursive: true });
  await fs.writeFile(REPORT_FILE, toCsv(report), 'utf8');

  if (APPLY) {
    for (const change of changes) {
      await client.query('UPDATE events SET translation_status = $2::jsonb WHERE id = $1', [change.id, JSON.stringify(change.next)]);
    }
    await client.query('COMMIT');
  } else {
    await client.query('ROLLBACK');
  }
  console.log(JSON.stringify(output, null, 2));
} catch (error) {
  await client.query('ROLLBACK').catch(() => {});
  throw error;
} finally {
  await client.end();
}

function countBy(items, key) {
  const counts = {};
  for (const item of items) counts[item[key]] = (counts[item[key]] ?? 0) + 1;
  return counts;
}
