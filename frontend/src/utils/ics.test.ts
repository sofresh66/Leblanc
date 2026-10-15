// @vitest-environment jsdom
import { afterEach, describe, it, expect, vi } from 'vitest';
import {
  calendarOccurrence, downloadIcsFile, generateIcsContent, icsFileName, MAX_CALENDAR_DAYS,
  type CalendarOccurrence,
} from './ics';
import type { Event } from '@leblanc/shared';

const NOW = new Date('2026-10-15T10:00:00.000Z');

const mockEvent: Event = {
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

const timed = (startDate: string, endDate: string | null): CalendarOccurrence =>
  ({ startDate, endDate, timezone: 'Europe/Paris', allDay: false });
const allDay = (startDate: string, endDate: string): CalendarOccurrence =>
  ({ startDate, endDate, timezone: 'Europe/Paris', allDay: true });

const concert = timed(mockEvent.startDate, mockEvent.endDate);
const ics = (occurrence: CalendarOccurrence = concert, event: Event = mockEvent, lang: 'fr' | 'en' = 'fr') =>
  generateIcsContent(event, occurrence, lang, NOW);
/** Contenu déplié (RFC 5545 §3.1) pour vérifier les valeurs longues. */
const unfold = (content: string) => content.replace(/\r\n /g, '');

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('generateIcsContent — structure', () => {
  it('produit un VCALENDAR complet, lignes terminées par CRLF', () => {
    const content = ics();
    expect(content.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Le Blanc et Moi//leblanc-et-moi.fr//FR\r\n'
      + 'CALSCALE:GREGORIAN\r\nMETHOD:PUBLISH\r\nBEGIN:VEVENT\r\n')).toBe(true);
    expect(content.endsWith('END:VEVENT\r\nEND:VCALENDAR\r\n')).toBe(true);
    // Aucun saut de ligne isolé : chaque \n est précédé de \r.
    expect(content.replace(/\r\n/g, '')).not.toMatch(/[\r\n]/);
    expect(content).toContain('DTSTAMP:20261015T100000Z\r\n');
    expect(content).toContain('SUMMARY:Concert au bord de l’eau\r\n');
    expect(content).toContain('LOCATION:Guinguette des Rives\\, Quai de la Creuse\\, 36300 Le Blanc\r\n');
  });

  it('pointe vers la page canonique de la langue courante, jamais vers le site source', () => {
    const fr = unfold(ics());
    expect(fr).toContain(`URL:https://leblanc-et-moi.fr/fr/evenements/${mockEvent.id}\r\n`);
    expect(fr).not.toContain('leblanc-tourisme.com');
    const en = unfold(ics(concert, mockEvent, 'en'));
    expect(en).toContain(`URL:https://leblanc-et-moi.fr/en/events/${mockEvent.id}\r\n`);
  });

  it('ne contient jamais « pages.dev », même si VITE_SITE_URL vise une prévisualisation', () => {
    vi.stubEnv('VITE_SITE_URL', 'https://agenda-preview.leblanc-et-moi.pages.dev');
    const content = unfold(ics());
    expect(content).not.toContain('pages.dev');
    expect(content).toContain('@leblanc-et-moi.fr');
  });

  it('écrit une description courte : début du texte puis le lien', () => {
    const content = unfold(ics());
    expect(content).toContain(`DESCRIPTION:Un concert acoustique exceptionnel. Entrée libre.\\n\\nhttps://leblanc-et-moi.fr/fr/evenements/${mockEvent.id}\r\n`);
    const long = unfold(ics(concert, { ...mockEvent, description: 'mot '.repeat(200) }));
    const description = /DESCRIPTION:(.*)\r\n/.exec(long)?.[1] ?? '';
    expect(description.split('\\n\\n')[0]).toMatch(/^(mot ){40,}mot…$/);
    expect(description.split('\\n\\n')[0]!.length).toBeLessThanOrEqual(201);
  });

  it('se limite au lien quand la description est vide', () => {
    expect(unfold(ics(concert, { ...mockEvent, description: ' ' })))
      .toContain(`DESCRIPTION:https://leblanc-et-moi.fr/fr/evenements/${mockEvent.id}\r\n`);
  });

  it('échappe antislashs, points-virgules, virgules et retours à la ligne', () => {
    const content = ics(concert, { ...mockEvent, title: 'Jazz, blues; et \\ swing', venueName: 'Salle A;B', description: 'Ligne 1\nLigne 2' });
    expect(content).toContain('SUMMARY:Jazz\\, blues\\; et \\\\ swing\r\n');
    expect(content).toContain('LOCATION:Salle A\\;B\\,');
    expect(unfold(content)).toContain('DESCRIPTION:Ligne 1 Ligne 2\\n\\n');
  });

  it('replie à 75 octets UTF-8 sans couper un accent ni un emoji', () => {
    const title = 'Fête 🎉 à l’Église Saint-Génitour — œuvres d’été 🌻 '.repeat(5).trim();
    const content = ics(concert, { ...mockEvent, title });
    const encoder = new TextEncoder();
    const lines = content.split('\r\n');
    for (const line of lines) expect(encoder.encode(line).length).toBeLessThanOrEqual(75);
    expect(lines.some((line) => line.startsWith(' '))).toBe(true);
    // Aucun caractère de remplacement : chaque morceau reste de l'UTF-8 valide.
    for (const line of lines) expect(new TextDecoder('utf-8', { fatal: true }).decode(encoder.encode(line))).toBe(line);
    expect(unfold(content)).toContain(`SUMMARY:${title}\r\n`);
  });

  it('ajoute GEO avec des coordonnées valides, l’omet sinon', () => {
    expect(ics()).toContain('GEO:46.634;1.061\r\n');
    expect(ics(concert, { ...mockEvent, latitude: Number.NaN, longitude: Number.NaN })).not.toContain('GEO:');
    expect(ics(concert, { ...mockEvent, latitude: 0, longitude: 0 })).not.toContain('GEO:');
  });

  it('omet LOCATION quand tous les champs d’adresse sont nuls, garde le lieu seul sinon', () => {
    const none = { ...mockEvent, venueName: null, address: null, postalCode: null, city: null };
    expect(ics(concert, none)).not.toContain('LOCATION:');
    expect(ics(concert, { ...none, venueName: 'Guinguette des Rives' })).toContain('LOCATION:Guinguette des Rives\r\n');
  });
});

describe('generateIcsContent — UID', () => {
  it('reste identique entre deux appels (seul DTSTAMP change)', () => {
    const first = generateIcsContent(mockEvent, concert, 'fr', NOW);
    const second = generateIcsContent(mockEvent, concert, 'en', new Date('2026-12-01T00:00:00Z'));
    const uid = (content: string) => /UID:(.*)\r\n/.exec(content)?.[1];
    expect(uid(first)).toBe(`${mockEvent.id}-20261018@leblanc-et-moi.fr`);
    expect(uid(second)).toBe(uid(first));
    expect(first).not.toBe(second);
  });

  it('diffère d’une séance à l’autre du même événement', () => {
    const other = timed('2026-10-25T20:30:00+01:00', '2026-10-25T23:00:00+01:00');
    expect(ics(other)).toContain(`UID:${mockEvent.id}-20261025@leblanc-et-moi.fr\r\n`);
  });
});

describe('generateIcsContent — dates', () => {
  it('journée entière : dates seules, fin exclusive au lendemain', () => {
    // Stockage source : 00:00 → 23:59:59 heure de Paris (22:00Z la veille en été).
    const content = ics(allDay('2026-10-20T22:00:00.000Z', '2026-10-21T21:59:59.000Z'));
    expect(content).toContain('DTSTART;VALUE=DATE:20261021\r\n');
    expect(content).toContain('DTEND;VALUE=DATE:20261022\r\n');
    expect(content).not.toMatch(/DTSTART:\d/);
  });

  it('journée entière sur plusieurs jours, à cheval sur le changement d’heure', () => {
    // 26 → 30 octobre 2026 (heure d'hiver depuis le 25).
    const content = ics(allDay('2026-10-25T23:00:00.000Z', '2026-10-30T22:59:59.000Z'));
    expect(content).toContain('DTSTART;VALUE=DATE:20261026\r\n');
    expect(content).toContain('DTEND;VALUE=DATE:20261031\r\n');
  });

  it('heure d’été (samedi 24 octobre 2026, UTC+2) : 20:30 Paris → 18:30Z', () => {
    const content = ics(timed('2026-10-24T18:30:00.000Z', '2026-10-24T21:00:00.000Z'));
    expect(content).toContain('DTSTART:20261024T183000Z\r\n');
    expect(content).toContain('DTEND:20261024T210000Z\r\n');
  });

  it('heure d’hiver (dimanche 25 octobre 2026, UTC+1) : 20:30 Paris → 19:30Z', () => {
    const content = ics(timed('2026-10-25T20:30:00+01:00', '2026-10-25T23:00:00+01:00'));
    expect(content).toContain('DTSTART:20261025T193000Z\r\n');
    expect(content).toContain('DTEND:20261025T220000Z\r\n');
  });

  it('séance qui traverse le passage à l’heure d’hiver (nuit du 24 au 25 octobre)', () => {
    // 23:00 (UTC+2) → 02:00 (UTC+1) : 4 heures réelles.
    const content = ics(timed('2026-10-24T23:00:00+02:00', '2026-10-25T02:00:00+01:00'));
    expect(content).toContain('DTSTART:20261024T210000Z\r\n');
    expect(content).toContain('DTEND:20261025T010000Z\r\n');
  });

  it('plusieurs jours avec heures : début et fin conservés', () => {
    const content = ics(timed('2026-10-17T08:00:00.000Z', '2026-10-18T17:00:00.000Z'));
    expect(content).toContain('DTSTART:20261017T080000Z\r\n');
    expect(content).toContain('DTEND:20261018T170000Z\r\n');
  });

  it('sans heure de fin : DTEND = début + 2 h', () => {
    const content = ics(timed('2026-10-18T20:30:00+02:00', null));
    expect(content).toContain('DTSTART:20261018T183000Z\r\n');
    expect(content).toContain('DTEND:20261018T203000Z\r\n');
  });

  it('marqueur 23:59:59 heure de Paris le jour même = pas d’heure de fin (été et hiver)', () => {
    const summer = ics(timed('2026-10-15T18:00:00.000Z', '2026-10-15T21:59:59.000Z'));
    expect(summer).toContain('DTEND:20261015T200000Z\r\n');
    const winter = ics(timed('2026-11-03T16:30:00.000Z', '2026-11-03T22:59:59.000Z'));
    expect(winter).toContain('DTEND:20261103T183000Z\r\n');
  });

  it('marqueur 23:59:59 sur plusieurs jours : la période est conservée', () => {
    const content = ics(timed('2026-10-26T08:00:00.000Z', '2026-10-30T22:59:59.000Z'));
    expect(content).toContain('DTEND:20261030T225959Z\r\n');
  });

  it('une fin à 23:59:59 en UTC (pas en heure de Paris) reste une vraie fin', () => {
    const content = ics(timed('2026-10-15T18:00:00.000Z', '2026-10-15T23:59:59.000Z'));
    expect(content).toContain('DTEND:20261015T235959Z\r\n');
  });
});

describe('calendarOccurrence — séance exportée et bouton masqué', () => {
  const base = { startDate: '2026-01-01T07:00:00.000Z', endDate: '2026-12-31T12:00:00.000Z', timezone: 'Europe/Paris', allDay: false };

  it('retient la première séance en cours ou à venir, même si la liste n’est pas triée', () => {
    const next = timed('2026-10-22T08:00:00.000Z', '2026-10-22T11:00:00.000Z');
    const later = timed('2026-10-29T08:00:00.000Z', '2026-10-29T11:00:00.000Z');
    const past = timed('2026-10-08T08:00:00.000Z', '2026-10-08T11:00:00.000Z');
    expect(calendarOccurrence({ ...base, occurrences: [later, past, next] }, NOW)).toBe(next);
  });

  it('retient une séance en cours (commencée, pas finie)', () => {
    const ongoing = allDay('2026-10-12T22:00:00.000Z', '2026-10-16T21:59:59.000Z');
    expect(calendarOccurrence({ ...base, occurrences: [ongoing] }, NOW)).toBe(ongoing);
  });

  it('masque le bouton quand toutes les séances sont passées', () => {
    const past = [timed('2026-10-01T08:00:00.000Z', '2026-10-01T11:00:00.000Z'), timed('2026-10-08T08:00:00.000Z', '2026-10-08T11:00:00.000Z')];
    expect(calendarOccurrence({ ...base, occurrences: past }, NOW)).toBeNull();
  });

  it(`masque le bouton pour une séance de plus de ${MAX_CALENDAR_DAYS} jours (marché du 01/01 au 31/12)`, () => {
    expect(calendarOccurrence({ ...base, occurrences: [base] }, NOW)).toBeNull();
    // Repli sur les dates de l'événement quand l'API ne fournit aucune séance.
    expect(calendarOccurrence({ ...base, occurrences: [] }, NOW)).toBeNull();
  });

  it('masque le bouton si la séance retenue est longue, même si une séance courte suit', () => {
    const long = timed('2026-10-01T08:00:00.000Z', '2026-11-30T17:00:00.000Z');
    const short = timed('2026-12-05T08:00:00.000Z', '2026-12-05T11:00:00.000Z');
    expect(calendarOccurrence({ ...base, occurrences: [long, short] }, NOW)).toBeNull();
  });

  it('garde le bouton pour 14 jours pile, même à cheval sur le changement d’heure', () => {
    // 19 octobre → 1er novembre 2026 inclus = 14 jours calendaires.
    const fortnight = allDay('2026-10-18T22:00:00.000Z', '2026-11-01T22:59:59.000Z');
    expect(calendarOccurrence({ ...base, occurrences: [fortnight] }, NOW)).toBe(fortnight);
    const fifteen = allDay('2026-10-18T22:00:00.000Z', '2026-11-02T22:59:59.000Z');
    expect(calendarOccurrence({ ...base, occurrences: [fifteen] }, NOW)).toBeNull();
    const timed14 = timed('2026-10-20T08:00:00.000Z', '2026-11-03T08:00:00.000Z');
    expect(calendarOccurrence({ ...base, occurrences: [timed14] }, NOW)).toBe(timed14);
  });
});

describe('icsFileName', () => {
  it('simplifie le titre : sans accents ni caractères spéciaux', () => {
    expect(icsFileName('Ciné-débat Alimenterre')).toBe('cine-debat-alimenterre.ics');
    expect(icsFileName('Œuvres d’été : « Fête » 🎉 !')).toBe('oeuvres-d-ete-fete.ics');
  });

  it('tronque à 60 caractères et ne laisse jamais un nom vide', () => {
    const name = icsFileName('a'.repeat(30) + ' ' + 'b'.repeat(60));
    expect(name.length).toBeLessThanOrEqual(64);
    expect(name).toMatch(/^a{30}-b{29}\.ics$/);
    expect(icsFileName('🎉 !!!')).toBe('evenement.ics');
  });
});

describe('downloadIcsFile', () => {
  it('télécharge via un lien blob: sans fetch puis libère l’URL', async () => {
    vi.useFakeTimers();
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const created: Blob[] = [];
    URL.createObjectURL = vi.fn((blob: Blob) => { created.push(blob); return 'blob:test'; });
    URL.revokeObjectURL = vi.fn();
    const clicks: HTMLAnchorElement[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) { clicks.push(this); });

    downloadIcsFile('BEGIN:VCALENDAR\r\n', 'concert.ics');

    expect(clicks[0]?.download).toBe('concert.ics');
    expect(clicks[0]?.getAttribute('href')).toBe('blob:test');
    expect(created[0]?.type).toBe('text/calendar;charset=utf-8');
    expect(document.querySelector('a[download]')).toBeNull();
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    vi.runAllTimers();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:test');
    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
    vi.useRealTimers();
    const text = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.readAsText(created[0]!);
    });
    expect(text).toBe('BEGIN:VCALENDAR\r\n');
  });
});
