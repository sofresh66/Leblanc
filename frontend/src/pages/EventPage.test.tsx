import { HelmetProvider } from 'react-helmet-async';
// @vitest-environment jsdom
import { randomUUID } from 'node:crypto';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
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


const occurrence = (startDate: string, endDate: string | null, allDay = false) =>
  ({ id: randomUUID(), startDate, endDate, timezone: 'Europe/Paris', allDay });

async function renderWithOccurrences(occurrences: ReturnType<typeof occurrence>[]) {
  const repository = new MockEventsRepository();
  const first = (await repository.listEvents({ lang: 'fr', limit: 1 })).items[0];
  if (!first) throw new Error('Fixture événement absente');
  const detail = await repository.getEventById(first.id, 'fr');
  if (!detail) throw new Error('Fiche événement absente');
  mockedUseEvent.mockReturnValue({ data: { ...detail, occurrences }, isLoading: false, isError: false, error: null, refetch: vi.fn() });
  render(
    <HelmetProvider><MemoryRouter initialEntries={[`/fr/evenements/${first.id}`]}>
      <Routes><Route path="/fr/evenements/:id" element={<EventPage />} /></Routes>
    </MemoryRouter></HelmetProvider>,
  );
}

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

  it('masque les dates passées derrière un bouton et garde les horaires et le lieu', async () => {
    await renderWithOccurrences([occurrence('2020-01-01T10:00:00Z', '2020-01-01T12:00:00Z'), occurrence('2099-01-01T10:00:00Z', '2099-01-01T12:00:00Z')]);
    expect(screen.getAllByTestId('event-occurrence')).toHaveLength(1);
    expect(screen.queryByText('details.occurrencePast')).toBeNull();
    expect(screen.getByText('details.occurrenceFuture')).toBeTruthy();
    expect(screen.getByText('details.location')).toBeTruthy();
    expect(screen.getAllByText(/11:00/).length).toBeGreaterThan(0);

    const toggle = screen.getByRole('button', { name: 'details.showPastDates' });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(toggle);
    expect(screen.getAllByTestId('event-occurrence')).toHaveLength(2);
    expect(screen.getByText('details.occurrencePast')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'details.hidePastDates' }).getAttribute('aria-expanded')).toBe('true');
  });

  it('affiche les 5 premières dates à venir puis déplie les autres, sans numérotation', async () => {
    const weekly = Array.from({ length: 12 }, (_, week) => {
      const day = new Date(Date.UTC(2099, 0, 1 + week * 7, 7));
      return occurrence(day.toISOString(), new Date(day.getTime() + 4 * 3600_000).toISOString());
    });
    await renderWithOccurrences(weekly);
    expect(screen.getAllByTestId('event-occurrence')).toHaveLength(5);
    expect(screen.getAllByTestId('event-occurrence')[0]?.closest('ol')).toBeNull();
    expect(screen.queryByRole('button', { name: 'details.showPastDates' })).toBeNull();

    const more = screen.getByRole('button', { name: 'details.showMoreDates' });
    expect(more.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(more);
    expect(screen.getAllByTestId('event-occurrence')).toHaveLength(12);
    expect(screen.getByRole('button', { name: 'details.showFewerDates' }).getAttribute('aria-expanded')).toBe('true');
  });

  it('affiche « Aujourd’hui » pour une date « toute la journée » le jour même', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-09T12:00:00.000Z'));
    try {
      await renderWithOccurrences([
        occurrence('2026-10-01T22:00:00.000Z', '2026-10-02T21:59:59.000Z', true),
        occurrence('2026-10-08T22:00:00.000Z', '2026-10-09T21:59:59.000Z', true),
      ]);
      expect(screen.getAllByTestId('event-occurrence')).toHaveLength(1);
      expect(screen.getByText('details.occurrenceToday')).toBeTruthy();
      expect(screen.getByRole('button', { name: 'details.showPastDates' })).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });

  it('ne change rien pour un événement à date unique, même passé', async () => {
    await renderWithOccurrences([occurrence('2020-01-01T10:00:00Z', '2020-01-01T12:00:00Z')]);
    expect(screen.getAllByTestId('event-occurrence')).toHaveLength(1);
    expect(screen.getByText('details.occurrencePast')).toBeTruthy();
    expect(screen.queryAllByRole('button', { name: /Dates/ })).toHaveLength(0);
  });
});
