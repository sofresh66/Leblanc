import type { z } from 'zod';
import {
  EventCategorySchema,
  EventListResponseSchema,
  EventSchema,
  RawEventSchema,
  SupportedContentLanguageSchema,
} from './schemas.js';

export type EventCategory = z.infer<typeof EventCategorySchema>;
export type SupportedContentLanguage = z.infer<typeof SupportedContentLanguageSchema>;
export type RawEvent = z.infer<typeof RawEventSchema>;
export type Event = z.infer<typeof EventSchema>;
export type { EventListParams, EventListParamsInput } from './schemas.js';
export type EventListResponse = z.infer<typeof EventListResponseSchema>;

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
 * Résout le titre et la description selon la règle de repli en cascade :
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
  isFallback: boolean;
} {
  const normLang = requestedLang.toLowerCase() as SupportedContentLanguage;

  // 1. Langue demandée si disponible
  if (event.title_i18n[normLang]) {
    return {
      title: event.title_i18n[normLang] ?? event.title_i18n.fr,
      description: event.description_i18n[normLang] ?? event.description_i18n.fr,
      contentLanguage: normLang,
      isFallback: false,
    };
  }

  // 2. Français (langue de référence)
  if (event.title_i18n.fr) {
    return {
      title: event.title_i18n.fr,
      description: event.description_i18n.fr,
      contentLanguage: 'fr',
      isFallback: true,
    };
  }

  // 3. Première langue disponible
  const availableLangs = (Object.keys(event.title_i18n) as SupportedContentLanguage[]).filter(
    (l) => Boolean(event.title_i18n[l]),
  );
  const fallbackLang = availableLangs[0] ?? 'fr';

  return {
    title: event.title_i18n[fallbackLang] ?? '',
    description: event.description_i18n[fallbackLang] ?? '',
    contentLanguage: fallbackLang,
    isFallback: true,
  };
}
