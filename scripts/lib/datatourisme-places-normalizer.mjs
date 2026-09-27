const LANGUAGES = ['fr', 'en', 'es', 'de', 'it', 'nl'];
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const FRENCH_DAYS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
const PARIS_DATE = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Paris',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});
const array = (value) => (Array.isArray(value) ? value : []);
const text = (value) => (typeof value === 'string' && value.trim() ? value.trim() : null);
const unique = (values) => [...new Set(values)];
const keys = (values) =>
  unique(
    array(values)
      .map((value) => text(value?.key))
      .filter(Boolean),
  );

function translations(value) {
  return Object.fromEntries(
    LANGUAGES.flatMap((lang) => {
      const translated = text(value?.[`@${lang}`]);
      return translated ? [[lang, translated]] : [];
    }),
  );
}

function httpUrl(value) {
  if (!text(value)) return null;
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

export function classifyPlace(types) {
  // Les sous-types plus précis priment ; ne jamais déduire un type du nom du lieu.
  if (types.includes('StreetFood')) return 'food_truck';
  if (types.includes('FastFoodRestaurant')) return 'fast_food';
  if (types.some((type) => ['CafeOrTeahouse', 'CafeOrCoffeeShop'].includes(type))) return 'cafe';
  if (types.some((type) => ['BarOrPub', 'BistroOrWineBar'].includes(type))) return 'bar';
  if (
    types.some((type) =>
      ['Restaurant', 'BrasserieOrTavern', 'HotelRestaurant', 'FarmhouseInn'].includes(type),
    )
  )
    return 'restaurant';
  return types.includes('FoodEstablishment') ? 'other_food' : null;
}

function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000'))
    return null;
  const timestamp = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value
    ? value
    : null;
}

function localDate(value) {
  if (value == null) return null;
  if (validDate(value)) return value;
  if (
    typeof value !== 'string' ||
    !validDate(value.slice(0, 10)) ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
  )
    return null;
  const instant = new Date(value);
  if (!Number.isFinite(instant.getTime())) return null;
  return PARIS_DATE.format(instant);
}

function clockTime(value) {
  if (typeof value !== 'string' || !/^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(value))
    return null;
  return value.length === 5 ? `${value}:00` : value;
}

function dayNumber(value) {
  const name =
    typeof value === 'string'
      ? value.split(/[#/]/).pop()
      : (value?.key ?? value?.label?.['@en'] ?? value?.label?.['@fr']);
  const index = DAYS.indexOf(name);
  return index >= 0
    ? index + 1
    : FRENCH_DAYS.indexOf(name) >= 0
      ? FRENCH_DAYS.indexOf(name) + 1
      : null;
}

function weekNumber(value) {
  const name = typeof value === 'string' ? value.split(/[#/]/).pop() : value?.key;
  return /^Week[0-5]$/.test(name ?? '') ? Number(name.slice(-1)) : null;
}

export function normalizeOpeningHours(raw, location) {
  const containers = [raw?.openingHoursSpecification, location?.openingHoursSpecification];
  const specs = containers.flatMap(array);
  let rejected = containers.filter((value) => value != null && !Array.isArray(value)).length;
  const rules = [];
  for (const spec of specs) {
    const opens = clockTime(spec?.opens);
    const closes = clockTime(spec?.closes);
    const validFrom = localDate(spec?.validFrom);
    const validThrough = localDate(spec?.validThrough);
    const days = array(spec?.dayOfWeek).map(dayNumber);
    const weeks =
      spec?.weekOfMonth == null || (Array.isArray(spec.weekOfMonth) && !spec.weekOfMonth.length)
        ? [null]
        : array(spec.weekOfMonth).map(weekNumber);
    const invalidWeeks =
      spec?.weekOfMonth != null &&
      (!Array.isArray(spec.weekOfMonth) || (spec.weekOfMonth.length > 0 && weeks.includes(null)));
    if (
      !opens ||
      !closes ||
      !days.length ||
      days.includes(null) ||
      invalidWeeks ||
      (spec.validFrom != null && !validFrom) ||
      (spec.validThrough != null && !validThrough) ||
      (validFrom && validThrough && validFrom > validThrough)
    ) {
      rejected++;
      continue;
    }
    for (const weekOfMonth of unique(weeks)) {
      rules.push({
        validFrom,
        validThrough,
        dayOfWeek: unique(days).sort((a, b) => a - b),
        opens,
        closes,
        weekOfMonth,
      });
    }
  }
  const openingHours = [...new Map(rules.map((rule) => [JSON.stringify(rule), rule])).values()];
  return {
    openingHours,
    openingHoursStatus: !openingHours.length ? 'unknown' : rejected ? 'partial' : 'provided',
    rejected,
  };
}

function priceNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 99999999.99;
}

export function normalizePlacePricing(offers) {
  const priceDetails = [];
  let rejected = offers != null && !Array.isArray(offers) ? 1 : 0;
  for (const offer of array(offers)) {
    if (offer?.priceSpecification != null && !Array.isArray(offer.priceSpecification)) rejected++;
    for (const spec of array(offer?.priceSpecification)) {
      if (
        !spec ||
        typeof spec !== 'object' ||
        (spec.price != null && !priceNumber(spec.price)) ||
        ['minPrice', 'maxPrice'].some(
          (field) =>
            spec[field] != null && (!Array.isArray(spec[field]) || !spec[field].every(priceNumber)),
        )
      ) {
        rejected++;
        continue;
      }
      const lows = spec.minPrice?.length ? spec.minPrice : spec.price != null ? [spec.price] : [];
      // Un minimum seul n'est pas un maximum. Un prix ponctuel explicite est conservé.
      const highs = spec.maxPrice?.length
        ? spec.maxPrice
        : spec.price != null && (!lows.length || lows.every((low) => low === spec.price))
          ? [spec.price]
          : [];
      const priceRangeMin = lows.length ? Math.min(...lows) : null;
      const priceRangeMax = highs.length ? Math.max(...highs) : null;
      if (priceRangeMin !== null && priceRangeMax !== null && priceRangeMin > priceRangeMax) {
        rejected++;
        continue;
      }
      priceDetails.push({
        label_i18n: translations(spec.additionalInformation),
        policies: keys(spec.hasEligiblePolicy),
        offers: keys(spec.hasPricingOffer),
        priceRangeMin,
        priceRangeMax,
        currency: /^[A-Z]{3}$/.test(spec.priceCurrency ?? '') ? spec.priceCurrency : null,
      });
    }
  }
  // Le résumé ne mélange ni les enfants/réductions, ni les prestations ambiguës.
  // Le détail source reste disponible pour choisir un libellé honnête dans le futur frontend.
  const adult = priceDetails.filter(
    (detail) =>
      detail.policies.length === 1 &&
      detail.policies[0] === 'BaseRateFullRate' &&
      detail.offers.length === 0 &&
      detail.currency &&
      (detail.priceRangeMin !== null || detail.priceRangeMax !== null),
  );
  const currencies = unique(adult.map((detail) => detail.currency));
  const comparable = currencies.length === 1 && rejected === 0 ? adult : [];
  return {
    priceDetails,
    priceRangeMin:
      comparable.length && comparable.every((detail) => detail.priceRangeMin !== null)
        ? Math.min(...comparable.map((detail) => detail.priceRangeMin))
        : null,
    priceRangeMax:
      comparable.length && comparable.every((detail) => detail.priceRangeMax !== null)
        ? Math.max(...comparable.map((detail) => detail.priceRangeMax))
        : null,
    currency: currencies.length === 1 ? currencies[0] : 'EUR',
    rejected,
  };
}

function distanceFromLeBlanc(latitude, longitude) {
  const rad = (value) => (value * Math.PI) / 180;
  const a =
    Math.sin(rad(latitude - 46.6333) / 2) ** 2 +
    Math.cos(rad(46.6333)) * Math.cos(rad(latitude)) * Math.sin(rad(longitude - 1.0833) / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function normalizeDatatourismePlace(raw) {
  const externalId = text(raw?.uuid);
  const titleI18n = translations(raw?.label);
  const sourceLanguage = LANGUAGES.find((lang) => titleI18n[lang]);
  if (!externalId || !sourceLanguage) return { ok: false, reason: 'missing_identity' };
  const subtypes = unique(array(raw.type).map(text).filter(Boolean));
  const type = classifyPlace(subtypes);
  if (!type) return { ok: false, reason: 'unsupported_type' };
  const location = array(raw.isLocatedAt).find(
    (item) =>
      Number.isFinite(item?.geo?.latitude) &&
      Math.abs(item.geo.latitude) <= 90 &&
      Number.isFinite(item?.geo?.longitude) &&
      Math.abs(item.geo.longitude) <= 180 &&
      distanceFromLeBlanc(item.geo.latitude, item.geo.longitude) <= 20000,
  );
  if (!location) return { ok: false, reason: 'invalid_or_outside_coordinates' };
  const address = array(location.address)[0];
  const descriptionI18n = {};
  for (const lang of LANGUAGES) {
    const description = array(raw.hasDescription)
      .map(
        (item) =>
          text(item?.description?.[`@${lang}`]) ?? text(item?.shortDescription?.[`@${lang}`]),
      )
      .find(Boolean);
    if (description) descriptionI18n[lang] = description;
  }
  const contacts = array(raw.hasContact);
  const website =
    contacts
      .flatMap((contact) => array(contact?.homepage))
      .map(httpUrl)
      .find(Boolean) ?? null;
  const phone =
    contacts
      .flatMap((contact) => array(contact?.telephone))
      .map(text)
      .find(Boolean) ?? null;
  const email =
    contacts
      .flatMap((contact) => array(contact?.email))
      .map(text)
      .find((value) => value && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) ?? null;
  const representations = [...array(raw.hasMainRepresentation), ...array(raw.hasRepresentation)];
  const representation = representations.find((item) =>
    array(item?.hasRelatedResource).some((resource) =>
      array(resource?.locator).some((value) => httpUrl(value)),
    ),
  );
  const imageUrl =
    array(representation?.hasRelatedResource)
      .flatMap((item) => array(item?.locator))
      .map(httpUrl)
      .find(Boolean) ?? null;
  const {
    openingHours,
    openingHoursStatus,
    rejected: rejectedHours,
  } = normalizeOpeningHours(raw, location);
  const { rejected: rejectedPrices, ...pricing } = normalizePlacePricing(raw.offers);
  const features = array(raw.hasFeature).flatMap((item) => keys(item?.features));
  const sourceUrl = httpUrl(raw.uri);
  const sourceDate = validDate(raw.lastUpdate);
  const sourceUpdatedAt = sourceDate ? `${sourceDate}T00:00:00Z` : null;
  const warnings = [
    ...(rejectedHours ? ['invalid_opening_hours'] : []),
    ...(rejectedPrices ? ['invalid_prices'] : []),
  ];
  const normalizedTitle = titleI18n[sourceLanguage]
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
  if (!normalizedTitle) return { ok: false, reason: 'invalid_title' };
  return {
    ok: true,
    externalId,
    sourceUrl,
    sourceUpdatedAt,
    openingHours,
    warnings,
    rawExcerpt: {
      uuid: externalId,
      label: titleI18n[sourceLanguage],
      type: subtypes,
      lastUpdate: raw.lastUpdate ?? null,
      producer: text(raw.hasBeenCreatedBy?.legalName),
      imageAnnotations: array(representation?.hasAnnotation),
      rejectedHours,
      rejectedPrices,
    },
    place: {
      type,
      subtypes,
      title_i18n: titleI18n,
      description_i18n: descriptionI18n,
      sourceLanguage,
      venueName: text(location.label?.[`@${sourceLanguage}`]),
      address: array(address?.streetAddress).map(text).filter(Boolean).join(', ') || null,
      postalCode: text(address?.postalCode),
      city: text(address?.addressLocality) ?? text(address?.hasAddressCity?.label?.['@fr']),
      latitude: location.geo.latitude,
      longitude: location.geo.longitude,
      phone,
      email,
      website,
      imageUrl,
      publicUrl: website ?? sourceUrl,
      cuisines: keys(raw.providesCuisineOfType),
      ...pricing,
      takeaway: features.some((key) => ['Takeaway', 'TakeawayFoodOrMeals'].includes(key))
        ? true
        : null,
      openingHoursStatus,
      status: 'published',
      normalizedTitle,
    },
  };
}
