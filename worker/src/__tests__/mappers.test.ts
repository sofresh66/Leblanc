import { describe, expect, it } from 'vitest';
import {
  mapDbRowToEvent,
  mapDbRowToEventDetail,
  type EventDbRow,
  type OccurrenceDbRow,
} from '../mappers/event.js';

describe('Mappers de données DB (worker/src/mappers/event.ts)', () => {
  const sampleRow: EventDbRow = {
    id: 'e1000000-0000-4000-8000-000000000001',
    category: 'fete',
    source: 'openagenda',
    title_i18n: {
      fr: 'Grand Marché d’Automne',
      en: 'Autumn Market',
    },
    description_i18n: {
      fr: 'Description en français',
      en: 'Description in English',
    },
    venue_name: 'Place du Marché',
    address: '1 rue Principale',
    postal_code: '36300',
    city: 'Le Blanc',
    latitude: 46.6335,
    longitude: 1.0628,
    public_url: 'https://example.com/event',
    image_url: 'https://example.com/image.jpg',
    is_free: true,
    price_min: null,
    currency: 'EUR',
    starts_at: '2026-10-03T08:30:00.000Z',
    ends_at: '2026-10-03T13:00:00.000Z',
    timezone: 'Europe/Paris',
    distance: 120,
  };

  it('préserve un tarif inconnu dans la liste et la fiche', () => {
    const row = { ...sampleRow, is_free: null, price_min: null };
    expect(mapDbRowToEvent(row, 'fr').isFree).toBeNull();
    expect(mapDbRowToEventDetail(row, [], 'fr').isFree).toBeNull();
  });

  it('mappe une ligne DB complète vers un Event avec langue directe', () => {
    const eventEn = mapDbRowToEvent(sampleRow, 'en');

    expect(eventEn.id).toBe(sampleRow.id);
    expect(eventEn.title).toBe('Autumn Market');
    expect(eventEn.description).toBe('Description in English');
    expect(eventEn.contentLanguage).toBe('en');
    expect(eventEn.isFallback).toBe(false);
    expect(eventEn.distance).toBe(120);
    expect(eventEn.isFree).toBe(true);
    expect(eventEn.source).toBe('openagenda');
  });

  it('gère le repli de langue (fallback) vers le français si la langue demandée est absente', () => {
    const eventDe = mapDbRowToEvent(sampleRow, 'de');

    expect(eventDe.title).toBe('Grand Marché d’Automne');
    expect(eventDe.description).toBe('Description en français');
    expect(eventDe.contentLanguage).toBe('fr');
    expect(eventDe.isFallback).toBe(true);
  });

  it('gère les champs nullables (CB1 : venueName, address, postalCode, city null)', () => {
    const nullableRow: EventDbRow = {
      ...sampleRow,
      venue_name: null,
      address: null,
      postal_code: null,
      city: null,
      public_url: null,
      image_url: null,
      price_min: null,
      ends_at: null,
    };

    const event = mapDbRowToEvent(nullableRow, 'fr');
    expect(event.venueName).toBeNull();
    expect(event.address).toBeNull();
    expect(event.postalCode).toBeNull();
    expect(event.city).toBeNull();
    expect(event.publicUrl).toBeNull();
    expect(event.imageUrl).toBeNull();
    expect(event.priceMin).toBeNull();
    expect(event.endDate).toBeNull();
  });

  it('conserve les langues indépendantes dans la liste et la fiche API', () => {
    const row = { ...sampleRow, title_i18n: { fr: 'Titre FR' } };
    for (const event of [mapDbRowToEvent(row, 'en'), mapDbRowToEventDetail(row, [], 'en')]) {
      expect(event).toMatchObject({
        title: 'Titre FR', description: 'Description in English',
        contentLanguage: 'fr', descriptionLanguage: 'en', isFallback: false,
      });
    }
  });

  it('convertit les chaînes numériques issues de PostgreSQL (types NUMERIC et DOUBLE)', () => {
    const stringNumbersRow: EventDbRow = {
      ...sampleRow,
      latitude: '46.6335',
      longitude: '1.0628',
      price_min: '15.50',
      distance: '345.8',
    };

    const event = mapDbRowToEvent(stringNumbersRow, 'fr');
    expect(event.latitude).toBe(46.6335);
    expect(event.longitude).toBe(1.0628);
    expect(event.priceMin).toBe(15.5);
    expect(event.distance).toBe(346); // Arrondi à l'entier le plus proche
  });

  it('mappe vers un EventDetail avec liste d’occurrences', () => {
    const occurrences: OccurrenceDbRow[] = [
      {
        id: 'e2000000-0000-4000-8000-000000000001',
        starts_at: '2026-10-03T08:30:00.000Z',
        ends_at: '2026-10-03T13:00:00.000Z',
        timezone: 'Europe/Paris',
      },
      {
        id: 'e2000000-0000-4000-8000-000000000002',
        starts_at: '2026-10-10T08:30:00.000Z',
        ends_at: '2026-10-10T13:00:00.000Z',
        timezone: 'Europe/Paris',
      },
    ];

    const detail = mapDbRowToEventDetail(sampleRow, occurrences, 'fr');
    expect(detail.occurrences).toHaveLength(2);
    expect(detail.occurrences[0]?.id).toBe('e2000000-0000-4000-8000-000000000001');
    expect(detail.occurrences[1]?.startDate).toBe('2026-10-10T08:30:00.000Z');
  });
});
