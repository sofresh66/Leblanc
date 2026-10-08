// @vitest-environment jsdom
import { HelmetProvider } from 'react-helmet-async';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { EventGeoPoint } from '@leblanc/shared';

const { useEventsGeo, useEvents } = vi.hoisted(() => ({ useEventsGeo: vi.fn(), useEvents: vi.fn() }));
vi.mock('../hooks/useEvents', async (original) => ({
  ...await original<typeof import('../hooks/useEvents')>(),
  useEventsGeo,
  useEvents,
}));
vi.mock('../components/map/EventMap', () => ({
  EventMap: ({ points }: { points: EventGeoPoint[] }) => <div data-testid="event-map">{points.length} points</div>,
}));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { count?: number }) => (options?.count !== undefined ? `${key}:${options.count}` : key),
    i18n: { language: 'fr' },
  }),
}));

import { MapPage } from './MapPage';
import { EventFilters } from '../components/events/EventFilters';

afterEach(cleanup);

const point = (index: number): EventGeoPoint => ({
  id: `a1000000-0000-4000-8000-${String(index).padStart(12, '0')}`, lat: 46.63, lng: 1.08, category: 'culture',
  title: `Événement ${index}`, city: 'Le Blanc', startDate: '2026-10-12T08:00:00.000Z', endDate: null,
  timezone: 'Europe/Paris', allDay: false,
});

function renderMap(url = '/fr/carte?category=culture&q=jazz') {
  return render(<HelmetProvider><MemoryRouter initialEntries={[url]}><MapPage /></MemoryRouter></HelmetProvider>);
}

describe('MapPage', () => {
  it('affiche tous les points de /events/geo, sans limite de 50 ni bannière', () => {
    useEventsGeo.mockReturnValue({ data: { items: Array.from({ length: 125 }, (_, i) => point(i + 1)), truncated: false }, isLoading: false, isError: false });
    useEvents.mockReturnValue({ data: { items: [] }, isError: false });
    renderMap();
    expect(screen.getByTestId('event-map').textContent).toBe('125 points');
    expect(screen.getByRole('heading', { level: 2, name: 'map.results:125' })).toBeTruthy();
    expect(screen.queryByText(/limitBanner|map\.truncated/)).toBeNull();
    expect(useEventsGeo).toHaveBeenLastCalledWith(expect.objectContaining({ categories: ['culture'], q: 'jazz' }));
  });

  it('propose la même recherche en liste comme alternative textuelle à la carte', () => {
    useEventsGeo.mockReturnValue({ data: { items: [point(1)], truncated: false }, isLoading: false, isError: false });
    useEvents.mockReturnValue({ data: { items: [] }, isError: false });
    renderMap();
    expect(screen.getByRole('link', { name: 'map.listLink' }).getAttribute('href')).toBe('/fr/liste?category=culture&q=jazz');
  });

  it('signale une carte tronquée au-delà de la borne de l’API', () => {
    useEventsGeo.mockReturnValue({ data: { items: [point(1)], truncated: true }, isLoading: false, isError: false });
    useEvents.mockReturnValue({ data: { items: [] }, isError: false });
    renderMap();
    expect(screen.getByRole('status').textContent).toBe('map.truncated:1');
  });
});

describe('EventFilters (mobile)', () => {
  it('n’a qu’un bouton « Filtres » avec le nombre de filtres actifs, et des identifiants uniques', () => {
    render(<MemoryRouter initialEntries={['/fr/liste?category=sport&isFree=unknown']}>
      <EventFilters /><EventFilters />
    </MemoryRouter>);
    const toggles = screen.getAllByRole('button', { name: 'toggleCount:2' });
    expect(toggles).toHaveLength(2);
    expect(toggles[0]?.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(toggles[0] as HTMLElement);
    expect(toggles[0]?.getAttribute('aria-expanded')).toBe('true');
    const ids = [...document.querySelectorAll('select, input[type="range"]')].map((element) => element.id);
    expect(new Set(ids).size).toBe(ids.length);
    const form = document.getElementById(toggles[0]?.getAttribute('aria-controls') ?? '');
    expect(within(form as HTMLElement).getByDisplayValue('unknown')).toBeTruthy();
  });
});
