import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Event } from '@leblanc/shared';
import { googleCalendarUrl, GOOGLE_URL_MAX_LENGTH } from './googleCalendar';
import { generateIcsContent, type CalendarOccurrence } from './ics';

const event: Event = {
  id: 'c2eebc99-9c0b-4ef8-bb6d-6bb9bd380a03',
  title_i18n: { fr: 'Concert au bord de l’eau' },
  description_i18n: { fr: 'Un concert acoustique exceptionnel.\nEntrée libre.' },
  title: 'Concert au bord de l’eau',
  description: 'Un concert acoustique exceptionnel.\nEntrée libre.',
  contentLanguage: 'fr',
  isFallback: false,
  distance: 450,
  category: 'culture',
  startDate: '2026-10-18T20:30:00+02:00',
  endDate: '2026-10-18T23:00:00+02:00',
  timezone: 'Europe/Paris',
  venueName: 'Guinguette des Rives',
  address: 'Quai de la Creuse',
  postalCode: '36300',
  city: 'Le Blanc',
  latitude: 46.634,
  longitude: 1.061,
  imageUrl: null,
  isFree: true,
  priceMin: null,
  currency: 'EUR',
  publicUrl: 'https://www.leblanc-tourisme.com',
  source: 'Office de Tourisme',
};
const PAGE = `https://leblanc-et-moi.fr/fr/evenements/${event.id}`;

const timed = (startDate: string, endDate: string | null): CalendarOccurrence =>
  ({ startDate, endDate, timezone: 'Europe/Paris', allDay: false });
const allDay = (startDate: string, endDate: string): CalendarOccurrence =>
  ({ startDate, endDate, timezone: 'Europe/Paris', allDay: true });

function params(url: string) {
  expect(url.startsWith('https://calendar.google.com/calendar/render?action=TEMPLATE&')).toBe(true);
  return new URL(url).searchParams;
}

/** DTSTART/DTEND du .ics de la même séance, au format Google « début/fin ». */
function icsDates(occurrence: CalendarOccurrence): string {
  const content = generateIcsContent(event, occurrence, 'fr');
  const value = (name: string) => new RegExp(`${name}(?:;VALUE=DATE)?:(\\w+)\\r\\n`).exec(content)?.[1];
  return `${value('DTSTART')}/${value('DTEND')}`;
}

afterEach(() => vi.unstubAllEnvs());

describe('googleCalendarUrl', () => {
  it('journée entière : AAAAMMJJ/AAAAMMJJ, fin exclusive au lendemain', () => {
    const occurrence = allDay('2026-10-20T22:00:00.000Z', '2026-10-21T21:59:59.000Z');
    const query = params(googleCalendarUrl(event, occurrence, 'fr'));
    expect(query.get('dates')).toBe('20261021/20261022');
    expect(query.get('dates')).toBe(icsDates(occurrence));
  });

  it('avec heures : UTC en « Z », dates identiques au .ics', () => {
    const occurrence = timed('2026-10-18T15:30:00+02:00', '2026-10-18T17:00:00+02:00');
    const query = params(googleCalendarUrl(event, occurrence, 'fr'));
    expect(query.get('dates')).toBe('20261018T133000Z/20261018T150000Z');
    expect(query.get('dates')).toBe(icsDates(occurrence));
  });

  it('de part et d’autre du passage à l’heure d’hiver du 25 octobre 2026', () => {
    const summer = timed('2026-10-24T20:30:00+02:00', '2026-10-24T23:00:00+02:00');
    const winter = timed('2026-10-25T20:30:00+01:00', '2026-10-25T23:00:00+01:00');
    const night = timed('2026-10-24T23:00:00+02:00', '2026-10-25T02:00:00+01:00');
    expect(params(googleCalendarUrl(event, summer, 'fr')).get('dates')).toBe('20261024T183000Z/20261024T210000Z');
    expect(params(googleCalendarUrl(event, winter, 'fr')).get('dates')).toBe('20261025T193000Z/20261025T220000Z');
    expect(params(googleCalendarUrl(event, night, 'fr')).get('dates')).toBe('20261024T210000Z/20261025T010000Z');
  });

  it('fin 23:59:59 heure de Paris ou absente : début + 2 h, comme le .ics', () => {
    const marker = timed('2026-11-03T16:30:00.000Z', '2026-11-03T22:59:59.000Z');
    expect(params(googleCalendarUrl(event, marker, 'fr')).get('dates')).toBe('20261103T163000Z/20261103T183000Z');
    expect(params(googleCalendarUrl(event, marker, 'fr')).get('dates')).toBe(icsDates(marker));
    const noEnd = timed('2026-10-18T20:30:00+02:00', null);
    expect(params(googleCalendarUrl(event, noEnd, 'fr')).get('dates')).toBe('20261018T183000Z/20261018T203000Z');
  });

  it('encode accents, &, ? et # sans casser les paramètres', () => {
    const title = 'Fête & bal ? Été #2 à l’Église';
    const url = googleCalendarUrl({ ...event, title, venueName: 'Salle A&B #1' }, timed(event.startDate, event.endDate), 'fr');
    const query = url.split('?')[1]!;
    expect(query.split('&').map((pair) => pair.split('=')[0])).toEqual(['action', 'text', 'dates', 'details', 'location']);
    expect(url).not.toContain('#');
    expect(url).toContain(`text=${encodeURIComponent(title)}`);
    expect(params(url).get('text')).toBe(title);
    expect(params(url).get('location')).toBe('Salle A&B #1, Quai de la Creuse, 36300 Le Blanc');
  });

  it('écrit une description courte suivie de l’URL canonique de la langue', () => {
    const fr = params(googleCalendarUrl(event, timed(event.startDate, event.endDate), 'fr'));
    expect(fr.get('details')).toBe(`Un concert acoustique exceptionnel. Entrée libre.\n\n${PAGE}`);
    const en = params(googleCalendarUrl({ ...event, description: 'mot '.repeat(200) }, timed(event.startDate, event.endDate), 'en'));
    const [summary, link] = en.get('details')!.split('\n\n');
    expect(summary!.length).toBeLessThanOrEqual(201);
    expect(summary!.endsWith('…')).toBe(true);
    expect(link).toBe(`https://leblanc-et-moi.fr/en/events/${event.id}`);
  });

  it('omet location sans adresse', () => {
    const url = googleCalendarUrl({ ...event, venueName: null, address: null, postalCode: null, city: null }, timed(event.startDate, event.endDate), 'fr');
    expect(params(url).has('location')).toBe(false);
  });

  it(`reste sous ${GOOGLE_URL_MAX_LENGTH} caractères et garde toujours l’URL canonique`, () => {
    const heavy = 'Été à l’Église — œuvres d’art & découvertes ? #1 '.repeat(20);
    const url = googleCalendarUrl({ ...event, title: heavy, description: heavy, venueName: heavy }, timed(event.startDate, event.endDate), 'fr');
    expect(url.length).toBeLessThanOrEqual(GOOGLE_URL_MAX_LENGTH);
    expect(params(url).get('details')!.endsWith(PAGE)).toBe(true);
    expect(params(url).get('dates')).toBe('20261018T183000Z/20261018T210000Z');
    // Un événement ordinaire garde sa description complète (≤ 200 caractères).
    expect(googleCalendarUrl(event, timed(event.startDate, event.endDate), 'fr').length).toBeLessThan(GOOGLE_URL_MAX_LENGTH);
  });

  it('ne contient jamais « pages.dev », même si VITE_SITE_URL vise une prévisualisation', () => {
    vi.stubEnv('VITE_SITE_URL', 'https://agenda-preview.leblanc-et-moi.pages.dev');
    const url = googleCalendarUrl(event, timed(event.startDate, event.endDate), 'fr');
    expect(url).not.toContain('pages.dev');
    expect(decodeURIComponent(url)).not.toContain('pages.dev');
  });
});
