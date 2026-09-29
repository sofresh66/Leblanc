import { describe, expect, it } from 'vitest';
import { planManualGeocoding } from '../lib/manual-place-geocoding.mjs';

const item = { externalId: 'manuel:restaurant-le-blanc', adresse: '1 rue Principale',
  codePostal: '36300', commune: 'Le Blanc', horairesPublies: '' };
const stored = { external_id: item.externalId, address: item.adresse,
  postal_code: item.codePostal, city: item.commune, latitude: 46.6333, longitude: 1.0833 };

describe('Réutilisation des coordonnées des restaurants manuels', () => {
  it('évite le géocodage quand l’adresse est inchangée, même si les horaires changent', () => {
    const plan = planManualGeocoding([{ ...item, horairesPublies: 'lundi midi' }], [stored]);
    expect(plan.pending).toEqual([]);
    expect(plan.points.get(item.externalId)).toEqual({ latitude: 46.6333, longitude: 1.0833 });
  });

  it('préserve les coordonnées nulles sans réessayer chaque jour', () => {
    const plan = planManualGeocoding([item], [{ ...stored, latitude: null, longitude: null }]);
    expect(plan.pending).toEqual([]);
    expect(plan.points.has(item.externalId)).toBe(true);
    expect(plan.points.get(item.externalId)).toBeNull();
  });

  it('géocode un lieu nouveau', () => {
    const plan = planManualGeocoding([item], []);
    expect(plan.pending).toEqual([item]);
    expect(plan.points.size).toBe(0);
  });

  it.each([
    { adresse: '2 rue Principale' }, { codePostal: '36301' }, { commune: 'Ruffec' },
  ])('géocode lorsque un élément de l’adresse change : %j', (change) => {
    const changed = { ...item, ...change };
    const plan = planManualGeocoding([changed], [stored]);
    expect(plan.pending).toEqual([changed]);
    expect(plan.points.size).toBe(0);
  });

  it('réutilise un lieu sans adresse ni code postal et convertit les nombres SQL', () => {
    const plan = planManualGeocoding([{ ...item, adresse: '', codePostal: undefined }], [{
      ...stored, address: null, postal_code: null, latitude: '46.6333', longitude: '1.0833',
    }]);
    expect(plan.pending).toEqual([]);
    expect(plan.points.get(item.externalId)).toEqual({ latitude: 46.6333, longitude: 1.0833 });
  });

  it('ne réutilise pas des coordonnées incomplètes ou invalides', () => {
    for (const point of [{ latitude: null, longitude: 1 }, { latitude: 'invalid', longitude: 1 },
      { latitude: 91, longitude: 1 }]) {
      const plan = planManualGeocoding([item], [{ ...stored, ...point }]);
      expect(plan.pending).toEqual([item]);
      expect(plan.points.size).toBe(0);
    }
  });
});
