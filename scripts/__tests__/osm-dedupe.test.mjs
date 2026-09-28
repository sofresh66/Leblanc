import { describe, expect, it } from 'vitest';
import { classifyDedupe, comparableName, nameSimilarity } from '../lib/osm-dedupe.mjs';

const dt = { id: 'dt', source: 'datatourisme_places', type: 'restaurant',
  name: 'Le Relais de la Brenne', city: 'Le Blanc', postalCode: '36300', distanceMeters: 20 };
const osm = { id: 'osm', source: 'openstreetmap', type: 'restaurant',
  name: 'Relais Brenne', city: 'Le Blanc', postalCode: '36300' };

describe('déduplication prudente DATAtourisme / OSM', () => {
  it('retire les articles et accents pour un match exact à moins de 50 m', () => {
    expect(comparableName('Le Café de la Gare')).toBe('cafegare');
    expect(classifyDedupe(dt, osm)).toMatchObject({ level: 1, decision: 'merge', distanceMeters: 20 });
  });

  it('classe une forte similarité proche avec même code postal au niveau 2', () => {
    const candidate = classifyDedupe({ ...dt, name: 'Restaurant des Tilleuls', distanceMeters: 100 },
      { ...osm, name: 'Restaurant des Tilleule' });
    expect(candidate).toMatchObject({ level: 2, decision: 'merge' });
  });

  it('garde visible un match ambigu au niveau 3', () => {
    const candidate = classifyDedupe({ ...dt, name: 'La Table du Parc', distanceMeters: 200 },
      { ...osm, name: 'Table du Port' });
    expect(candidate).toMatchObject({ level: 3, decision: 'pending' });
  });

  it('écarte les villes, codes postaux, types et noms incompatibles', () => {
    expect(classifyDedupe(dt, { ...osm, postalCode: '36220' })).toBeNull();
    expect(classifyDedupe(dt, { ...osm, city: 'Rosnay' })).toBeNull();
    expect(classifyDedupe(dt, { ...osm, type: 'bar' })).toBeNull();
    expect(classifyDedupe(dt, { ...osm, name: 'Café des Sports' })).toBeNull();
    expect(nameSimilarity('Café des Sports', 'Autre lieu')).toBeLessThan(0.6);
  });

  it('refuse une inversion des sources', () => {
    expect(() => classifyDedupe(osm, dt)).toThrow('Ordre des place_id invalide');
  });
});
