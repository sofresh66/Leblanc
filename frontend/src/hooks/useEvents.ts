import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import type { EventListParamsInput, EventListResponse } from '@leblanc/shared';
import { eventsRepository, normalizeEventListParams } from '../api/eventsRepository';

export function useEvents(params: EventListParamsInput) {
  const normalizedKey = normalizeEventListParams(params);

  return useQuery({
    queryKey: ['events', 'list', normalizedKey],
    queryFn: () => eventsRepository.listEvents(params),
  });
}

export function useInfiniteEvents(params: Omit<EventListParamsInput, 'cursor'>) {
  const normalizedKey = normalizeEventListParams(params);

  return useInfiniteQuery<EventListResponse, Error>({
    queryKey: ['events', 'infinite', normalizedKey],
    queryFn: ({ pageParam }) => {
      const cursor = typeof pageParam === 'string' ? pageParam : undefined;
      const queryParams: EventListParamsInput = {
        ...params,
        ...(cursor ? { cursor } : {}),
      };
      return eventsRepository.listEvents(queryParams);
    },
    initialPageParam: undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });
}
