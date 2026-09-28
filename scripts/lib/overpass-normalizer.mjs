const TYPES = {
  restaurant: 'restaurant', bar: 'bar', pub: 'bar', cafe: 'cafe', fast_food: 'fast_food',
};
const LANGUAGES = ['fr', 'en', 'es', 'de', 'it', 'nl'];
const LE_BLANC = { latitude: 46.6333, longitude: 1.0833 };
const text = (value) => typeof value === 'string' && value.trim() ? value.trim() : null;

function httpUrl(value) {
  if (!text(value)) return null;
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password
      ? url.toString() : null;
  } catch { return null; }
}

function distanceMeters(latitude, longitude) {
  const radians = (value) => value * Math.PI / 180;
  const latDelta = radians(latitude - LE_BLANC.latitude);
  const lonDelta = radians(longitude - LE_BLANC.longitude);
  const a = Math.sin(latDelta / 2) ** 2
    + Math.cos(radians(LE_BLANC.latitude)) * Math.cos(radians(latitude)) * Math.sin(lonDelta / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function coordinates(element) {
  const latitude = element?.type === 'node' ? element.lat : element?.type === 'way' ? element.center?.lat : null;
  const longitude = element?.type === 'node' ? element.lon : element?.type === 'way' ? element.center?.lon : null;
  return Number.isFinite(latitude) && Number.isFinite(longitude)
    && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180
    && distanceMeters(latitude, longitude) <= 20000
    ? { latitude, longitude } : null;
}

function normalizedTitle(value) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

function cuisineTags(value) {
  return [...new Set((text(value) ?? '').split(';').map((part) => part.trim()).filter(Boolean)
    .map((part) => part.toLowerCase() === 'regional' ? 'TraditionalCuisine' : part))];
}

export function normalizeOsmPlace(element) {
  const amenity = text(element?.tags?.amenity);
  if (!Object.hasOwn(TYPES, amenity ?? '')) return { ok: false, reason: 'unsupported_amenity' };
  if ((element?.type !== 'node' && element?.type !== 'way') || !Number.isSafeInteger(element?.id) || element.id < 1)
    return { ok: false, reason: 'invalid_identity' };
  const name = text(element.tags.name);
  if (!name) return { ok: false, reason: 'missing_name' };
  const location = coordinates(element);
  if (!location) return { ok: false, reason: 'invalid_or_outside_coordinates' };
  const titleI18n = { fr: name };
  const descriptionI18n = {};
  for (const lang of LANGUAGES) {
    if (lang !== 'fr' && text(element.tags[`name:${lang}`])) titleI18n[lang] = text(element.tags[`name:${lang}`]);
    const description = text(element.tags[`description:${lang}`]) ?? (lang === 'fr' ? text(element.tags.description) : null);
    if (description) descriptionI18n[lang] = description;
  }
  const normalized = normalizedTitle(name);
  if (!normalized) return { ok: false, reason: 'invalid_title' };
  const houseNumber = text(element.tags['addr:housenumber']);
  const street = text(element.tags['addr:street']);
  const address = text(element.tags['addr:full']) ?? ([houseNumber, street].filter(Boolean).join(' ') || null);
  const sourceUrl = `https://www.openstreetmap.org/${element.type}/${element.id}`;
  const website = httpUrl(element.tags.website ?? element.tags['contact:website']);
  const email = text(element.tags.email ?? element.tags['contact:email']);
  const openingHoursRaw = text(element.tags.opening_hours);
  const wheelchair = text(element.tags.wheelchair);
  return {
    ok: true,
    externalId: `osm:${element.type}/${element.id}`,
    sourceUrl,
    sourceUpdatedAt: null,
    openingHours: [],
    openingHoursRaw,
    accessible: wheelchair === 'yes' ? true : wheelchair === 'no' ? false : null,
    warnings: [],
    rawExcerpt: { osmType: element.type, osmId: element.id, tags: element.tags },
    place: {
      type: TYPES[amenity],
      subtypes: [amenity],
      title_i18n: titleI18n,
      description_i18n: descriptionI18n,
      sourceLanguage: 'fr',
      venueName: null,
      address,
      postalCode: text(element.tags['addr:postcode']),
      city: text(element.tags['addr:city']),
      ...location,
      phone: text(element.tags.phone ?? element.tags['contact:phone']),
      email: email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null,
      website,
      imageUrl: httpUrl(element.tags.image),
      publicUrl: website ?? sourceUrl,
      cuisines: cuisineTags(element.tags.cuisine),
      priceRangeMin: null,
      priceRangeMax: null,
      currency: 'EUR',
      priceDetails: [],
      takeaway: element.tags.takeaway === 'yes' ? true : element.tags.takeaway === 'no' ? false : null,
      openingHoursStatus: 'unknown',
      status: 'published',
      normalizedTitle: normalized,
    },
  };
}
