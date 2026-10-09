import { describe, expect, it } from 'vitest';
import { calendarDay, formatEventDate, occurrenceStatus } from './eventDates';

const labels = { allDay: 'Toute la journée', until: (date: string) => `Jusqu’au ${date}` };
const now = new Date('2026-10-10T08:00:00.000Z');

describe('Libellés de date des événements', () => {
  it('affiche « Toute la journée » au lieu de 00:00 pour une journée sans heure', () => {
    // Stockage : 00:00 → 23:59:59 heure de Paris, soit 22:00Z la veille en été.
    const label = formatEventDate({ startDate: '2026-10-01T22:00:00.000Z', endDate: '2026-10-02T21:59:59.000Z',
      timezone: 'Europe/Paris', allDay: true }, 'fr', 'short', labels, now);
    expect(label).toBe('ven. 2 oct. • Toute la journée');
    expect(label).not.toContain('00:00');
  });

  it('garde l’heure de début pour un événement horaire', () => {
    expect(formatEventDate({ startDate: '2026-10-18T18:30:00.000Z', endDate: '2026-10-18T21:00:00.000Z',
      timezone: 'Europe/Paris', allDay: false }, 'fr', 'short', labels, now)).toBe('dim. 18 oct. • 20:30');
  });

  it('affiche « Jusqu’au … » pour un événement en cours sur plusieurs jours', () => {
    expect(formatEventDate({ startDate: '2026-10-01T12:00:00.000Z', endDate: '2026-11-10T16:30:00.000Z',
      timezone: 'Europe/Paris', allDay: false }, 'fr', 'long', labels, now)).toBe('Jusqu’au mardi 10 novembre 2026');
  });

  it('affiche la période pour un événement à venir sur plusieurs jours', () => {
    expect(formatEventDate({ startDate: '2026-10-20T08:00:00.000Z', endDate: '2026-10-22T16:00:00.000Z',
      timezone: 'Europe/Paris' }, 'fr', 'short', labels, now)).toBe('mar. 20 oct. - jeu. 22 oct.');
  });

  it('compare les jours dans le fuseau de l’événement, pas celui du navigateur', () => {
    expect(calendarDay(new Date('2026-10-01T22:30:00.000Z'), 'Europe/Paris')).toBe('2026-10-02');
    expect(calendarDay(new Date('2026-10-01T22:30:00.000Z'), 'UTC')).toBe('2026-10-01');
  });
});

describe('Statut d’une séance (calculé sur la fin, heure de Paris)', () => {
  // 9 octobre 2026, 14:00 heure de Paris.
  const afternoon = new Date('2026-10-09T12:00:00.000Z');
  const base = { timezone: 'Europe/Paris' };

  it('« Aujourd’hui » pour une séance « toute la journée » le jour même', () => {
    const today = { ...base, startDate: '2026-10-08T22:00:00.000Z', endDate: '2026-10-09T21:59:59.000Z', allDay: true };
    expect(occurrenceStatus(today, afternoon)).toBe('today');
    expect(occurrenceStatus(today, new Date('2026-10-09T21:30:00.000Z'))).toBe('today');
    expect(occurrenceStatus(today, new Date('2026-10-09T22:00:01.000Z'))).toBe('past');
  });

  it('« Aujourd’hui » pour une séance horaire du jour en cours, « Passée » une fois finie', () => {
    const market = { ...base, startDate: '2026-10-09T06:00:00.000Z', endDate: '2026-10-09T11:00:00.000Z' };
    expect(occurrenceStatus(market, new Date('2026-10-09T08:00:00.000Z'))).toBe('today');
    expect(occurrenceStatus(market, afternoon)).toBe('past');
  });

  it('« En cours » pour une séance de plusieurs jours commencée', () => {
    const exhibition = { ...base, startDate: '2026-09-30T22:00:00.000Z', endDate: '2026-11-10T22:59:59.000Z', allDay: true };
    expect(occurrenceStatus(exhibition, afternoon)).toBe('ongoing');
  });

  it('« À venir » pour une séance pas encore commencée, y compris plus tard dans la journée', () => {
    expect(occurrenceStatus({ ...base, startDate: '2026-10-16T06:00:00.000Z', endDate: null }, afternoon)).toBe('upcoming');
    expect(occurrenceStatus({ ...base, startDate: '2026-10-09T18:00:00.000Z', endDate: null }, afternoon)).toBe('upcoming');
  });

  it('sans heure de fin : la séance du jour reste « Aujourd’hui » jusqu’à minuit, puis devient « Passée »', () => {
    const morning = { ...base, startDate: '2026-10-09T07:00:00.000Z', endDate: null };
    expect(occurrenceStatus(morning, afternoon)).toBe('today');
    expect(occurrenceStatus(morning, new Date('2026-10-09T22:30:00.000Z'))).toBe('past');
    expect(occurrenceStatus({ ...base, startDate: '2026-10-02T07:00:00.000Z' }, afternoon)).toBe('past');
  });
});
