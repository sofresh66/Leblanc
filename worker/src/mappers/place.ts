import {
  OpeningHoursRuleSchema,
  PlaceApiSchema,
  RawPlaceSchema,
  type OpeningHoursRule,
  type PlaceApi,
  type SupportedLanguage,
} from '@leblanc/shared';

export interface PlaceDbRow {
  id: string;
  type: string;
  subtypes: string[];
  title_i18n: unknown;
  description_i18n: unknown;
  source_language: string;
  venue_name: string | null;
  address: string | null;
  postal_code: string | null;
  city: string | null;
  latitude: number | string | null;
  longitude: number | string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  image_url: string | null;
  public_url: string | null;
  cuisines: string[];
  price_range_min: number | string | null;
  price_range_max: number | string | null;
  currency: string;
  price_details: unknown;
  takeaway: boolean | null;
  opening_hours_status: string;
  status: string;
  normalized_title: string;
  source: string | null;
  distance_m: number | string | null;
  opening_hours: unknown;
  opening_hours_raw?: string | null;
}

function jsonValue(value: unknown): unknown {
  return typeof value === 'string' ? JSON.parse(value) as unknown : value;
}

function numberValue(value: number | string): number {
  return typeof value === 'number' ? value : Number(value);
}

function nullableNumber(value: number | string | null): number | null {
  return value === null ? null : numberValue(value);
}

interface ParisLocalTime {
  date: string;
  clock: string;
  day: number;
  dayOfMonth: number;
  lastWeek: boolean;
}

const parisFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Paris',
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
});

function calendarDay(date: string, clock: string): ParisLocalTime {
  const parsed = new Date(`${date}T00:00:00Z`);
  const dayOfMonth = parsed.getUTCDate();
  return {
    date,
    clock,
    day: parsed.getUTCDay() || 7,
    dayOfMonth,
    lastWeek: new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), dayOfMonth + 7)).getUTCMonth() !== parsed.getUTCMonth(),
  };
}

function parisLocal(now: Date): ParisLocalTime {
  const parts = Object.fromEntries(parisFormatter.formatToParts(now).map((part) => [part.type, part.value]));
  const date = `${parts.year}-${parts.month}-${parts.day}`;
  return calendarDay(date, `${parts.hour}:${parts.minute}:${parts.second}`);
}

function yesterday(local: ParisLocalTime): ParisLocalTime {
  const date = new Date(`${local.date}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return calendarDay(date.toISOString().slice(0, 10), local.clock);
}

function applies(rule: OpeningHoursRule, local: ParisLocalTime): boolean {
  if (rule.validFrom && local.date < rule.validFrom) return false;
  if (rule.validThrough && local.date > rule.validThrough) return false;
  if (!rule.dayOfWeek.includes(local.day)) return false;
  if (rule.weekOfMonth === 0) return local.lastWeek;
  if (rule.weekOfMonth !== null && Math.ceil(local.dayOfMonth / 7) !== rule.weekOfMonth) return false;
  return true;
}

export function computeIsOpenNow(openingHours: OpeningHoursRule[], now: Date): boolean | null {
  if (!openingHours.length) return null;
  const local = parisLocal(now);
  const previous = yesterday(local);
  let indeterminate = false;

  for (const rule of openingHours) {
    const today = applies(rule, local);
    if (rule.opens === rule.closes) {
      if (today || applies(rule, previous)) indeterminate = true;
      continue;
    }
    if (today && local.clock >= rule.opens &&
        (rule.closes > rule.opens ? local.clock <= rule.closes : true)) return true;
    if (rule.closes < rule.opens && applies(rule, previous) && local.clock <= rule.closes) return true;
  }
  return indeterminate ? null : false;
}

export function mapDbRowToPlace(row: PlaceDbRow, lang: SupportedLanguage, now: Date): PlaceApi {
  const raw = RawPlaceSchema.parse({
    id: row.id,
    type: row.type,
    subtypes: row.subtypes,
    title_i18n: jsonValue(row.title_i18n),
    description_i18n: jsonValue(row.description_i18n),
    sourceLanguage: row.source_language,
    venueName: row.venue_name,
    address: row.address,
    postalCode: row.postal_code,
    city: row.city,
    latitude: nullableNumber(row.latitude),
    longitude: nullableNumber(row.longitude),
    phone: row.phone,
    email: row.email,
    website: row.website,
    imageUrl: row.image_url,
    publicUrl: row.public_url,
    cuisines: row.cuisines,
    priceRangeMin: nullableNumber(row.price_range_min),
    priceRangeMax: nullableNumber(row.price_range_max),
    currency: row.currency.trim(),
    priceDetails: jsonValue(row.price_details),
    takeaway: row.takeaway,
    openingHoursStatus: row.opening_hours_status,
    status: row.status,
    normalizedTitle: row.normalized_title,
  });
  const availableLanguage = ([lang, 'fr', raw.sourceLanguage, 'en', 'es', 'de', 'it', 'nl'] as const)
    .find((candidate) => raw.title_i18n[candidate]);
  if (!availableLanguage) throw new Error('Titre du lieu absent');
  const openingHours = OpeningHoursRuleSchema.array().parse(jsonValue(row.opening_hours));

  return PlaceApiSchema.parse({
    ...raw,
    title: raw.title_i18n[availableLanguage],
    description: raw.description_i18n[availableLanguage] ?? raw.description_i18n[lang] ?? raw.description_i18n.fr ?? '',
    contentLanguage: availableLanguage,
    isFallback: availableLanguage !== lang,
    distance: row.distance_m === null ? null : Math.round(numberValue(row.distance_m)),
    source: row.source || 'unknown',
    openingHours,
    isOpenNow: computeIsOpenNow(openingHours, now),
    ...(row.opening_hours_raw !== undefined ? { openingHoursRaw: row.opening_hours_raw } : {}),
  });
}
