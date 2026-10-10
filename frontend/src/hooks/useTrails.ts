import { useEffect } from 'react';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import type { TrailListResponse } from '@leblanc/shared';
import { ApiError } from '../api/apiEventsRepository';
import { listTrailGeo, listTrails, normalizeTrailFilters, type TrailFilters } from '../api/trailsRepository';

/** Pages de parcours ; un changement de filtres crée une nouvelle clé et repart de la première page. */
export function useInfiniteTrails(filters: TrailFilters) {
  const normalized = normalizeTrailFilters(filters);
  const queryClient = useQueryClient();
  const keyHash = JSON.stringify(normalized);
  const query = useInfiniteQuery<TrailListResponse, Error>({
    queryKey: ['trails', 'infinite', normalized],
    queryFn: ({ pageParam }) => listTrails(normalized, typeof pageParam === 'string' ? { cursor: pageParam } : {}),
    initialPageParam: undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });

  // Curseur expiré (plus de 24 h) : repartir de la première page, sans erreur affichée.
  const cursorExpired = query.error instanceof ApiError && query.error.code === 'CURSOR_EXPIRED';
  useEffect(() => {
    if (cursorExpired) void queryClient.resetQueries({ queryKey: ['trails', 'infinite', JSON.parse(keyHash) as unknown] });
  }, [cursorExpired, keyHash, queryClient]);

  return { ...query, cursorExpired };
}

/** Carte : tous les parcours filtrés, chargés seulement quand la vue carte est ouverte. */
export function useTrailGeo(filters: TrailFilters, enabled: boolean) {
  const normalized = normalizeTrailFilters(filters);
  return useQuery({
    queryKey: ['trails', 'geo', normalized],
    queryFn: () => listTrailGeo(normalized),
    enabled,
  });
}
