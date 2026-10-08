import { SEARCH_RADIUS_METERS, type EventCategory, type EventListParamsInput } from '@leblanc/shared';
import { resolveMaxDistanceMeters } from '../hooks/useEvents';
import type { SupportedLanguage } from '../i18n/languages';

/** Filtres d'événements lus depuis l'URL, communs à la liste et à la carte. */
export function eventFiltersFromSearchParams(
  searchParams: URLSearchParams,
  lang: SupportedLanguage,
): Omit<EventListParamsInput, 'cursor' | 'limit'> {
  const from = searchParams.get('from') || undefined;
  const to = searchParams.get('to') || undefined;
  const category = searchParams.get('category');
  const isFreeParam = searchParams.get('isFree');
  const q = searchParams.get('q')?.trim();
  const maxDistanceMeters = resolveMaxDistanceMeters(searchParams);

  return {
    lang,
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
    ...(category && category !== 'all' ? { categories: [category as EventCategory] } : {}),
    ...(isFreeParam === 'true'
      ? { isFree: true }
      : isFreeParam === 'false'
        ? { isFree: false }
        : isFreeParam === 'unknown'
          ? { isFree: null }
          : {}),
    ...(q && q.length >= 2 ? { q: q.slice(0, 80) } : {}),
    ...(maxDistanceMeters !== undefined && maxDistanceMeters < SEARCH_RADIUS_METERS
      ? { maxDistance: maxDistanceMeters }
      : {}),
  };
}
