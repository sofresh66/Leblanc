import { describe, expect, it } from 'vitest';
import { RawPlaceSchema } from '@leblanc/shared';
import { normalizeOsmPlace } from '../lib/overpass-normalizer.mjs';

const node = {
  type: 'node', id: 474770802, lat: 46.7206782, lon: 1.1734362,
  tags: {
    amenity: 'restaurant', name: 'Restaurant de la Maison du Parc',
    'name:en': 'Park House Restaurant', cuisine: 'regional;french',
    description: 'Réservation uniquement par téléphone.',
    opening_hours: 'Feb 07-Jul 03 10:00-17:30; Dec 25 off',
    phone: '+33 2 54 28 53 02', website: 'https://example.test',
    email: 'reservation@example.test', wheelchair: 'yes',
    'addr:housenumber': '1', 'addr:street': 'Rue du Parc',
    'addr:postcode': '36300', 'addr:city': 'Le Blanc',
  },
};

describe('normalisation OSM', () => {
  it('convertit un restaurant nommé sans interpréter ses horaires complexes', () => {
    const result = normalizeOsmPlace(node);
    expect(result.ok).toBe(true);
    expect(result.externalId).toBe('osm:node/474770802');
    expect(result.sourceUrl).toBe('https://www.openstreetmap.org/node/474770802');
    expect(result.place).toMatchObject({
      type: 'restaurant', title_i18n: { fr: node.tags.name, en: 'Park House Restaurant' },
      address: '1 Rue du Parc', postalCode: '36300', city: 'Le Blanc',
      cuisines: ['TraditionalCuisine', 'french'],
      openingHoursStatus: 'unknown', sourceLanguage: 'fr',
    });
    expect(result.openingHours).toEqual([]);
    expect(result.openingHoursRaw).toBe(node.tags.opening_hours);
    expect(result.accessible).toBe(true);
    expect(RawPlaceSchema.safeParse({ id: 'a1000000-0000-4000-8000-000000000001', ...result.place }).success).toBe(true);
  });

  it('utilise center pour un way et classe pub comme bar', () => {
    const result = normalizeOsmPlace({ type: 'way', id: 77, center: { lat: 46.6333, lon: 1.0833 }, tags: { amenity: 'pub', name: 'Le Pub' } });
    expect(result).toMatchObject({ ok: true, externalId: 'osm:way/77', place: { type: 'bar', latitude: 46.6333 } });
  });

  it('rejette les faux positifs, les lieux sans nom et les coordonnées absentes', () => {
    expect(normalizeOsmPlace({ ...node, tags: { ...node.tags, amenity: 'public_bookcase' } })).toMatchObject({ ok: false, reason: 'unsupported_amenity' });
    expect(normalizeOsmPlace({ ...node, tags: { ...node.tags, name: '' } })).toMatchObject({ ok: false, reason: 'missing_name' });
    expect(normalizeOsmPlace({ ...node, lat: null })).toMatchObject({ ok: false, reason: 'invalid_or_outside_coordinates' });
    expect(normalizeOsmPlace({ ...node, lat: 49 })).toMatchObject({ ok: false, reason: 'invalid_or_outside_coordinates' });
  });

  it('n’invente pas de contacts ni de prix et conserve les valeurs connues', () => {
    const result = normalizeOsmPlace({ ...node, tags: { amenity: 'cafe', name: 'Le Café', website: 'javascript:bad', email: 'invalid', takeaway: 'no' } });
    expect(result).toMatchObject({ ok: true, place: { type: 'cafe', website: null, email: null, priceRangeMin: null, takeaway: false } });
    expect(result.openingHoursRaw).toBeNull();
  });
});
