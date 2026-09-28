import { useQuery } from '@tanstack/react-query';
import { placesRepository } from '../api';

export function usePlace(id: string | undefined, lang: string) {
  return useQuery({
    queryKey: ['places', 'detail', id, lang],
    queryFn: () => (id ? placesRepository.getPlaceById(id, lang) : null),
    enabled: Boolean(id),
  });
}
