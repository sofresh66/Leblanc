// Contrôle de cohérence des traductions DATAtourisme. Le français fait foi et
// n'est jamais rejeté. Règles actives : traduction identique au français
// (ignorée, pas rejetée) et langue détectée différente de la langue annoncée
// (rejet du titre et de la description de cette langue). Les autres signaux
// (chiffres, noms propres) sont seulement rapportés.
import { createHash } from 'node:crypto';

export const TRANSLATED_LANGUAGES = ['en', 'es', 'de', 'it', 'nl'];
export const MIN_WORDS_FOR_DETECTION = 15;

// Mots outils fréquents, sans accents. Les listes se recoupent un peu (« de »,
// « la ») : la détection exige donc un écart net entre langues.
const STOPWORDS = {
  fr: 'le la les des du de et est un une pour dans sur avec au aux en qui que pas plus par ce cette vous nous il elle sont ou son ses leur',
  en: 'the and of to in is for with on at by from this that are be you your will an or as it its their our was',
  es: 'el la los las de y que en un una para con por del se es al lo su sus como mas muy este esta',
  de: 'der die das und ist mit fur auf den dem des ein eine zu im von sich nicht auch sie wir bei oder wird sind',
  it: 'il lo la gli le di e che un una per con del della in sono si non al alla dei da nel nella questo',
  nl: 'de het een en van in is op met voor te dat die zijn je niet aan bij ook wordt worden naar om',
};
const STOPWORD_SETS = Object.fromEntries(
  Object.entries(STOPWORDS).map(([lang, words]) => [lang, new Set(words.split(' '))]),
);

export function fold(text) {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

function words(text) {
  return fold(text).match(/[a-z]+/g) ?? [];
}

/** Compare deux textes sans casse, accents, ponctuation ni espaces superflus. */
export function sameText(a, b) {
  return words(a).join(' ') === words(b).join(' ');
}

/**
 * Langue dominante d'un texte d'au moins 15 mots, ou null si le signal est
 * insuffisant. Exige au moins 4 mots outils et le double de la deuxième langue.
 */
export function detectLanguage(text) {
  const tokens = words(text);
  if (tokens.length < MIN_WORDS_FOR_DETECTION) return null;
  const scores = Object.entries(STOPWORD_SETS)
    .map(([lang, set]) => ({ lang, score: tokens.filter((token) => set.has(token)).length }))
    .sort((a, b) => b.score - a.score);
  const [first, second] = scores;
  if (first.score < 4 || first.score < 2 * second.score) return null;
  return first.lang;
}

function numbers(text) {
  return new Set(text.match(/\d{2,}/g) ?? []);
}

function properNouns(text) {
  // Mots capitalisés hors début de phrase ; seulement rapporté (inutilisable en allemand).
  return new Set([...text.matchAll(/(?<![.!?]\s|^)\b(\p{Lu}[\p{L}'-]{3,})/gu)].map((match) => match[1]));
}

function reportOnlyWarnings(fr, translation) {
  const warnings = [];
  const frNumbers = numbers(fr);
  const translatedNumbers = numbers(translation);
  if (frNumbers.size && [...frNumbers].some((value) => !translatedNumbers.has(value))) warnings.push('numbers_mismatch');
  const nouns = [...properNouns(fr)];
  const missing = nouns.filter((noun) => !translation.includes(noun));
  if (nouns.length >= 3 && missing.length / nouns.length > 0.5) warnings.push('proper_nouns_missing');
  return warnings;
}

/** Index des overrides par source, identifiant source et langue. */
export function indexOverrides(overrides) {
  const index = new Map();
  for (const entry of overrides) {
    if (!entry?.source || !entry?.externalId || !TRANSLATED_LANGUAGES.includes(entry.lang)) {
      throw new Error(`Override invalide : ${JSON.stringify(entry)}`);
    }
    if (entry.status !== 'rejected') throw new Error(`Statut d'override non pris en charge : ${entry.status}`);
    index.set(`${entry.source}|${entry.externalId}|${entry.lang}`, entry);
  }
  return index;
}

/**
 * Calcule le statut par langue d'un événement. Ne renvoie que les langues
 * présentes dans le titre ou la description.
 */
export function validateTranslations({ titleI18n, descriptionI18n }, {
  source, externalId, overrides = new Map(), checkedAt = new Date().toISOString(),
} = {}) {
  const frTitle = titleI18n?.fr ?? '';
  const frDescription = descriptionI18n?.fr ?? '';
  const result = {};
  for (const lang of TRANSLATED_LANGUAGES) {
    const title = titleI18n?.[lang]?.trim() ?? '';
    const description = descriptionI18n?.[lang]?.trim() ?? '';
    if (!title && !description) continue;
    const entry = { status: 'ok', checkedAt };
    if (title) entry.titleStatus = sameText(title, frTitle) ? 'ignored_identical' : 'ok';
    if (description) entry.descriptionStatus = sameText(description, frDescription) ? 'ignored_identical' : 'ok';

    const override = overrides.get(`${source}|${externalId}|${lang}`);
    const detected = description && entry.descriptionStatus === 'ok' ? detectLanguage(description) : null;
    if (override) {
      entry.status = 'rejected';
      entry.reason = `override:${override.reason}`;
    } else if (detected && detected !== lang) {
      entry.status = 'rejected';
      entry.reason = 'language_mismatch';
      entry.detected = detected;
    }
    const warnings = description && entry.descriptionStatus === 'ok' ? reportOnlyWarnings(frDescription, description) : [];
    if (warnings.length) entry.warnings = warnings;
    result[lang] = entry;
  }
  return result;
}

function sortKeys(value) {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortKeys(value[key])]));
}

/**
 * Statut sans horodatage et à clés triées (jsonb réordonne les clés), pour
 * comparer deux évaluations.
 */
export function comparableStatus(status) {
  const withoutTime = Object.fromEntries(Object.entries(status ?? {})
    .map(([lang, entry]) => {
      const rest = { ...entry };
      delete rest.checkedAt;
      return [lang, rest];
    }));
  return JSON.stringify(sortKeys(withoutTime));
}

// --- Rejet au niveau de la fiche (record_mismatch) -------------------------
// Posé uniquement par score-translations --apply (embeddings). Il n'est
// conservé par l'ingestion que tant que le contenu source est inchangé.
export const RECORD_MISMATCH = 'record_mismatch';

/** Empreinte des textes fr + traductions (titres et descriptions), indépendante de l'ordre des clés. */
export function contentFingerprint(titleI18n, descriptionI18n) {
  const pick = (i18n) => Object.keys(i18n ?? {}).sort()
    .map((lang) => [lang, String(i18n[lang] ?? '').trim()]).filter(([, text]) => text);
  return createHash('sha256').update(JSON.stringify([pick(titleI18n), pick(descriptionI18n)])).digest('hex').slice(0, 32);
}

/** Index de la liste blanche (fiches relues, jamais rejetées en record_mismatch). */
export function indexAllowlist(entries) {
  const index = new Set();
  for (const entry of entries) {
    if (!entry?.source || !entry?.externalId || entry.status !== 'ok') {
      throw new Error(`Entrée de liste blanche invalide : ${JSON.stringify(entry)}`);
    }
    index.add(`${entry.source}|${entry.externalId}`);
  }
  return index;
}

/**
 * Reporte un rejet record_mismatch précédent sur le statut recalculé, si
 * l'empreinte du contenu est identique. Sinon le rejet est levé et la fiche
 * est signalée « à rescorer ». Les overrides restent prioritaires.
 */
export function carryRecordMismatch(next, previous, fingerprint) {
  const previousMismatch = Object.entries(previous ?? {})
    .filter(([lang, entry]) => TRANSLATED_LANGUAGES.includes(lang) && entry?.reason === RECORD_MISMATCH);
  if (!previousMismatch.length) return { status: next, rescore: false };
  const unchanged = previousMismatch.every(([, entry]) => entry.fingerprint === fingerprint);
  if (!unchanged) return { status: next, rescore: true };
  const status = { ...next };
  for (const [lang, entry] of previousMismatch) {
    if (status[lang]?.status === 'rejected') continue;
    if (status[lang]) status[lang] = { ...status[lang], status: 'rejected', reason: RECORD_MISMATCH,
      fingerprint, ...(entry.score !== undefined ? { score: entry.score } : {}) };
  }
  return { status, rescore: false };
}

/**
 * Décide le rejet de fiche à partir des scores de description : toutes les
 * descriptions traduites sous le seuil, fiche hors liste blanche. Renvoie le
 * statut à écrire ; une fiche qui ne remplit plus la condition perd son rejet.
 */
export function applyRecordMismatch(baseStatus, { scores, fingerprint, allowlisted, threshold = 0.5, checkedAt }) {
  const values = scores.filter((score) => typeof score === 'number');
  const max = values.length ? Math.max(...values) : null;
  const flagged = !allowlisted && max !== null && max < threshold;
  if (!flagged) return { status: baseStatus, flagged: false, max };
  const status = {};
  for (const [lang, entry] of Object.entries(baseStatus)) {
    status[lang] = entry.status === 'rejected'
      ? entry
      : { ...entry, status: 'rejected', reason: RECORD_MISMATCH, score: Number(max.toFixed(3)), fingerprint,
        ...(checkedAt ? { checkedAt } : {}) };
  }
  return { status, flagged: true, max };
}
