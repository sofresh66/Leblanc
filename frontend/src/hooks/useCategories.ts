import { useQuery } from '@tanstack/react-query';
import { eventsRepository } from '../api';

export function useCategories(lang = 'fr') {
  return useQuery({
    queryKey: ['categories', lang],
    queryFn: () => eventsRepository.listCategories(),
  });
}
