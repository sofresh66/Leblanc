import { describe, it, expect } from 'vitest';
import { generateIcsContent } from './ics';
import type { Event } from '@leblanc/shared';

describe('ics utility', () => {
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

  it('génère un contenu iCalendar valide avec toutes les balises nécessaires', () => {
    const ics = generateIcsContent(mockEvent);

    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics).toContain('VERSION:2.0');
    expect(ics).toContain('PRODID:-//Le Blanc et Moi//FR');
    expect(ics).toContain('BEGIN:VEVENT');
    expect(ics).toContain(`UID:${mockEvent.id}@leblanc-et-moi.fr`);
    expect(ics).toContain('SUMMARY:Concert au bord de l’eau');
    expect(ics).toContain('DESCRIPTION:Un concert acoustique exceptionnel.\\nEntrée libre.');
    expect(ics).toContain('LOCATION:Guinguette des Rives\\, Quai de la Creuse\\, 36300 Le Blanc');
    expect(ics).toContain('URL:https://www.leblanc-tourisme.com');
    expect(ics).toContain('END:VEVENT');
    expect(ics).toContain('END:VCALENDAR');
  });

  it('formate correctement les dates de début et de fin en format UTC ICS', () => {
    const ics = generateIcsContent(mockEvent);

    // 2026-10-18T20:30:00+02:00 correspond à 18:30:00Z en UTC
    expect(ics).toContain('DTSTART:20261018T183000Z');
    // 2026-10-18T23:00:00+02:00 correspond à 21:00:00Z en UTC
    expect(ics).toContain('DTEND:20261018T210000Z');
  });

  it('calcule une date de fin par défaut (+2h) si endDate est null', () => {
    const eventWithoutEnd: Event = {
      ...mockEvent,
      endDate: null,
    };

    const ics = generateIcsContent(eventWithoutEnd);
    // DTSTART: 18:30:00Z -> DTEND: 20:30:00Z
    expect(ics).toContain('DTSTART:20261018T183000Z');
    expect(ics).toContain('DTEND:20261018T203000Z');
  });

  it('omet le champ LOCATION quand tous les champs d’adresse sont null', () => {
    const eventWithoutLocation: Event = {
      ...mockEvent,
      venueName: null,
      address: null,
      postalCode: null,
      city: null,
    };

    const ics = generateIcsContent(eventWithoutLocation);
    expect(ics).not.toContain('LOCATION:');
  });

  it('réduit le champ LOCATION au lieu quand l’adresse et le code postal sont null', () => {
    const eventWithVenueOnly: Event = {
      ...mockEvent,
      address: null,
      postalCode: null,
      city: null,
    };

    const ics = generateIcsContent(eventWithVenueOnly);
    expect(ics).toContain('LOCATION:Guinguette des Rives\r\n');
    expect(ics).not.toContain('LOCATION:Guinguette des Rives,');
  });

  it('ignore le lieu null en conservant l’adresse et la ville', () => {
    const eventWithoutVenue: Event = {
      ...mockEvent,
      venueName: null,
    };

    const ics = generateIcsContent(eventWithoutVenue);
    expect(ics).toContain('LOCATION:Quai de la Creuse\\, 36300 Le Blanc');
  });

  it('écrit une journée entière en dates seules, fin exclusive au lendemain', () => {
    // Stockage source : 00:00 → 23:59:59 heure de Paris (22:00Z la veille en été).
    const allDay: Event = { ...mockEvent, allDay: true,
      startDate: '2026-10-01T22:00:00.000Z', endDate: '2026-10-02T21:59:59.000Z' };
    const ics = generateIcsContent(allDay);
    expect(ics).toContain('DTSTART;VALUE=DATE:20261002\r\n');
    expect(ics).toContain('DTEND;VALUE=DATE:20261003\r\n');
    expect(ics).not.toMatch(/DTSTART:\d/);
    const range = generateIcsContent({ ...allDay, endDate: '2026-11-10T22:59:59.000Z' });
    expect(range).toContain('DTEND;VALUE=DATE:20261111');
  });

  it('échappe virgules, points-virgules et antislashs', () => {
    const ics = generateIcsContent({ ...mockEvent, title: 'Jazz, blues; et \\ swing' });
    expect(ics).toContain('SUMMARY:Jazz\\, blues\\; et \\\\ swing');
  });

  it('replie les lignes à 75 octets UTF-8 sans couper les caractères accentués', () => {
    const long = 'Événement très attendu à l’Église Saint-Génitour '.repeat(6);
    const ics = generateIcsContent({ ...mockEvent, description: long });
    const encoder = new TextEncoder();
    for (const line of ics.split('\r\n')) expect(encoder.encode(line).length).toBeLessThanOrEqual(75);
    const unfolded = ics.replace(/\r\n /g, '');
    expect(unfolded).toContain(`DESCRIPTION:${long.trim()}`);
  });

  it('n’écrit pas l’URI technique DATAtourisme comme URL', () => {
    const ics = generateIcsContent({ ...mockEvent, publicUrl: 'https://data.datatourisme.fr/15/abc' });
    expect(ics).not.toContain('URL:');
  });
});
