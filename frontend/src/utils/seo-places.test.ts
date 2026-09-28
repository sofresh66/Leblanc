import { describe, expect, it } from 'vitest';
import { placeFixture } from '../components/places/__tests__/fixture';
import { getRestaurantJsonLd } from './seo-places';

describe('getRestaurantJsonLd', () => {
  it('décrit un restaurant avec les données réellement fournies', () => {
    const schema = getRestaurantJsonLd({
      ...placeFixture,
      phone: '+33 2 54 00 00 00',
      website: 'https://example.test',
      takeaway: true,
      openingHours: [{
        id: 'b1000000-0000-4000-8000-000000000001', placeId: placeFixture.id,
        dayOfWeek: [1, 5], opens: '12:00:00', closes: '14:00:00',
        validFrom: null, validThrough: null, weekOfMonth: null,
      }],
    });
    expect(schema).toMatchObject({
      '@type': 'Restaurant', name: 'La Table',
      address: { '@type': 'PostalAddress', streetAddress: '1 rue du Centre', postalCode: '36300', addressLocality: 'Le Blanc' },
      geo: { '@type': 'GeoCoordinates', latitude: 46.6333, longitude: 1.0833 },
      priceRange: '15–30 EUR', takeaway: true,
      openingHoursSpecification: [{ dayOfWeek: ['https://schema.org/Monday', 'https://schema.org/Friday'] }],
    });
  });

  it('omet les données absentes et ne généralise pas une règle de semaine spécifique', () => {
    const schema = getRestaurantJsonLd({
      ...placeFixture, type: 'bar', description: '', address: null, city: null,
      postalCode: null, latitude: 0, longitude: 0, priceRangeMin: null,
      priceRangeMax: null, cuisines: [], openingHours: [{
        id: 'b1000000-0000-4000-8000-000000000001', placeId: placeFixture.id,
        dayOfWeek: [1], opens: '12:00:00', closes: '14:00:00',
        validFrom: null, validThrough: null, weekOfMonth: 1,
      }],
    });
    expect(schema['@type']).toBe('BarOrPub');
    for (const key of ['description', 'address', 'geo', 'telephone', 'url', 'image', 'priceRange', 'servesCuisine', 'openingHoursSpecification', 'takeaway']) {
      expect(schema).not.toHaveProperty(key);
    }
  });
});
