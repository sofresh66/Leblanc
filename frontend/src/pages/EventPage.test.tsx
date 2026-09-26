import { HelmetProvider } from 'react-helmet-async';
// @vitest-environment jsdom
import { randomUUID } from 'node:crypto';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { MockEventsRepository } from '../api/eventsRepository';
import { EventPage } from './EventPage';

const { mockedUseEvent } = vi.hoisted(() => ({ mockedUseEvent: vi.fn() }));
vi.mock('../hooks/useEvent', () => ({ useEvent: mockedUseEvent }));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'fr' } }),
}));

describe('Historique des séances sur la fiche événement', () => {
  it('affiche les dates passées et futures avec les horaires et le lieu', async () => {
    const repository = new MockEventsRepository();
    const first = (await repository.listEvents({ lang: 'fr', limit: 1 })).items[0];
    if (!first) throw new Error('Fixture événement absente');
    const detail = await repository.getEventById(first.id, 'fr');
    if (!detail) throw new Error('Fiche événement absente');
    mockedUseEvent.mockReturnValue({
      data: {
        ...detail,
        occurrences: [
          { id: randomUUID(), startDate: '2020-01-01T10:00:00Z', endDate: '2020-01-01T12:00:00Z', timezone: 'Europe/Paris' },
          { id: randomUUID(), startDate: '2099-01-01T10:00:00Z', endDate: '2099-01-01T12:00:00Z', timezone: 'Europe/Paris' },
        ],
      },
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });

    render(
      <HelmetProvider><MemoryRouter initialEntries={[`/fr/evenements/${first.id}`]}>
        <Routes><Route path="/fr/evenements/:id" element={<EventPage />} /></Routes>
      </MemoryRouter></HelmetProvider>,
    );

    expect(screen.getAllByTestId('event-occurrence')).toHaveLength(2);
    expect(screen.getByText('details.occurrencePast')).toBeTruthy();
    expect(screen.getByText('details.occurrenceFuture')).toBeTruthy();
    expect(screen.getByText('details.location')).toBeTruthy();
    expect(screen.getAllByText(/11:00/).length).toBeGreaterThan(0);
  });
});
