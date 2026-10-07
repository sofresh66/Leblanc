// @vitest-environment jsdom
import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { EventListResponse } from '@leblanc/shared';
import { ApiError } from '../api/apiEventsRepository';

const { listEvents } = vi.hoisted(() => ({ listEvents: vi.fn() }));
vi.mock('../api', () => ({ eventsRepository: { listEvents } }));

import { useInfiniteEvents } from './useEvents';

const page = (nextCursor: string | null): EventListResponse => ({ items: [], nextCursor, generatedAt: '2026-10-10T08:00:00.000Z' });

describe('useInfiniteEvents', () => {
  it('repart de la première page quand l’API signale un curseur expiré', async () => {
    listEvents
      .mockResolvedValueOnce(page('vieux-curseur'))
      .mockRejectedValueOnce(new ApiError(400, 'CURSOR_EXPIRED', 'Curseur expiré : reprenez depuis la première page'))
      .mockResolvedValue(page(null));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    const { result } = renderHook(() => useInfiniteEvents({ lang: 'fr' }), { wrapper });

    await waitFor(() => expect(result.current.hasNextPage).toBe(true));
    await act(async () => { await result.current.fetchNextPage(); });

    await waitFor(() => expect(listEvents).toHaveBeenCalledTimes(3));
    expect(listEvents.mock.calls[1]?.[0]).toMatchObject({ cursor: 'vieux-curseur' });
    expect(listEvents.mock.calls[2]?.[0]).not.toHaveProperty('cursor');
    await waitFor(() => expect(result.current.error).toBeNull());
  });
});
