import { describe, expect, it } from 'vitest';
import { googleMapsDirectionsUrl, hasValidPlaceCoordinates } from './PlaceMap';

describe('PlaceMap', () => {
  it('n’accepte que des coordonnées géographiques exploitables', () => {
    expect(hasValidPlaceCoordinates(46.6333, 1.0833)).toBe(true);
    expect(hasValidPlaceCoordinates(0, 0)).toBe(false);
    expect(hasValidPlaceCoordinates(null, null)).toBe(false);
    expect(hasValidPlaceCoordinates(Number.NaN, 1)).toBe(false);
    expect(hasValidPlaceCoordinates(91, 1)).toBe(false);
  });

  it('construit un lien d’itinéraire avec les coordonnées', () => {
    const url = new URL(googleMapsDirectionsUrl(46.6333, 1.0833));
    expect(url.searchParams.get('destination')).toBe('46.6333,1.0833');
  });
});
