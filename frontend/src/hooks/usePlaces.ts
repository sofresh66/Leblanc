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
