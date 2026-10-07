import crypto from 'node:crypto';

const LANGUAGES = ['fr', 'en', 'es', 'de', 'it', 'nl'];
const PARIS_FORMAT = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Paris',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});
const OFFSET_FORMAT = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Europe/Paris',
  timeZoneName: 'shortOffset',
});

function localToIso(date, time) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}:\d{2}$/.test(time)) return null;
  const naive = Date.parse(`${date}T${time}Z`);
  if (!Number.isFinite(naive)) return null;
  let utc = naive;
  for (let i = 0; i < 2; i++) {
    const part = OFFSET_FORMAT.formatToParts(new Date(utc)).find(
      (item) => item.type === 'timeZoneName',
    )?.value;
    const match = /^GMT([+-])(\d{1,2})(?::(\d{2}))?$/.exec(part ?? '');
    if (!match) return null;
    const offset = (Number(match[2]) * 60 + Number(match[3] ?? 0)) * (match[1] === '+' ? 1 : -1);
    utc = naive - offset * 60_000;
  }
  const parts = Object.fromEntries(
    PARIS_FORMAT.formatToParts(new Date(utc)).map((part) => [part.type, part.value]),
  );
  if (
    `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}` !==
    `${date}T${time}`
  )
    return null;
  return new Date(utc).toISOString();
}

function clockTime(value, fallback) {
  if (typeof value !== 'string') return fallback;
  if (/^\d{2}:\d{2}$/.test(value)) return `${value}:00`;
  return /^\d{2}:\d{2}:\d{2}$/.test(value) ? value : null;
}

function translations(value) {
  return Object.fromEntries(
    LANGUAGES.flatMap((lang) => {
      const text = value?.[`@${lang}`];
      return typeof text === 'string' && text.trim() ? [[lang, text.trim()]] : [];
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

function isDatatourismeUri(url) {
  return new URL(url).hostname === 'data.datatourisme.fr';
}

function categoryFor(types) {
  if (types.some((type) => /sport|race|hiking|cycling/i.test(type))) return 'sport';
  if (
    types.some((type) => /festival|festive|fair|market|garageSale|saleEvent|bricABrac/i.test(type))
  )
    return 'fete';
  if (types.some((type) => /social|association|charity|volunteer/i.test(type)))
    return 'association';
  if (
    types.some((type) =>
      /cultural|show|concert|exhibition|conference|theatre|cinema|museum|music/i.test(type),
    )
  )
    return 'culture';
  return 'autre';
}

function pricing(offers) {
  const unknown = (warning = null) => ({ isFree: null, priceMin: null, currency: 'EUR', warning });
  const free = () => ({ isFree: true, priceMin: null, currency: 'EUR', warning: null });
  if (offers == null || (Array.isArray(offers) && offers.length === 0)) return unknown();
  if (!Array.isArray(offers)) return unknown('malformed_offers');
  if (offers.some((offer) =>
    !Array.isArray(offer?.priceSpecification) || offer.priceSpecification.length === 0,
  )) {
    return unknown('malformed_price_specification');
  }

  const specs = offers.flatMap((offer) => offer.priceSpecification);
  const validPrice = (value) => typeof value === 'number' && Number.isFinite(value) && value >= 0;
  if (specs.some((spec) => !spec || typeof spec !== 'object' ||
    (spec.price != null && !validPrice(spec.price)) ||
    (spec.minPrice != null && (!Array.isArray(spec.minPrice) || !spec.minPrice.every(validPrice))))) {
    return unknown('malformed_price_specification');
  }

  const hasFreePolicy = specs.some(
    (spec) =>
      Array.isArray(spec?.hasEligiblePolicy) &&
      spec.hasEligiblePolicy.some((policy) => policy?.key === 'Free'),
  );
  const prices = specs.flatMap((spec) => {
    const values = [spec?.price, ...(Array.isArray(spec?.minPrice) ? spec.minPrice : [])];
    return values.filter(validPrice);
  });
  const positivePrices = prices.filter((price) => price > 0);
  // Un tarif positif, même réduit, interdit d'annoncer une gratuité générale.
  if (positivePrices.length > 0) {
    return {
      isFree: false,
      priceMin: Math.min(...positivePrices),
      currency: 'EUR',
      warning: null,
    };
  }
  if (!hasFreePolicy && prices.length === 0) return unknown('malformed_price_specification');
  return free();
}

function rawExcerpt(raw) {
  const excerpt = {
    uuid: raw.uuid,
    label: raw.label?.['@fr'],
    type: raw.type,
    lastUpdate: raw.lastUpdate,
    dates: raw.takesPlaceAt,
    producer: raw.hasBeenCreatedBy?.legalName,
  };
  // Les textes volumineux et l'objet source complet ne sont jamais stockés.
  if (Buffer.byteLength(JSON.stringify(excerpt)) > 5_000) {
    excerpt.dates = Array.isArray(excerpt.dates) ? excerpt.dates.slice(0, 10) : [];
  }
  if (Buffer.byteLength(JSON.stringify(excerpt)) > 5_000) excerpt.dates = [];
  return excerpt;
}

export function normalizeDatatourismeEvent(raw) {
  const externalId = typeof raw?.uuid === 'string' ? raw.uuid : null;
  const titleI18n = translations(raw?.label);
  if (!externalId || !titleI18n.fr) return { ok: false, reason: 'titre français ou UUID manquant' };

  const location = raw?.isLocatedAt?.find(
    (item) => Number.isFinite(item?.geo?.latitude) && Number.isFinite(item?.geo?.longitude),
  );
  const latitude = location?.geo?.latitude;
  const longitude = location?.geo?.longitude;
  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    Math.abs(latitude) > 90 ||
    Math.abs(longitude) > 180
  ) {
    return { ok: false, reason: 'coordonnées invalides' };
  }

  const occurrences = [];
  for (const dateRange of Array.isArray(raw.takesPlaceAt) ? raw.takesPlaceAt : []) {
    const startDate = dateRange?.startDate;
    const startTime = clockTime(dateRange?.startTime, '00:00:00');
    const start = localToIso(startDate, startTime);
    if (!start) continue;
    const endDate = dateRange?.endDate ?? (dateRange?.endTime ? startDate : null);
    const endTime = clockTime(dateRange?.endTime, '23:59:59');
    const end = endDate ? localToIso(endDate, endTime) : null;
    if (endDate && !end) continue;
    if (end && end < start) continue;
    const fingerprint = crypto
      .createHash('sha256')
      .update(`${externalId}|${startDate}|${startTime}|${endDate ?? ''}|${endTime}`)
      .digest('hex');
    occurrences.push({
      startsAt: start,
      endsAt: end,
      allDay: !dateRange?.startTime && !dateRange?.endTime,
      fingerprint: `datatourisme:${fingerprint}`,
    });
  }
  if (occurrences.length === 0) return { ok: false, reason: 'aucune date exploitable' };

  const address = location?.address?.[0] ?? {};
  const descriptions = Array.isArray(raw.hasDescription) ? raw.hasDescription : [];
  const descriptionI18n = translations(
    descriptions[0]?.description ?? descriptions[0]?.shortDescription,
  );
  if (!descriptionI18n.fr) descriptionI18n.fr = '';
  const types = Array.isArray(raw.type)
    ? raw.type.filter((value) => typeof value === 'string')
    : [];
  const imageUrl = httpUrl(raw.hasMainRepresentation?.[0]?.hasRelatedResource?.[0]?.locator?.[0]);
  // Page web du contact seulement : l'URI data.datatourisme.fr est technique
  // (elle reste disponible dans sourceUrl) et ne doit pas servir de site officiel.
  const publicUrl =
    (Array.isArray(raw.hasContact) ? raw.hasContact : [])
      .flatMap((contact) => (Array.isArray(contact?.homepage) ? contact.homepage : []))
      .map(httpUrl)
      .find((url) => url && !isDatatourismeUri(url)) ?? null;
  const { warning, ...price } = pricing(raw.offers);
  if (warning) {
    console.warn(
      JSON.stringify({
        step: 'pricing_warning',
        timestamp: new Date().toISOString(),
        count: 1,
        errors: 0,
        code: warning,
        externalId,
      }),
    );
  }
  const normalizedTitle = titleI18n.fr
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  return {
    ok: true,
    externalId,
    sourceUrl: httpUrl(raw.uri),
    sourceUpdatedAt: /^\d{4}-\d{2}-\d{2}$/.test(raw.lastUpdate ?? '')
      ? `${raw.lastUpdate}T00:00:00Z`
      : null,
    rawExcerpt: rawExcerpt(raw),
    occurrences,
    event: {
      titleI18n,
      descriptionI18n,
      sourceLanguage: 'fr',
      category: categoryFor(types),
      venueName: location?.label?.['@fr'] ?? null,
      address: Array.isArray(address.streetAddress) ? address.streetAddress.join(', ') : null,
      postalCode: address.postalCode ?? null,
      city: address.addressLocality ?? address.hasAddressCity?.label?.['@fr'] ?? null,
      latitude,
      longitude,
      imageUrl,
      publicUrl,
      normalizedTitle,
      ...price,
    },
  };
}
