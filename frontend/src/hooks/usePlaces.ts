import { useQuery } from '@tanstack/react-query';
import { placesRepository } from '../api';
import { normalizePlaceListParams, type PlaceListParamsInput } from '../api/placesRepository';

export function usePlaces(params: PlaceListParamsInput) {
  const normalizedParams = normalizePlaceListParams(params);
  return useQuery({
    queryKey: ['places', 'list', normalizedParams],
    queryFn: () => placesRepository.listPlaces(normalizedParams),
  });
}
