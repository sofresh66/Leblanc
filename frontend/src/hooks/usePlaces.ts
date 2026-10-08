import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import type { PlaceApiListResponse } from '@leblanc/shared';
import { placesRepository } from '../api';
import { normalizePlaceListParams, type PlaceListParamsInput } from '../api/placesRepository';

export function usePlaces(params: PlaceListParamsInput) {
  const normalizedParams = normalizePlaceListParams(params);
  return useQuery({
    queryKey: ['places', 'list', normalizedParams],
    queryFn: () => placesRepository.listPlaces(normalizedParams),
  });
}

/** Pagination par curseur : le changement des filtres crée une nouvelle clé et repart de la première page. */
export function useInfinitePlaces(params: Omit<PlaceListParamsInput, 'cursor'>) {
  const normalizedParams = normalizePlaceListParams(params);
  return useInfiniteQuery<PlaceApiListResponse, Error>({
    queryKey: ['places', 'infinite', normalizedParams],
    queryFn: ({ pageParam }) => placesRepository.listPlaces({
      ...normalizedParams,
      ...(typeof pageParam === 'string' ? { cursor: pageParam } : {}),
    }),
    initialPageParam: undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });
}

/** Borne de sécurité : 10 pages de 50 lieux pour la vue carte. */
const MAP_MAX_PAGES = 10;

/** Tous les lieux filtrés (pages enchaînées) pour la vue carte de « Où manger ». */
export function usePlacesForMap(params: Omit<PlaceListParamsInput, 'cursor' | 'limit'>, enabled = true) {
  const normalizedParams = normalizePlaceListParams({ ...params, limit: 50 });
  return useQuery({
    queryKey: ['places', 'map', normalizedParams],
    enabled,
    queryFn: async () => {
      const items: PlaceApiListResponse['items'] = [];
      let cursor: string | undefined;
      for (let page = 0; page < MAP_MAX_PAGES; page++) {
        const response = await placesRepository.listPlaces({ ...normalizedParams, ...(cursor ? { cursor } : {}) });
        items.push(...response.items);
        if (!response.nextCursor) break;
        cursor = response.nextCursor;
      }
      return items;
    },
  });
}
