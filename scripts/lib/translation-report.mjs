import fs from 'node:fs/promises';
import path from 'node:path';
import { indexAllowlist, indexOverrides } from './translation-validator.mjs';

/** Charge data/translation-overrides.json (absent = aucun override). */
export async function loadTranslationOverrides(file) {
  try {
    return indexOverrides(JSON.parse(await fs.readFile(file, 'utf8')));
  } catch (error) {
    if (error.code === 'ENOENT') return new Map();
    throw error;
  }
}

/**
 * Charge data/translation-allowlist.json : fiches relues, exemptées des règles
 * automatiques au niveau de la fiche (record_mismatch, no_reference).
 */
export async function loadTranslationAllowlist(file) {
  try {
    return indexAllowlist(JSON.parse(await fs.readFile(file, 'utf8')));
  } catch (error) {
    if (error.code === 'ENOENT') return new Set();
    throw error;
  }
}

/** Une ligne par langue rejetée, ignorée ou signalée. */
export function reportRows({ eventId = '', externalId, titleFr }, status, { rescore = false } = {}) {
  // Contenu source modifié depuis un rejet record_mismatch : à rescorer.
  const rescoreRow = rescore ? [{ eventId, externalId, lang: '*', titleFr, status: 'ok', reason: 'rescore_needed',
    titleStatus: '', descriptionStatus: '', warnings: '' }] : [];
  return rescoreRow.concat(Object.entries(status).flatMap(([lang, entry]) => {
    const ignored = [entry.titleStatus, entry.descriptionStatus].includes('ignored_identical');
    if (entry.status === 'ok' && !ignored && entry.descriptionStatus !== 'rejected' && !entry.warnings?.length) return [];
    return [{
      eventId, externalId, lang, titleFr,
      status: entry.status,
      reason: entry.reason ?? '',
      titleStatus: entry.titleStatus ?? '',
      descriptionStatus: entry.descriptionStatus ?? '',
      warnings: (entry.warnings ?? []).join('|'),
    }];
  }));
}

const COLUMNS = ['eventId', 'externalId', 'lang', 'status', 'reason', 'titleStatus', 'descriptionStatus', 'warnings', 'titleFr'];
const csvCell = (value) => (/[",\n;]/.test(String(value)) ? `"${String(value).replace(/"/g, '""')}"` : String(value));

// idHeader : « routeId » pour les parcours ; la clé interne reste eventId.
export function toCsv(rows, { idHeader = 'eventId' } = {}) {
  const header = COLUMNS.map((column) => (column === 'eventId' ? idHeader : column));
  return [header.join(','), ...rows.map((row) => COLUMNS.map((column) => csvCell(row[column] ?? '')).join(','))].join('\n') + '\n';
}

export function summarize(rows) {
  const rejected = rows.filter((row) => row.status === 'rejected');
  const byReason = {};
  for (const row of rejected) byReason[row.reason] = (byReason[row.reason] ?? 0) + 1;
  return {
    rejected: rejected.length,
    byReason,
    ignoredTitles: rows.filter((row) => row.titleStatus === 'ignored_identical').length,
    ignoredDescriptions: rows.filter((row) => row.descriptionStatus === 'ignored_identical').length,
    warnings: rows.filter((row) => row.warnings).length,
    rescoreNeeded: rows.filter((row) => row.reason === 'rescore_needed').length,
    // Descriptions retirées faute de description française (le titre reste servi).
    rejectedDescriptions: rows.filter((row) => row.descriptionStatus === 'rejected').length,
  };
}

/** Écrit le CSV et, en GitHub Actions, un résumé dans $GITHUB_STEP_SUMMARY. */
export async function writeTranslationReport(rows, csvFile, { title = 'Traductions DATAtourisme', idHeader } = {}) {
  await fs.mkdir(path.dirname(csvFile), { recursive: true });
  await fs.writeFile(csvFile, toCsv(rows, { idHeader }), 'utf8');
  const summary = summarize(rows);
  if (process.env.GITHUB_STEP_SUMMARY) {
    const reasons = Object.entries(summary.byReason).map(([reason, count]) => `| ${reason} | ${count} |`).join('\n');
    await fs.appendFile(process.env.GITHUB_STEP_SUMMARY, [
      `### ${title}`,
      `- Langues rejetées : ${summary.rejected}`,
      `- Titres identiques au français ignorés : ${summary.ignoredTitles}`,
      `- Descriptions identiques au français ignorées : ${summary.ignoredDescriptions}`,
      `- Signalements (rapport seulement) : ${summary.warnings}`,
      `- Fiches à rescorer (contenu source modifié) : ${summary.rescoreNeeded}`,
      `- Descriptions retirées faute de description française : ${summary.rejectedDescriptions}`,
      reasons ? `\n| Raison | Langues |\n| --- | --- |\n${reasons}` : '',
      '',
    ].join('\n'), 'utf8');
  }
  return summary;
}
