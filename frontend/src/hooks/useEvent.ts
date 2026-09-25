import { useQuery } from '@tanstack/react-query';
import { eventsRepository } from '../api';

export function useEvent(id: string | undefined, lang: string) {
  return useQuery({
    queryKey: ['events', 'detail', id, lang],
    queryFn: () => (id ? eventsRepository.getEventById(id, lang) : null),
    enabled: Boolean(id),
  });
}
