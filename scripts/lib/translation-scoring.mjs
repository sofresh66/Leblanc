// Similarité sémantique fr ↔ traduction, en mode rapport seulement : aucun
// statut n'est modifié ici. Le client d'embeddings est injecté (simulé en test).
import { TRANSLATED_LANGUAGES, sameText } from './translation-validator.mjs';

export const WORKERS_AI_MODEL = '@cf/baai/bge-m3';
export const CANDIDATE_THRESHOLDS = [0.5, 0.6, 0.7, 0.75, 0.8];
const BATCH_SIZE = 50;

export function cosine(a, b) {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let index = 0; index < a.length; index++) {
    dot += a[index] * b[index];
    normA += a[index] ** 2;
    normB += b[index] ** 2;
  }
  return normA && normB ? dot / Math.sqrt(normA * normB) : 0;
}

/** Client REST Workers AI : POST /accounts/{id}/ai/run/@cf/baai/bge-m3 { text: [...] }. */
export function createWorkersAiEmbedder({ accountId, apiToken, fetchImpl = fetch }) {
  if (!accountId || !apiToken) throw new Error('CLOUDFLARE_ACCOUNT_ID et CLOUDFLARE_AI_TOKEN sont requis');
  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${WORKERS_AI_MODEL}`;
  return async (texts) => {
    const response = await fetchImpl(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: texts }),
      signal: AbortSignal.timeout(60000),
    });
    if (!response.ok) throw new Error(`WORKERS_AI_HTTP_${response.status}`);
    const payload = await response.json();
    const vectors = payload?.result?.data;
    if (!Array.isArray(vectors) || vectors.length !== texts.length) throw new Error('WORKERS_AI_BAD_RESPONSE');
    return vectors;
  };
}

/** Paires fr ↔ traduction à comparer (titre et description non identiques au français). */
export function translationPairs(event) {
  const pairs = [];
  for (const lang of TRANSLATED_LANGUAGES) {
    for (const field of ['title', 'description']) {
      const fr = event[`${field}I18n`]?.fr?.trim() ?? '';
      const translated = event[`${field}I18n`]?.[lang]?.trim() ?? '';
      if (fr && translated && !sameText(fr, translated)) pairs.push({ lang, field, fr, translated });
    }
  }
  return pairs;
}

/**
 * Calcule une ligne par événement et langue : scores du titre et de la
 * description, et statut actuel du validateur (overrides compris).
 */
export async function scoreTranslations(events, embed) {
  const jobs = events.flatMap((event) => translationPairs(event).map((pair) => ({ event, ...pair })));
  const texts = [...new Set(jobs.flatMap((job) => [job.fr, job.translated]))];
  const vectors = new Map();
  for (let index = 0; index < texts.length; index += BATCH_SIZE) {
    const batch = texts.slice(index, index + BATCH_SIZE);
    const embeddings = await embed(batch);
    batch.forEach((text, position) => vectors.set(text, embeddings[position]));
  }
  const rows = new Map();
  for (const job of jobs) {
    const key = `${job.event.id}|${job.lang}`;
    const entry = job.event.translationStatus?.[job.lang];
    const row = rows.get(key) ?? {
      eventId: job.event.id, externalId: job.event.externalId, lang: job.lang, titleFr: job.event.titleI18n.fr,
      status: entry?.status ?? 'ok', reason: entry?.reason ?? '', titleScore: null, descriptionScore: null,
      translatedStart: '',
    };
    // Début de la traduction pour la relecture (description de préférence).
    if (job.field === 'description' || !row.translatedStart) row.translatedStart = job.translated.replace(/\s+/g, ' ').slice(0, 90);
    row[`${job.field}Score`] = Number(cosine(vectors.get(job.fr), vectors.get(job.translated)).toFixed(3));
    rows.set(key, row);
  }
  return [...rows.values()];
}

export function minScore(row) {
  const scores = [row.titleScore, row.descriptionScore].filter((score) => score !== null);
  return scores.length ? Math.min(...scores) : null;
}

/** Histogramme par tranches de 0,1 du score minimal et fiches sous chaque seuil candidat. */
export function scoreDistribution(rows, thresholds = CANDIDATE_THRESHOLDS) {
  const histogram = {};
  for (const row of rows) {
    const score = minScore(row);
    if (score === null) continue;
    const bucket = (Math.min(Math.floor(score * 10), 9) / 10).toFixed(1);
    histogram[bucket] = (histogram[bucket] ?? 0) + 1;
  }
  const belowThreshold = Object.fromEntries(thresholds.map((threshold) => [threshold,
    rows.filter((row) => (minScore(row) ?? 1) < threshold)
      .map(({ eventId, lang, titleFr, titleScore, descriptionScore, status, translatedStart }) =>
        ({ eventId, lang, titleFr, titleScore, descriptionScore, status, translatedStart }))]));
  return { histogram, belowThreshold };
}
