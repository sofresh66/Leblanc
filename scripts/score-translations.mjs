// Rapport de similarité sémantique des traductions DATAtourisme (Workers AI
// @cf/baai/bge-m3). Lecture seule en base ; aucun statut n'est modifié.
// Variables : DATABASE_URL_DIRECT, CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_AI_TOKEN.
// Usage : node scripts/score-translations.mjs [--limit=N]
import 'dotenv/config';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { validateTranslations } from './lib/translation-validator.mjs';
import { loadTranslationOverrides } from './lib/translation-report.mjs';
import { createWorkersAiEmbedder, scoreDistribution, scoreTranslations } from './lib/translation-scoring.mjs';

const SOURCE = 'datatourisme';
const OVERRIDES_FILE = new URL('../data/translation-overrides.json', import.meta.url);
const CSV_FILE = fileURLToPath(new URL('../artifacts/translation-scores.csv', import.meta.url));
const limitArg = process.argv.find((arg) => arg.startsWith('--limit='));
const limit = limitArg ? Number(limitArg.slice('--limit='.length)) : null;

const databaseUrl = process.env.DATABASE_URL_DIRECT;
if (!databaseUrl) throw new Error('DATABASE_URL_DIRECT est requis');
const embed = createWorkersAiEmbedder({
  accountId: process.env.CLOUDFLARE_ACCOUNT_ID, apiToken: process.env.CLOUDFLARE_AI_TOKEN,
});
const overrides = await loadTranslationOverrides(OVERRIDES_FILE);

const client = new pg.Client({ connectionString: databaseUrl, connectionTimeoutMillis: 30000 });
await client.connect();
let events;
try {
  await client.query('BEGIN TRANSACTION READ ONLY');
  const { rows } = await client.query(`
    SELECT e.id, sr.external_id, e.title_i18n, e.description_i18n
    FROM events e JOIN source_records sr ON sr.event_id = e.id AND sr.source = $1
    WHERE e.status = 'published' ORDER BY e.id ${limit ? 'LIMIT ' + Math.max(1, Math.floor(limit)) : ''}`, [SOURCE]);
  await client.query('ROLLBACK');
  events = rows.map((row) => ({
    id: row.id, externalId: row.external_id, titleI18n: row.title_i18n, descriptionI18n: row.description_i18n,
    translationStatus: validateTranslations({ titleI18n: row.title_i18n, descriptionI18n: row.description_i18n },
      { source: SOURCE, externalId: row.external_id, overrides }),
  }));
} finally {
  await client.end();
}

const rows = await scoreTranslations(events, embed);
const columns = ['eventId', 'externalId', 'lang', 'status', 'reason', 'titleScore', 'descriptionScore', 'titleFr', 'translatedStart'];
const cell = (value) => (/[",\n]/.test(String(value ?? '')) ? `"${String(value).replace(/"/g, '""')}"` : String(value ?? ''));
await fs.mkdir(new URL('../artifacts/', import.meta.url), { recursive: true });
await fs.writeFile(CSV_FILE, [columns.join(','), ...rows.map((row) => columns.map((column) => cell(row[column])).join(','))].join('\n') + '\n');
await fs.writeFile(CSV_FILE.replace(/\.csv$/, '.json'), JSON.stringify(rows, null, 1));
console.log(JSON.stringify({ step: 'scores', events: events.length, pairs: rows.length, csv: CSV_FILE,
  ...scoreDistribution(rows) }, null, 2));
