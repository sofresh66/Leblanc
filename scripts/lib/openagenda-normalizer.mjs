import crypto from 'node:crypto';

const LANGUAGES = ['fr', 'en', 'es', 'de', 'it', 'nl'];

function translations(value) {
  if (typeof value === 'string') return value.trim() ? { fr: value.trim() } : {};
  if (!value || typeof value !== 'object') return {};
  return Object.fromEntries(
    LANGUAGES.flatMap((language) => {
      const text = value[language];
      return typeof text === 'string' && text.trim() ? [[language, text.trim()]] : [];
    }),
  );
}

function httpUrl(value) {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) ? url.toString() : null;
  } catch {
    return null;
  }
}

function normalizedText(value) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function categoryFor(raw, title) {
  const labels = [
    title,
    ...Object.values(raw.keywords ?? {}).flat(),
    ...Object.values(raw).filter((value) => typeof value === 'string'),
  ]
    .filter((value) => typeof value === 'string')
    .join(' ')
    .toLowerCase();
  if (/\bsport|course à pied|randonnée|trail|cyclisme|vélo/.test(labels)) return 'sport';
  if (/festival|fête|marché|foire|vide.grenier|carnaval/.test(labels)) return 'fete';
  if (/association|bénévol|solidarit/.test(labels)) return 'association';
  return 'culture';
}

function pricing(conditions) {
  const text = Object.values(translations(conditions)).join(' ');
  const prices = [...text.matchAll(/(?<!\d)(\d{1,4}(?:[,.]\d{1,2})?)\s*(?:€|euros?\b)/gi)]
    .map((match) => Number(match[1].replace(',', '.')))
    .filter((price) => Number.isFinite(price) && price > 0);
  if (prices.length > 0) return { isFree: false, priceMin: Math.min(...prices), currency: 'EUR' };
  return { isFree: true, priceMin: null, currency: 'EUR' };
}

function imageUrl(image) {
  if (typeof image === 'string') return httpUrl(image);
  if (image?.url) return httpUrl(image.url);
  if (typeof image?.base === 'string' && typeof image?.filename === 'string')
    return httpUrl(new URL(image.filename, image.base).toString());
  return null;
}

function validTime(value) {
  if (
    typeof value !== 'string' ||
    !/T\d{2}:\d{2}/.test(value) ||
    !/(?:Z|[+-]\d{2}:?\d{2})$/.test(value)
  )
    return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

export function normalizeOpenAgendaEvent(raw, { agendaUid, agendaSlug, priority = 0 }) {
  const externalId = Number.isSafeInteger(raw?.uid) && raw.uid > 0 ? String(raw.uid) : null;
  const titleI18n = translations(raw?.title);
  const sourceLanguage = titleI18n.fr ? 'fr' : Object.keys(titleI18n)[0];
  if (sourceLanguage && !titleI18n.fr) titleI18n.fr = titleI18n[sourceLanguage];
  if (!externalId || !titleI18n.fr || raw?.removed === true)
    return { ok: false, reason: 'UID ou titre manquant, ou événement retiré' };
  const location = raw?.location;
  const latitude = location?.latitude;
  const longitude = location?.longitude;
  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    Math.abs(latitude) > 90 ||
    Math.abs(longitude) > 180
  )
    return { ok: false, reason: 'coordonnées invalides' };
  const occurrences = [];
  for (const timing of Array.isArray(raw.timings) ? raw.timings : []) {
    const startsAt = validTime(timing?.begin);
    const endsAt = validTime(timing?.end);
    if (!startsAt || !endsAt || endsAt < startsAt) continue;
    const hash = crypto
      .createHash('sha256')
      .update(`${externalId}|${startsAt}|${endsAt}`)
      .digest('hex');
    occurrences.push({ startsAt, endsAt, fingerprint: `openagenda:${hash}` });
  }
  if (occurrences.length === 0) return { ok: false, reason: 'aucune date exploitable' };
  const descriptionI18n = translations(raw.longDescription);
  const shortDescription = translations(raw.description);
  for (const language of LANGUAGES)
    if (!descriptionI18n[language] && shortDescription[language])
      descriptionI18n[language] = shortDescription[language];
  descriptionI18n.fr ??= '';
  const slug =
    typeof raw.slug === 'string' && /^[a-z0-9-]+$/.test(raw.slug) ? raw.slug : externalId;
  const sourceUrl = httpUrl(`https://openagenda.com/${agendaSlug}/events/${slug}`);
  const publicUrl =
    httpUrl(raw.website) ??
    (Array.isArray(raw.registration)
      ? raw.registration
          .filter((entry) => entry?.type === 'link')
          .map((entry) => httpUrl(entry.value))
          .find(Boolean)
      : null) ??
    sourceUrl;
  return {
    ok: true,
    externalId,
    sourceUrl,
    sourceUpdatedAt: validTime(raw.updatedAt),
    rawExcerpt: {
      uid: raw.uid,
      agendaUid,
      priority,
      updatedAt: raw.updatedAt,
      status: raw.status,
      state: raw.state,
    },
    occurrences,
    event: {
      titleI18n,
      descriptionI18n,
      sourceLanguage: sourceLanguage ?? 'fr',
      category: categoryFor(raw, titleI18n.fr),
      venueName: typeof location.name === 'string' ? location.name : null,
      address: typeof location.address === 'string' ? location.address : null,
      postalCode: typeof location.postalCode === 'string' ? location.postalCode : null,
      city: location.city ?? location.adminLevel4 ?? null,
      latitude,
      longitude,
      imageUrl: imageUrl(raw.image),
      publicUrl,
      normalizedTitle: normalizedText(titleI18n.fr),
      ...pricing(raw.conditions),
      status: raw.status === 6 ? 'cancelled' : 'published',
    },
  };
}
