import type { z } from 'zod';
import {
  OpeningHoursRuleSchema,
  PlaceDetailSchema,
  PlaceApiSchema,
  PlaceApiListParamsSchema,
  PlaceApiListResponseSchema,
  PlaceCategoriesResponseSchema,
  PlaceListParamsSchema,
  PlaceListResponseSchema,
  PlacePriceDetailSchema,
  PlaceSchema,
  PlaceSourceRecordSchema,
  PlaceTypeSchema,
  RawPlaceSchema,
  ApiErrorSchema,
  CursorPayloadSchema,
  EventCategorySchema,
  EventDetailSchema,
  EventI18nDescriptionSchema,
  EventI18nTitleSchema,
  EventListResponseSchema,
  EventOccurrenceSchema,
  EventSchema,
  RawEventSchema,
  SupportedContentLanguageSchema,
  SupportedLanguageSchema,
} from './schemas.js';

export type EventCategory = z.infer<typeof EventCategorySchema>;
export type SupportedContentLanguage = z.infer<typeof SupportedContentLanguageSchema>;
export type SupportedLanguage = SupportedContentLanguage;
export type EventI18nTitle = z.infer<typeof EventI18nTitleSchema>;
export type EventI18nDescription = z.infer<typeof EventI18nDescriptionSchema>;
export type RawEvent = z.infer<typeof RawEventSchema>;
export type Event = z.infer<typeof EventSchema>;
export type { EventListParams, EventListParamsInput } from './schemas.js';
export type EventListResponse = z.infer<typeof EventListResponseSchema>;
export type EventOccurrence = z.infer<typeof EventOccurrenceSchema>;
export type EventDetail = z.infer<typeof EventDetailSchema>;
export type ApiError = z.infer<typeof ApiErrorSchema>;
export type CursorPayload = z.infer<typeof CursorPayloadSchema>;
export { SupportedLanguageSchema };

export type PlaceType = z.infer<typeof PlaceTypeSchema>;
export type RawPlace = z.infer<typeof RawPlaceSchema>;
export type Place = z.infer<typeof PlaceSchema>;
export type PlaceDetail = z.infer<typeof PlaceDetailSchema>;
export type PlaceListParamsInput = z.input<typeof PlaceListParamsSchema>;
export type PlaceListParams = z.output<typeof PlaceListParamsSchema>;
export type PlaceListResponse = z.infer<typeof PlaceListResponseSchema>;
export type OpeningHoursRule = z.infer<typeof OpeningHoursRuleSchema>;
export type PlaceSourceRecord = z.infer<typeof PlaceSourceRecordSchema>;
export type PlacePriceDetail = z.infer<typeof PlacePriceDetailSchema>;
export type PlaceApi = z.infer<typeof PlaceApiSchema>;
export type PlaceApiListParams = z.output<typeof PlaceApiListParamsSchema>;
export type PlaceApiListResponse = z.infer<typeof PlaceApiListResponseSchema>;
export type PlaceCategoriesResponse = z.infer<typeof PlaceCategoriesResponseSchema>;

/**
 * Calcule la distance orthodromique entre deux points GPS en mètres (formule de Haversine).
 */
export function calculateHaversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371000; // Rayon moyen de la Terre en mètres
  const toRad = (deg: number) => (deg * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

/**
 * Résout chaque champ indépendamment selon la règle de repli en cascade :
 * 1. Langue demandée
 * 2. Français (langue de référence)
 * 3. Première langue disponible
 */
export function resolveEventContent(
  event: Pick<RawEvent, 'title_i18n' | 'description_i18n'>,
  requestedLang: string,
): {
  title: string;
  description: string;
  contentLanguage: SupportedContentLanguage;
  descriptionLanguage: SupportedContentLanguage;
  // Compatibilité : isFallback décrit le repli du titre, comme contentLanguage.
  isFallback: boolean;
} {
  const normLang = requestedLang.toLowerCase();
  const parsedLang = SupportedLanguageSchema.safeParse(normLang);
  const resolveField = (translations: EventI18nDescription) => {
    const language =
      (parsedLang.success && translations[parsedLang.data]?.trim() ? parsedLang.data : undefined) ??
      (translations.fr.trim() ? 'fr' : undefined) ??
      SupportedLanguageSchema.options.find((lang) => translations[lang]?.trim()) ??
      'fr';
    return { value: translations[language] ?? '', language };
  };
  const title = resolveField(event.title_i18n);
  const description = resolveField(event.description_i18n);

  return {
    title: title.value,
    description: description.value,
    contentLanguage: title.language,
    descriptionLanguage: description.language,
    isFallback: title.language !== normLang,
  };
}
