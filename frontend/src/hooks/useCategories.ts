import { useQuery } from '@tanstack/react-query';
import { eventsRepository } from '../api/eventsRepository';

export function useCategories(lang = 'fr') {
  return useQuery({
    queryKey: ['categories', lang],
    queryFn: () => eventsRepository.listCategories(),
  });
}
