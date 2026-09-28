import { useQuery } from '@tanstack/react-query';
import { placesRepository } from '../api';

export function usePlaceCategories() {
  return useQuery({
    queryKey: ['places', 'categories'],
    queryFn: () => placesRepository.listCategories(),
  });
}
