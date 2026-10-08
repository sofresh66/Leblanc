import { useEffect } from 'react';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  SEARCH_RADIUS_METERS,
  type EventListParamsInput,
  type EventListResponse,
} from '@leblanc/shared';
import { eventsRepository } from '../api';
import { ApiError } from '../api/apiEventsRepository';
import { normalizeEventListParams } from '../api/eventsRepository';

/**
 * Résout le rayon de recherche en mètres depuis les paramètres d'URL.
 *
 * - `?maxDistance=5000` : format courant, exprimé en mètres.
 * - `?maxDistanceKm=5` : ancien format (kilomètres), converti en mètres pour la rétrocompatibilité.
 *
 * Le rayon est plafonné à 20 000 m, limite acceptée par l'API ; retourne `undefined`
 * si le paramètre est absent ou inexploitable.
 */
export function resolveMaxDistanceMeters(searchParams: URLSearchParams): number | undefined {
  const rawMeters = searchParams.get('maxDistance');
  if (rawMeters !== null) {
    const meters = Number(rawMeters);
    if (Number.isFinite(meters) && meters > 0) {
      return Math.min(Math.round(meters), SEARCH_RADIUS_METERS);
    }
  }

  const rawLegacyKm = searchParams.get('maxDistanceKm');
  if (rawLegacyKm !== null) {
    const legacyKm = Number(rawLegacyKm);
    if (Number.isFinite(legacyKm) && legacyKm > 0) {
      return Math.min(Math.round(legacyKm * 1000), SEARCH_RADIUS_METERS);
    }
  }

  return undefined;
}

export function useEvents(params: EventListParamsInput) {
  const normalizedKey = normalizeEventListParams(params);

  return useQuery({
    queryKey: ['events', 'list', normalizedKey],
    queryFn: () => eventsRepository.listEvents(params),
  });
}

/** Points de la carte : tous les événements visibles, sans pagination. */
export function useEventsGeo(params: Omit<EventListParamsInput, 'cursor' | 'limit'>) {
  const normalizedKey = normalizeEventListParams({ ...params, limit: 0 });
  return useQuery({
    queryKey: ['events', 'geo', normalizedKey],
    queryFn: () => eventsRepository.listEventGeo(params),
  });
}

export function useInfiniteEvents(params: Omit<EventListParamsInput, 'cursor'>) {
  const normalizedKey = normalizeEventListParams(params);
  const queryClient = useQueryClient();
  const queryKey = ['events', 'infinite', normalizedKey];

  const query = useInfiniteQuery<EventListResponse, Error>({
    queryKey,
    queryFn: ({ pageParam }) => {
      const cursor = typeof pageParam === 'string' ? pageParam : undefined;
      const queryParams: EventListParamsInput = {
        ...params,
        ...(cursor ? { cursor } : {}),
      };
      return eventsRepository.listEvents(queryParams);
    },
    initialPageParam: undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });

  // Curseur expiré (plus de 24 h, ou ancien format) : repartir de la première page.
  const cursorExpired = query.error instanceof ApiError && query.error.code === 'CURSOR_EXPIRED';
  const keyHash = JSON.stringify(normalizedKey);
  useEffect(() => {
    if (cursorExpired) void queryClient.resetQueries({ queryKey: ['events', 'infinite', JSON.parse(keyHash) as unknown] });
  }, [cursorExpired, keyHash, queryClient]);

  return query;
}
