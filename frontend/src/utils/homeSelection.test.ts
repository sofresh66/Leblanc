import { describe, expect, it } from 'vitest';
import type { Event, EventCategory } from '@leblanc/shared';
import {
  dailySeed,
  isLongRunning,
  isMarket,
  normalizeTitle,
  selectHomeEvents,
  selectWeekendEvents,
  upcomingWeekend,
} from './homeSelection';

const NOW = new Date('2026-10-13T10:00:00Z'); // mardi
let counter = 0;

function event(title: string, category: EventCategory, start: string, end: string | null = null, extra: Partial<Event> = {}): Event {
  counter += 1;
  const id = `00000000-0000-4000-8000-${String(counter).padStart(12, '0')}`;
  return {
    id, title, title_i18n: { fr: title }, description_i18n: { fr: '' }, category,
    startDate: start, endDate: end, timezone: 'Europe/Paris', allDay: false,
    venueName: null, address: null, postalCode: null, city: 'Le Blanc', latitude: 46.63, longitude: 1.06,
    imageUrl: null, isFree: null, priceMin: null, currency: 'EUR', publicUrl: null, source: 'datatourisme',
    description: '', contentLanguage: 'fr', isFallback: false, distance: 1000,
    ...extra,
  } as Event;
}

const market = (city: string, distance = 1000) =>
  event('Marché hebdomadaire', 'autre', '2026-01-01T07:00:00Z', '2026-12-31T12:00:00Z', { city, distance, title_i18n: { fr: `Marché hebdomadaire` } });
const expo = (title: string) => event(title, 'culture', '2026-09-01T08:00:00Z', '2026-11-30T17:00:00Z');

function pool(): Event[] {
  // Ordre de l'API : les événements en cours d'abord, puis les ponctuels par date.
  return [
    market('Bélâbre', 12000), market('Martizay', 15000), expo('Moins de voiture'), expo('Exposition peinture'),
    event('Foire mensuelle', 'autre', '2026-01-01T07:00:00Z', '2026-12-31T12:00:00Z', { distance: 8000 }),
    market('Le Blanc', 300),
    event('L’IA au service des collectivités', 'autre', '2026-10-14T07:00:00Z', '2026-10-14T10:00:00Z'),
    event('Scène ouverte', 'culture', '2026-10-14T18:00:00Z', '2026-10-14T20:00:00Z'),
    event('Don du sang', 'association', '2026-10-15T13:00:00Z', '2026-10-15T17:00:00Z'),
    event('Ciné-débat', 'culture', '2026-10-15T18:00:00Z', '2026-10-15T21:00:00Z'),
    event('Festival Playmo', 'fete', '2026-10-17T08:00:00Z', '2026-10-18T17:00:00Z'),
    event('Atelier de réparation...', 'autre', '2026-10-17T12:00:00Z', '2026-10-17T15:00:00Z'),
    event('Atelier de réparation.', 'autre', '2026-10-17T12:00:00Z', '2026-10-17T15:00:00Z'),
    event('Octobre Rose', 'sport', '2026-10-17T14:00:00Z', '2026-10-17T21:00:00Z'),
    event('Bal Folk', 'culture', '2026-10-17T18:30:00Z', '2026-10-17T21:00:00Z'),
    event('Concert lointain', 'culture', '2026-11-20T18:00:00Z', '2026-11-20T21:00:00Z'),
  ];
}

const ids = (events: Event[]) => events.map((e) => e.id);

describe('normalizeTitle et classement', () => {
  it('absorbe casse, accents, ponctuation et espaces', () => {
    expect(normalizeTitle(event('Atelier de réparation...', 'autre', '2026-10-17T12:00:00Z')))
      .toBe(normalizeTitle(event('  atelier DE reparation.', 'autre', '2026-10-17T12:00:00Z')));
    expect(normalizeTitle(event('Hors Saison Musicale', 'culture', '2026-10-18T12:00:00Z')))
      .not.toBe(normalizeTitle(event('Hors saison musicale : L’heure exquise', 'culture', '2026-10-18T12:00:00Z')));
  });

  it('reconnaît les marchés et les événements au long cours', () => {
    expect(isMarket(market('Le Blanc'))).toBe(true);
    expect(isMarket(event('Foire mensuelle', 'autre', '2026-01-01T07:00:00Z'))).toBe(true);
    expect(isMarket(event('Marche nordique', 'sport', '2026-10-17T08:00:00Z'))).toBe(false);
    expect(isLongRunning(market('Le Blanc'))).toBe(true);
    expect(isLongRunning(event('Week-end', 'fete', '2026-10-17T08:00:00Z', '2026-10-18T17:00:00Z'))).toBe(false);
    expect(isLongRunning(event('Sans fin', 'fete', '2026-10-17T08:00:00Z', null))).toBe(false);
  });
});

describe('selectHomeEvents', () => {
  it('Top : 3 cartes de catégories différentes, un seul événement au long cours, et c’est un marché', () => {
    const { top } = selectHomeEvents(pool(), NOW, 'fr');
    expect(top).toHaveLength(3);
    expect(new Set(top.map((e) => e.category)).size).toBe(3);
    expect(top.filter(isLongRunning)).toHaveLength(1);
    expect(isMarket(top.find(isLongRunning)!)).toBe(true); // un marché passe avant les expositions
    for (const e of top.filter((e) => !isLongRunning(e))) {
      expect(Date.parse(e.startDate)).toBeLessThanOrEqual(NOW.getTime() + 14 * 86_400_000);
    }
  });

  it('les marchés de la zone tournent : au moins 3 différents sur 10 jours, un seul par jour', () => {
    const events = pool();
    const markets = new Set<string>();
    for (let day = 0; day < 10; day++) {
      const { top } = selectHomeEvents(events, new Date(Date.UTC(2026, 9, 14 + day, 10)), 'fr');
      const dayMarkets = top.filter(isMarket);
      expect(dayMarkets).toHaveLength(1);
      markets.add(dayMarkets[0]!.id);
    }
    expect(markets.size).toBeGreaterThanOrEqual(3);
  });

  it('au plus un marché par section, même ponctuel (marché de Saint-Savin)', () => {
    const events = [
      market('Le Blanc', 300),
      event('Marché de Saint-Savin', 'fete', '2026-10-15T22:00:00Z', '2026-10-16T21:59:59Z'),
      event('Scène ouverte', 'culture', '2026-10-14T18:00:00Z'),
      event('Octobre Rose', 'sport', '2026-10-17T14:00:00Z'),
    ];
    for (let day = 0; day < 7; day++) {
      const { top } = selectHomeEvents(events, new Date(Date.UTC(2026, 9, 13 + day, 10)), 'fr');
      expect(top).toHaveLength(3);
      expect(top.filter(isMarket)).toHaveLength(1);
    }
  });

  it('ne garde jamais deux titres quasi identiques', () => {
    const duplicates = [
      event('Atelier de réparation...', 'autre', '2026-10-17T12:00:00Z', '2026-10-17T15:00:00Z'),
      event('atelier de réparation.', 'culture', '2026-10-17T12:00:00Z', '2026-10-17T15:00:00Z'),
      event('ATELIER  DE RÉPARATION', 'sport', '2026-10-17T12:00:00Z', '2026-10-17T15:00:00Z'),
      event('Bal Folk', 'fete', '2026-10-17T18:30:00Z', '2026-10-17T21:00:00Z'),
    ];
    const { top, recent } = selectHomeEvents(duplicates, NOW, 'fr');
    const titles = [...top, ...recent].map(normalizeTitle);
    expect(new Set(titles).size).toBe(titles.length);
    expect(titles.filter((t) => t === 'atelierdereparation')).toHaveLength(1);
  });

  it('même ordre toute la journée, autre ordre un autre jour ou dans une autre langue', () => {
    const events = pool();
    const morning = selectHomeEvents(events, new Date('2026-10-13T06:00:00Z'), 'fr').top;
    const evening = selectHomeEvents(events, new Date('2026-10-13T23:30:00Z'), 'fr').top;
    expect(ids(evening)).toEqual(ids(morning));
    // Sur une semaine, le Top change au moins une fois d'un jour à l'autre.
    const days = Array.from({ length: 7 }, (_, d) => ids(selectHomeEvents(events, new Date(Date.UTC(2026, 9, 13 + d, 10)), 'fr').top).join());
    expect(new Set(days).size).toBeGreaterThan(1);
    expect(dailySeed(NOW, 'fr')).not.toBe(dailySeed(NOW, 'en'));
  });

  it('Derniers ajouts ne répète ni un identifiant ni un titre du Top', () => {
    const { top, recent } = selectHomeEvents(pool(), NOW, 'fr');
    expect(recent).toHaveLength(3);
    expect(recent.filter((e) => ids(top).includes(e.id))).toHaveLength(0);
    const topTitles = new Set(top.map(normalizeTitle));
    expect(recent.filter((e) => topTitles.has(normalizeTitle(e)))).toHaveLength(0);
    expect(recent.filter(isLongRunning).length).toBeLessThanOrEqual(1);
  });

  it('repli : moins de 3 ponctuels → complète avec des événements au long cours', () => {
    const events = [market('Le Blanc', 300), expo('Exposition A'), expo('Exposition B'), event('Bal Folk', 'culture', '2026-10-17T18:30:00Z')];
    const { top } = selectHomeEvents(events, NOW, 'fr');
    expect(top).toHaveLength(3);
    expect(top.filter(isLongRunning).length).toBe(2);
    expect(top.map((e) => e.title)).toContain('Bal Folk');
  });

  it('relâche le plafond par catégorie plutôt que de laisser la section incomplète', () => {
    const events = ['A', 'B', 'C', 'D'].map((t, i) => event(`Concert ${t}`, 'culture', `2026-10-1${4 + i}T18:00:00Z`));
    expect(selectHomeEvents(events, NOW, 'fr').top).toHaveLength(3);
  });

  it('aucune donnée : sections vides, sans erreur', () => {
    expect(selectHomeEvents([], NOW, 'fr')).toEqual({ top: [], recent: [] });
  });
});

describe('Ce week-end', () => {
  it('upcomingWeekend : samedi et dimanche suivants, ou le week-end en cours (jours de Paris)', () => {
    expect(upcomingWeekend(new Date('2026-10-13T10:00:00Z'))).toEqual({ from: '2026-10-17', to: '2026-10-18' }); // mardi
    expect(upcomingWeekend(new Date('2026-10-16T21:59:00Z'))).toEqual({ from: '2026-10-17', to: '2026-10-18' }); // vendredi 23 h 59 à Paris
    expect(upcomingWeekend(new Date('2026-10-16T22:30:00Z'))).toEqual({ from: '2026-10-17', to: '2026-10-18' }); // samedi 0 h 30 à Paris
    expect(upcomingWeekend(new Date('2026-10-18T15:00:00Z'))).toEqual({ from: '2026-10-18', to: '2026-10-18' }); // dimanche
    expect(upcomingWeekend(new Date('2026-10-18T22:30:00Z'))).toEqual({ from: '2026-10-24', to: '2026-10-25' }); // lundi 0 h 30 à Paris
    expect(upcomingWeekend(new Date('2026-12-28T10:00:00Z'))).toEqual({ from: '2027-01-02', to: '2027-01-03' }); // passage d'année
  });

  it('mêmes règles de diversité et évite les cartes du Top quand c’est possible', () => {
    const weekendPool = [
      market('Le Blanc', 300), market('Martizay', 15000),
      event('Festival Playmo', 'fete', '2026-10-17T08:00:00Z', '2026-10-18T17:00:00Z'),
      event('Octobre Rose', 'sport', '2026-10-17T14:00:00Z'),
      event('Bal Folk', 'culture', '2026-10-17T18:30:00Z'),
      event('Café théâtre', 'culture', '2026-10-17T19:00:00Z'),
    ];
    const top = [weekendPool[2]!];
    const weekend = selectWeekendEvents(weekendPool, NOW, 'fr', top);
    expect(weekend).toHaveLength(3);
    expect(weekend.filter(isLongRunning)).toHaveLength(1);
    expect(new Set(weekend.map((e) => e.category)).size).toBe(3);
    expect(ids(weekend)).not.toContain(weekendPool[2]!.id);
  });

  it('week-end sans résultat : aucune carte (la section sera masquée)', () => {
    expect(selectWeekendEvents([], NOW, 'fr')).toEqual([]);
  });

  it('reprend une carte du Top s’il n’y a rien d’autre', () => {
    const only = [event('Festival Playmo', 'fete', '2026-10-17T08:00:00Z')];
    expect(ids(selectWeekendEvents(only, NOW, 'fr', only))).toEqual(ids(only));
  });
});
