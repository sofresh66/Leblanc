import { describe, expect, it, vi } from 'vitest';
import { normalizeDatatourismeEvent } from '../lib/datatourisme-normalizer.mjs';

const fixture = () => ({
  uuid: '00443d6a-0355-3d1e-8f68-699c70ee5b91',
  uri: 'https://data.datatourisme.fr/15/test',
  label: { '@fr': 'Atelier couleurs', '@en': 'Colour workshop' },
  type: ['CulturalEvent', 'Event'],
  hasDescription: [
    { description: { '@fr': 'Description française', '@en': 'English description' } },
  ],
  isLocatedAt: [
    {
      geo: { latitude: 46.6333, longitude: 1.0833 },
      address: [
        { streetAddress: ['1 rue Test'], postalCode: '36300', addressLocality: 'Le Blanc' },
      ],
    },
  ],
  takesPlaceAt: [
    { startDate: '2026-10-04', startTime: '10:00', endDate: '2026-10-04', endTime: '12:00' },
  ],
  offers: [{ priceSpecification: [{ price: 15, minPrice: [15], priceCurrency: 'EUR' }] }],
  hasMainRepresentation: [{ hasRelatedResource: [{ locator: ['https://example.com/image.jpg'] }] }],
  hasContact: [{ homepage: ['https://example.com/event'] }],
});

describe('site officiel des événements DATAtourisme', () => {
  it('utilise la page web du contact et jamais l’URI technique data.datatourisme.fr', () => {
    expect(normalizeDatatourismeEvent(fixture()).event.publicUrl).toBe('https://example.com/event');
    const withoutHomepage = normalizeDatatourismeEvent({ ...fixture(), hasContact: [] });
    expect(withoutHomepage.event.publicUrl).toBeNull();
    expect(withoutHomepage.sourceUrl).toBe('https://data.datatourisme.fr/15/test');
    const technicalOnly = normalizeDatatourismeEvent({ ...fixture(), hasContact: [{ homepage: ['https://data.datatourisme.fr/15/x'] }] });
    expect(technicalOnly.event.publicUrl).toBeNull();
  });
});

describe('normaliseur DATAtourisme', () => {
  it.each([{}, 'invalid', [null], [{ priceSpecification: [null] }],
    [{ priceSpecification: [{ price: -1 }] }],
    [{ priceSpecification: [{ price: 0 }, { price: 'invalid' }] }],
  ].map((offers) => ({ offers })))('signale une offre mal formée sans annoncer de gratuité : $offers', ({ offers }) => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const result = normalizeDatatourismeEvent({ ...fixture(), offers });
      expect(result.event.isFree).toBeNull();
      expect(result.event.priceMin).toBeNull();
      expect(warning).toHaveBeenCalledOnce();
    } finally { warning.mockRestore(); }
  });

  it('conserve le minimum positif quand gratuité et tarifs payants coexistent', () => {
    const raw = fixture();
    raw.offers = [{ priceSpecification: [{ price: 0 }, { price: 50 }, { minPrice: [25] }] }];
    const result = normalizeDatatourismeEvent(raw);
    expect(result.event.isFree).toBe(false);
    expect(result.event.priceMin).toBe(25);
  });
  it('convertit les champs et heures complètes', () => {
    const result = normalizeDatatourismeEvent(fixture());
    expect(result.ok).toBe(true);
    expect(result.event.category).toBe('culture');
    expect(result.event.titleI18n.en).toBe('Colour workshop');
    expect(result.occurrences[0].startsAt).toBe('2026-10-04T08:00:00.000Z');
    expect(result.occurrences[0].endsAt).toBe('2026-10-04T10:00:00.000Z');
    expect(result.event.isFree).toBe(false);
    expect(result.event.priceMin).toBe(15);
    expect(result.event.imageUrl).toBe('https://example.com/image.jpg');
  });

  it('accepte les dates seules et marque toute la journée', () => {
    const raw = fixture();
    raw.takesPlaceAt = [{ startDate: '2026-12-01', endDate: '2026-12-01' }];
    const result = normalizeDatatourismeEvent(raw);
    expect(result.occurrences[0].allDay).toBe(true);
    expect(result.occurrences[0].startsAt).toBe('2026-11-30T23:00:00.000Z');
    expect(result.occurrences[0].endsAt).toBe('2026-12-01T22:59:59.000Z');
  });

  it('accepte un objet sans image et sans prix', () => {
    const raw = fixture();
    delete raw.hasMainRepresentation;
    delete raw.offers;
    const result = normalizeDatatourismeEvent(raw);
    expect(result.event.imageUrl).toBeNull();
    expect(result.event.isFree).toBeNull();
    expect(result.event.priceMin).toBeNull();
  });

  it('traite offers null comme tarif non précisé', () => {
    const raw = fixture();
    raw.offers = null;
    const result = normalizeDatatourismeEvent(raw);
    expect(result.event.isFree).toBeNull();
    expect(result.event.priceMin).toBeNull();
  });

  it('traite offers vide comme tarif non précisé', () => {
    const raw = fixture();
    raw.offers = [];
    const result = normalizeDatatourismeEvent(raw);
    expect(result.event.isFree).toBeNull();
    expect(result.event.priceMin).toBeNull();
  });

  it('ne marque pas gratuit un tarif mixte', () => {
    const raw = fixture();
    raw.offers[0].priceSpecification.push({ hasEligiblePolicy: [{ key: 'Free' }] });
    const result = normalizeDatatourismeEvent(raw);
    expect(result.event.isFree).toBe(false);
    expect(result.event.priceMin).toBe(15);
  });

  it('reconnaît un événement seulement gratuit', () => {
    const raw = fixture();
    raw.offers = [{ priceSpecification: [{ hasEligiblePolicy: [{ key: 'Free' }] }] }];
    const result = normalizeDatatourismeEvent(raw);
    expect(result.event.isFree).toBe(true);
    expect(result.event.priceMin).toBeNull();
  });

  it('normalise un prix explicite de zéro vers null', () => {
    const raw = fixture();
    raw.offers = [{ priceSpecification: [{ price: 0 }] }];
    const result = normalizeDatatourismeEvent(raw);
    expect(result.event.isFree).toBe(true);
    expect(result.event.priceMin).toBeNull();
  });

  it('signale une spécification absente et conserve un tarif non précisé', () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const raw = fixture();
      raw.offers = [{ priceSpecification: [] }];
      const result = normalizeDatatourismeEvent(raw);
      expect(result.event.isFree).toBeNull();
      expect(result.event.priceMin).toBeNull();
      expect(JSON.parse(warning.mock.calls[0][0]).code).toBe('malformed_price_specification');
    } finally {
      warning.mockRestore();
    }
  });

  it('signale un prix mal formé', () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const raw = fixture();
      raw.offers = [{ priceSpecification: [{ price: 'quinze' }] }];
      const result = normalizeDatatourismeEvent(raw);
      expect(result.event.isFree).toBeNull();
      expect(result.event.priceMin).toBeNull();
      expect(warning).toHaveBeenCalledOnce();
    } finally {
      warning.mockRestore();
    }
  });

  it('ne présente pas un tarif réduit positif comme gratuit', () => {
    const raw = fixture();
    raw.offers = [
      { priceSpecification: [{ price: 15, hasEligiblePolicy: [{ key: 'ChildRate' }] }] },
    ];
    const result = normalizeDatatourismeEvent(raw);
    expect(result.event.isFree).toBe(false);
    expect(result.event.priceMin).toBe(15);
  });

  it('rejette un titre français absent', () => {
    const raw = fixture();
    raw.label = { '@en': 'Only English' };
    expect(normalizeDatatourismeEvent(raw).ok).toBe(false);
  });

  it('rejette les coordonnées absentes et les dates absentes', () => {
    const raw = fixture();
    raw.isLocatedAt = [];
    expect(normalizeDatatourismeEvent(raw).reason).toContain('coordonnées');
    raw.isLocatedAt = fixture().isLocatedAt;
    raw.takesPlaceAt = [];
    expect(normalizeDatatourismeEvent(raw).reason).toContain('date');
  });

  it('conserve une empreinte stable et un extrait compact', () => {
    const a = normalizeDatatourismeEvent(fixture());
    const b = normalizeDatatourismeEvent(fixture());
    expect(a.occurrences[0].fingerprint).toBe(b.occurrences[0].fingerprint);
    expect(Buffer.byteLength(JSON.stringify(a.rawExcerpt))).toBeLessThanOrEqual(5_000);
    expect(a.rawExcerpt).not.toHaveProperty('hasDescription');
  });
});
