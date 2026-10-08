import { HelmetProvider } from 'react-helmet-async';
// @vitest-environment jsdom
import { randomUUID } from 'node:crypto';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MockEventsRepository } from '../api/eventsRepository';
import { EventPage } from './EventPage';
import { resolveEventContent } from '@leblanc/shared';

afterEach(cleanup);

const { mockedUseEvent } = vi.hoisted(() => ({ mockedUseEvent: vi.fn() }));
vi.mock('../hooks/useEvent', () => ({ useEvent: mockedUseEvent }));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'fr' } }),
}));

describe('Historique des séances sur la fiche événement', () => {
  it('affiche la description anglaise et déclare les langues de chaque champ', async () => {
    const repository = new MockEventsRepository();
    const first = (await repository.listEvents({ lang: 'fr', limit: 1 })).items[0]!;
    const detail = (await repository.getEventById(first.id, 'fr'))!;
    const translations = {
      title_i18n: { fr: 'Titre uniquement français' },
      description_i18n: { fr: 'Texte français', en: 'English description displayed' },
    };
    mockedUseEvent.mockReturnValue({
      data: { ...detail, ...translations, ...resolveEventContent(translations, 'en') },
      isLoading: false, isError: false, error: null, refetch: vi.fn(),
    });
    render(<HelmetProvider><MemoryRouter><EventPage /></MemoryRouter></HelmetProvider>);
    expect(screen.getByRole('heading', { level: 1 }).getAttribute('lang')).toBe('fr');
    expect(screen.getByText('English description displayed').getAttribute('lang')).toBe('en');
    expect(screen.queryByText('Texte français')).toBeNull();
  });
  it('n’affiche aucune mention de repli pour une description allemande sous un titre français', async () => {
    const repository = new MockEventsRepository();
    const first = (await repository.listEvents({ lang: 'fr', limit: 1 })).items[0]!;
    const detail = (await repository.getEventById(first.id, 'fr'))!;
    const translations = {
      title_i18n: { fr: 'Titre uniquement français' },
      description_i18n: { fr: 'Texte français', de: 'Deutsche Beschreibung' },
    };
    const content = resolveEventContent(translations, 'de');
    expect(content).toMatchObject({ contentLanguage: 'fr', descriptionLanguage: 'de', isFallback: false });
    mockedUseEvent.mockReturnValue({
      data: { ...detail, ...translations, ...content },
      isLoading: false, isError: false, error: null, refetch: vi.fn(),
    });
    render(<HelmetProvider><MemoryRouter><EventPage /></MemoryRouter></HelmetProvider>);
    expect(screen.getByText('Deutsche Beschreibung').getAttribute('lang')).toBe('de');
    expect(screen.queryByText('details.fallbackNotice')).toBeNull();
  });

  it('affiche « Description non disponible » quand aucune description n’est servie', async () => {
    const repository = new MockEventsRepository();
    const first = (await repository.listEvents({ lang: 'fr', limit: 1 })).items[0]!;
    const detail = (await repository.getEventById(first.id, 'fr'))!;
    const translations = { title_i18n: { fr: 'Moins de voiture, plus d’aventure !' }, description_i18n: { fr: '' } };
    mockedUseEvent.mockReturnValue({
      data: { ...detail, ...translations, ...resolveEventContent(translations, 'en') },
      isLoading: false, isError: false, error: null, refetch: vi.fn(),
    });
    render(<HelmetProvider><MemoryRouter><EventPage /></MemoryRouter></HelmetProvider>);
    expect(screen.getByText('details.noDescription')).toBeTruthy();
    expect(screen.queryByText('details.fallbackNotice')).toBeNull();
  });

  it('affiche la mention de repli quand la description retombe sur le français', async () => {
    const repository = new MockEventsRepository();
    const first = (await repository.listEvents({ lang: 'fr', limit: 1 })).items[0]!;
    const detail = (await repository.getEventById(first.id, 'fr'))!;
    const translations = { title_i18n: { fr: 'Titre', de: 'Titel' }, description_i18n: { fr: 'Texte français' } };
    mockedUseEvent.mockReturnValue({
      data: { ...detail, ...translations, ...resolveEventContent(translations, 'de') },
      isLoading: false, isError: false, error: null, refetch: vi.fn(),
    });
    render(<HelmetProvider><MemoryRouter><EventPage /></MemoryRouter></HelmetProvider>);
    expect(screen.getByText('details.fallbackNotice')).toBeTruthy();
  });

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
