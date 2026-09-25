import { describe, expect, it } from 'vitest';
import { resolveMaxDistanceMeters } from './useEvents';

/** Construit des paramètres d'URL à partir d'une chaîne de requête. */
function params(query: string): URLSearchParams {
  return new URLSearchParams(query);
}

describe('resolveMaxDistanceMeters', () => {
  it('lit le format courant exprimé en mètres', () => {
    expect(resolveMaxDistanceMeters(params('maxDistance=5000'))).toBe(5000);
  });

  it('convertit l’ancien format exprimé en kilomètres (rétrocompatibilité)', () => {
    expect(resolveMaxDistanceMeters(params('maxDistanceKm=5'))).toBe(5000);
    expect(resolveMaxDistanceMeters(params('maxDistanceKm=7.5'))).toBe(7500);
  });

  it('donne la priorité au format en mètres quand les deux sont présents', () => {
    expect(resolveMaxDistanceMeters(params('maxDistance=3000&maxDistanceKm=9'))).toBe(3000);
  });

  it('plafonne le rayon à 20 000 m, limite acceptée par l’API', () => {
    expect(resolveMaxDistanceMeters(params('maxDistance=50000'))).toBe(20000);
    expect(resolveMaxDistanceMeters(params('maxDistanceKm=99'))).toBe(20000);
  });

  it('retourne undefined quand le paramètre est absent ou inexploitable', () => {
    expect(resolveMaxDistanceMeters(params(''))).toBeUndefined();
    expect(resolveMaxDistanceMeters(params('maxDistance=abc'))).toBeUndefined();
    expect(resolveMaxDistanceMeters(params('maxDistance=0'))).toBeUndefined();
    expect(resolveMaxDistanceMeters(params('maxDistanceKm=-3'))).toBeUndefined();
  });
});
