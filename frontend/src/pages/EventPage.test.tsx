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

describe('Boutons « Ajouter à mon calendrier » et « Partager »', () => {
  const calendarButton = () => screen.queryByRole('button', { name: 'details.addToCalendarLabel' });
  const shareButton = () => screen.queryByRole('button', { name: 'details.shareLabel' });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('ouvre un menu sans rien télécharger, puis Google Agenda ou le .ics de la prochaine séance', async () => {
    const blobs: Blob[] = [];
    URL.createObjectURL = vi.fn((blob: Blob) => { blobs.push(blob); return 'blob:event'; });
    URL.revokeObjectURL = vi.fn();
    const clicked: HTMLAnchorElement[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) { clicked.push(this); });
    await renderWithOccurrences([occurrence('2020-01-01T10:00:00Z', '2020-01-01T12:00:00Z'), occurrence('2099-01-01T10:00:00Z', '2099-01-01T12:00:00Z')]);

    const button = calendarButton()!;
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('group', { name: 'details.calendarOptions' })).toBeNull();
    fireEvent.click(button);
    // Un seul toucher : le menu s'ouvre, aucun téléchargement automatique.
    expect(URL.createObjectURL).not.toHaveBeenCalled();
    expect(button.getAttribute('aria-expanded')).toBe('true');
    const menu = screen.getByRole('group', { name: 'details.calendarOptions' });
    expect(button.getAttribute('aria-controls')).toBe(menu.id);

    const google = screen.getByRole('link', { name: 'details.calendarGoogleLabel' });
    expect(google.textContent).toContain('Google Agenda');
    expect(google.getAttribute('target')).toBe('_blank');
    expect(google.getAttribute('rel')).toBe('noopener noreferrer');
    const query = new URL(google.getAttribute('href')!).searchParams;
    expect(google.getAttribute('href')).toMatch(/^https:\/\/calendar\.google\.com\/calendar\/render\?action=TEMPLATE&text=/);
    expect(query.get('dates')).toBe('20990101T100000Z/20990101T120000Z');
    expect(query.get('details')).toMatch(/\nhttps:\/\/leblanc-et-moi\.fr\/fr\/evenements\/[0-9a-f-]{36}$/);

    fireEvent.click(screen.getByRole('button', { name: 'details.calendarIcs' }));
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(clicked[0]?.download).toMatch(/^[a-z0-9-]+\.ics$/);
    const text = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.readAsText(blobs[0]!);
    });
    expect(text.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(text).toContain('DTSTART:20990101T100000Z\r\n');
    expect(text.replace(/\r\n /g, '')).toMatch(/URL:https:\/\/leblanc-et-moi\.fr\/fr\/evenements\/[0-9a-f-]{36}\r\n/);
  });

  it('masque le calendrier quand toutes les séances sont passées, garde le partage', async () => {
    await renderWithOccurrences([occurrence('2020-01-01T10:00:00Z', '2020-01-01T12:00:00Z'), occurrence('2020-01-08T10:00:00Z', '2020-01-08T12:00:00Z')]);
    expect(calendarButton()).toBeNull();
    expect(shareButton()).toBeTruthy();
  });

  it('masque le calendrier pour une séance de plus de 14 jours, garde le partage', async () => {
    await renderWithOccurrences([occurrence('2026-01-01T07:00:00.000Z', '2099-12-31T12:00:00.000Z')]);
    expect(calendarButton()).toBeNull();
    expect(shareButton()).toBeTruthy();
  });

  it('partage l’URL canonique .fr, jamais une adresse pages.dev', async () => {
    vi.stubEnv('VITE_SITE_URL', 'https://agenda-preview.leblanc-et-moi.pages.dev');
    await renderWithOccurrences([occurrence('2099-01-01T10:00:00Z', '2099-01-01T12:00:00Z')]);
    fireEvent.click(shareButton()!);
    for (const name of ['details.shareWhatsAppLabel', 'details.shareSms']) {
      const href = decodeURIComponent(screen.getByRole('link', { name }).getAttribute('href') ?? '');
      expect(href).toMatch(/\nhttps:\/\/leblanc-et-moi\.fr\/fr\/evenements\/[0-9a-f-]{36}$/);
      expect(href).not.toContain('pages.dev');
    }
  });
});
