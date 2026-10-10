// Normalisation d'un itinéraire DATAtourisme (/v1/tour) en parcours.
// Aucune donnée n'est inventée : un champ absent de la source reste null.
const LANGUAGES = ['fr', 'en', 'es', 'de', 'it', 'nl'];
const UNKNOWN_CREDITS = new Set(['non communique', 'nc', 'inconnu']);

function translations(value) {
  return Object.fromEntries(
    LANGUAGES.flatMap((lang) => {
      const text = value?.[`@${lang}`];
      return typeof text === 'string' && text.trim() ? [[lang, text.trim()]] : [];
    }),
  );
}

function fold(text) {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

export function normalizeTitle(text) {
  return fold(text).replace(/[^a-z0-9]+/g, ' ').trim();
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

function positiveNumber(value) {
  const number = typeof value === 'string' ? Number(value) : value;
  return typeof number === 'number' && Number.isFinite(number) && number > 0 ? number : null;
}

/**
 * Modes de déplacement. Sous-types DATAtourisme d'abord ; « VTT » dans le titre
 * remplace le vélo, dans la description il s'ajoute. Sans sous-type, le titre
 * décide, sinon « à pied ».
 */
export function routeModes(types, titleFr, descriptionFr) {
  const modes = new Set();
  if (types.includes('WalkingTour')) modes.add('foot');
  if (types.includes('CyclingTour')) modes.add('bike');
  if (types.includes('HorseTour')) modes.add('horse');
  const title = fold(titleFr);
  if (modes.size === 0) {
    if (/\bvtt\b/.test(title)) modes.add('mtb');
    else if (/\b(velo|cyclo|gravel)/.test(title)) modes.add('bike');
    else if (/\b(cheval|equestre)/.test(title)) modes.add('horse');
    else modes.add('foot');
  }
  if (/\bvtt\b/.test(title)) {
    modes.delete('bike');
    modes.add('mtb');
  } else if (/\bvtt\b/.test(fold(descriptionFr))) {
    modes.add('mtb');
  }
  return ['foot', 'bike', 'mtb', 'horse'].filter((mode) => modes.has(mode));
}

/** true : boucle ; false : aller simple ou itinérance ; null : la source ne dit rien. */
export function routeIsLoop(tourTypes) {
  const keys = (Array.isArray(tourTypes) ? tourTypes : []).map((item) => item?.key).filter(Boolean);
  if (keys.includes('Loop') && !keys.includes('OpenJaw')) return true;
  if (keys.includes('OpenJaw') && !keys.includes('Loop')) return false;
  return null;
}

function isMotorised(types, titleFr) {
  return types.includes('RoadTour') || /\b(moto|voiture|auto(mobile)?)\b/.test(fold(titleFr));
}

function image(raw) {
  const representation = raw.hasMainRepresentation?.[0];
  const url = httpUrl(representation?.hasRelatedResource?.[0]?.locator?.[0]);
  if (!url) return { imageUrl: null, imageCredit: null, imageLicense: null };
  const annotation = representation?.hasAnnotation?.[0];
  const credit = typeof annotation?.credits?.[0] === 'string' ? annotation.credits[0].trim() : '';
  const license = typeof annotation?.isCoveredBy === 'string' ? annotation.isCoveredBy.trim() : '';
  return {
    imageUrl: url,
    imageCredit: credit && !UNKNOWN_CREDITS.has(fold(credit)) ? credit : null,
    imageLicense: license || null,
  };
}

export function normalizeDatatourismeRoute(raw) {
  const externalId = typeof raw?.uuid === 'string' ? raw.uuid : null;
  const titleI18n = translations(raw?.label);
  if (!externalId || !titleI18n.fr) return { ok: false, reason: 'missing_title_or_uuid' };
  const types = Array.isArray(raw.type) ? raw.type.filter((value) => typeof value === 'string') : [];
  if (isMotorised(types, titleI18n.fr)) return { ok: false, reason: 'motorised', externalId };

  const location = (Array.isArray(raw.isLocatedAt) ? raw.isLocatedAt : []).find((item) =>
    Number.isFinite(Number(item?.geo?.latitude)) && Number.isFinite(Number(item?.geo?.longitude)));
  const latitude = Number(location?.geo?.latitude);
  const longitude = Number(location?.geo?.longitude);
  if (!location || Math.abs(latitude) > 90 || Math.abs(longitude) > 180 || (latitude === 0 && longitude === 0)) {
    return { ok: false, reason: 'invalid_coordinates', externalId };
  }

  const descriptions = Array.isArray(raw.hasDescription) ? raw.hasDescription : [];
  const descriptionI18n = translations(descriptions[0]?.description ?? descriptions[0]?.shortDescription);
  if (!descriptionI18n.fr) descriptionI18n.fr = '';
  const address = location.address?.[0] ?? {};
  const distance = positiveNumber(raw.tourDistance);
  const duration = positiveNumber(raw.duration);
  const durationDays = positiveNumber(raw.durationDays);
  const officialUrl = (Array.isArray(raw.hasContact) ? raw.hasContact : [])
    .flatMap((contact) => (Array.isArray(contact?.homepage) ? contact.homepage : []))
    .map(httpUrl)
    .find((url) => url && new URL(url).hostname !== 'data.datatourisme.fr') ?? null;

  return {
    ok: true,
    externalId,
    sourceUrl: httpUrl(raw.uri),
    sourceUpdatedAt: /^\d{4}-\d{2}-\d{2}$/.test(raw.lastUpdate ?? '') ? `${raw.lastUpdate}T00:00:00Z` : null,
    rawExcerpt: {
      uuid: externalId,
      label: titleI18n.fr,
      type: types,
      lastUpdate: raw.lastUpdate ?? null,
      producer: raw.hasBeenCreatedBy?.legalName ?? null,
      start: [longitude, latitude],
      tourDistance: raw.tourDistance ?? null,
      duration: raw.duration ?? null,
      durationDays: raw.durationDays ?? null,
      tourType: (raw.hasTourType ?? []).map((item) => item?.key).filter(Boolean),
    },
    route: {
      titleI18n,
      descriptionI18n,
      sourceLanguage: 'fr',
      modes: routeModes(types, titleI18n.fr, descriptionI18n.fr),
      isLoop: routeIsLoop(raw.hasTourType),
      distanceM: distance === null ? null : Math.round(distance),
      durationMin: duration === null ? null : Math.round(duration),
      // Valeurs aberrantes (194 jours pour un circuit gravel) ignorées.
      durationDays: durationDays !== null && durationDays <= 60 ? Math.round(durationDays * 10) / 10 : null,
      start: [longitude, latitude],
      startCity: address.addressLocality ?? address.hasAddressCity?.label?.['@fr'] ?? null,
      startPostalCode: address.postalCode ?? null,
      officialUrl,
      ...image(raw),
      producer: raw.hasBeenCreatedBy?.legalName ?? null,
      normalizedTitle: normalizeTitle(titleI18n.fr),
    },
  };
}
