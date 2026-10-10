import { useEffect } from 'react';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { TRAIL_MODES, type SupportedLanguage, type TrailListResponse } from '@leblanc/shared';
import { ApiError } from '../api/apiEventsRepository';
import { getTrail, getTrailNearby, listTrailGeo, listTrails, normalizeTrailFilters, type TrailFilters } from '../api/trailsRepository';

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

/** Fiche d'un parcours ; null si inconnu ou masqué. */
export function useTrail(id: string | undefined, lang: SupportedLanguage) {
  return useQuery({
    queryKey: ['trails', 'detail', id, lang],
    queryFn: () => (id ? getTrail(id, lang) : null),
    enabled: Boolean(id),
  });
}

/** Bloc « À proximité du départ », chargé après la fiche. */
export function useTrailNearby(id: string | undefined, lang: SupportedLanguage, enabled: boolean) {
  return useQuery({
    queryKey: ['trails', 'nearby', id, lang],
    queryFn: () => (id ? getTrailNearby(id, lang) : null),
    enabled: enabled && Boolean(id),
  });
}

/** Producteurs et crédits photo de tous les parcours publiés (page Crédits). */
export function useTrailCredits(lang: SupportedLanguage) {
  return useQuery({
    queryKey: ['trails', 'credits', lang],
    queryFn: async () => {
      const producers = new Set<string>();
      const credits = new Map<string, { credit: string; license: string | null; count: number }>();
      let cursor: string | undefined;
      // Borne : 20 pages de 50 parcours.
      for (let page = 0; page < 20; page++) {
        const response = await listTrails({ lang, modes: [...TRAIL_MODES] }, { limit: 50, ...(cursor ? { cursor } : {}) });
        for (const trail of response.items) {
          if (trail.producer) producers.add(trail.producer);
          if (trail.imageUrl && trail.imageCredit) {
            const key = `${trail.imageCredit}\u0000${trail.imageLicense ?? ''}`;
            const entry = credits.get(key) ?? { credit: trail.imageCredit, license: trail.imageLicense, count: 0 };
            entry.count++;
            credits.set(key, entry);
          }
        }
        if (!response.nextCursor) break;
        cursor = response.nextCursor;
      }
      return {
        producers: [...producers].sort((a, b) => a.localeCompare(b, lang)),
        credits: [...credits.values()].sort((a, b) => b.count - a.count || a.credit.localeCompare(b.credit, lang)),
      };
    },
  });
}
