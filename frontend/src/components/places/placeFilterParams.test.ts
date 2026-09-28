import { describe, expect, it } from 'vitest';
import { readPlaceFilterParams, writePlaceFilterParams } from './placeFilterParams';

describe('paramètres URL des lieux', () => {
  it('lit les types et cuisines multiples et ignore les types inconnus', () => {
    expect(readPlaceFilterParams(new URLSearchParams('type=restaurant,bar,invalid&cuisine=TraditionalCuisine,Pizzeria&openNow=true&maxDistance=5000')))
      .toEqual({ types: ['restaurant', 'bar'], cuisines: ['TraditionalCuisine', 'Pizzeria'], openNow: true, maxDistanceKm: 5 });
  });

  it('écrit les filtres et retire le curseur après leur modification', () => {
    const next = writePlaceFilterParams(new URLSearchParams('cursor=old&lang=fr'), {
      types: ['bar', 'restaurant'], cuisines: ['Pizzeria'], openNow: true, maxDistanceKm: 5,
    });
    expect(next.get('type')).toBe('bar,restaurant');
    expect(next.get('cuisine')).toBe('Pizzeria');
    expect(next.get('openNow')).toBe('true');
    expect(next.get('maxDistance')).toBe('5000');
    expect(next.has('cursor')).toBe(false);
    expect(next.get('lang')).toBe('fr');
  });

  it('réinitialise les filtres et refuse les distances invalides', () => {
    expect(readPlaceFilterParams(new URLSearchParams('maxDistance=999999')).maxDistanceKm).toBe(20);
    const next = writePlaceFilterParams(new URLSearchParams('type=bar&openNow=true&maxDistance=5000&cursor=next'), {
      types: [], cuisines: [], openNow: false, maxDistanceKm: 20,
    });
    expect(next.toString()).toBe('');
  });
});
