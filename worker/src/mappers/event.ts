import {
  DEFAULT_CURRENCY,
  DEFAULT_TIMEZONE,
  EventDetailSchema,
  EventSchema,
  resolveEventContent,
  type Event,
  type EventCategory,
  type EventDetail,
  type EventI18nDescription,
  type EventI18nTitle,
  type EventOccurrence,
  type SupportedLanguage,
} from '@leblanc/shared';

export interface EventDbRow {
  id: string;
  category: string;
  title_i18n: EventI18nTitle | string;
  description_i18n: EventI18nDescription | string;
  source: string | null;
  cursor_date?: string | undefined;
  venue_name: string | null;
  address: string | null;
  postal_code: string | null;
  city: string | null;
  latitude: number | string;
  longitude: number | string;
  public_url: string | null;
  image_url: string | null;
  is_free: boolean;
  price_min: number | string | null;
  currency?: string | null | undefined;
  starts_at: string | Date;
  ends_at: string | Date | null;
  timezone?: string | null | undefined;
  distance: number | string;
}

export interface OccurrenceDbRow {
  id: string;
  starts_at: string | Date;
  ends_at: string | Date | null;
  timezone?: string | null | undefined;
}

function ensureObject<T>(val: T | string): T {
  if (typeof val === 'string') {
    return JSON.parse(val) as T;
  }
  return val;
}

function toIsoString(val: string | Date): string {
  if (val instanceof Date) {
    return val.toISOString();
  }
  return new Date(val).toISOString();
}

/**
 * Mappe une ligne SQL issue de la base Neon vers le schéma validé Event.
 */
export function mapDbRowToEvent(row: EventDbRow, lang: SupportedLanguage): Event {
  const title_i18n = ensureObject<EventI18nTitle>(row.title_i18n);
  const description_i18n = ensureObject<EventI18nDescription>(row.description_i18n);

  const { title, description, contentLanguage, isFallback } = resolveEventContent(
    { title_i18n, description_i18n },
    lang
  );

  const rawEvent = {
    id: row.id,
    title_i18n,
    description_i18n,
    category: row.category as EventCategory,
    startDate: toIsoString(row.starts_at),
    endDate: row.ends_at ? toIsoString(row.ends_at) : null,
    timezone: row.timezone || DEFAULT_TIMEZONE,
    venueName: row.venue_name,
    address: row.address,
    postalCode: row.postal_code,
    city: row.city,
    latitude: typeof row.latitude === 'string' ? parseFloat(row.latitude) : row.latitude,
    longitude: typeof row.longitude === 'string' ? parseFloat(row.longitude) : row.longitude,
    imageUrl: row.image_url,
    isFree: Boolean(row.is_free),
    priceMin:
      row.price_min !== null && row.price_min !== undefined
        ? typeof row.price_min === 'string'
          ? parseFloat(row.price_min)
          : row.price_min
        : null,
    currency: (row.currency || DEFAULT_CURRENCY).trim(),
    publicUrl: row.public_url,
    source: row.source || 'unknown',
    title,
    description,
    contentLanguage,
    isFallback,
    distance: typeof row.distance === 'string' ? Math.round(parseFloat(row.distance)) : Math.round(row.distance),
  };

  return EventSchema.parse(rawEvent);
}

/**
 * Mappe un événement et ses occurrences vers le schéma validé EventDetail.
 */
export function mapDbRowToEventDetail(
  row: EventDbRow,
  occurrencesRows: OccurrenceDbRow[],
  lang: SupportedLanguage
): EventDetail {
  const baseEvent = mapDbRowToEvent(row, lang);

  const occurrences: EventOccurrence[] = occurrencesRows.map((occ) => ({
    id: occ.id,
    startDate: toIsoString(occ.starts_at),
    endDate: occ.ends_at ? toIsoString(occ.ends_at) : null,
    timezone: occ.timezone || DEFAULT_TIMEZONE,
  }));

  return EventDetailSchema.parse({
    ...baseEvent,
    occurrences,
  });
}
