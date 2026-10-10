import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  LE_BLANC, haversineMeters, mergeLines, nearestPointOnLines, pointInGeometry, toMultiLineStringWkt,
} from '../lib/geo.mjs';

const pnr = JSON.parse(fs.readFileSync(new URL('../../data/pnr-brenne.geojson', import.meta.url), 'utf8'));

describe('Calculs géographiques des parcours', () => {
  it('mesure la distance entre Le Blanc et Ruffec (environ 6,7 km)', () => {
    expect(haversineMeters(LE_BLANC, [1.1720699, 46.6282793])).toBeGreaterThan(6_700);
    expect(haversineMeters(LE_BLANC, [1.1720699, 46.6282793])).toBeLessThan(6_900);
  });

  it('situe Rosnay et Mézières-en-Brenne dans le PNR, Liglet et Poitiers hors du PNR', () => {
    expect(pointInGeometry([1.215031, 46.723668], pnr.geometry)).toBe(true);
    expect(pointInGeometry([1.2131, 46.8203], pnr.geometry)).toBe(true);
    expect(pointInGeometry([1.084417, 46.509092], pnr.geometry)).toBe(false);
    expect(pointInGeometry([0.3404, 46.5802], pnr.geometry)).toBe(false);
  });

  it('respecte les trous d’un polygone', () => {
    const square = (size) => [[0, 0], [size, 0], [size, size], [0, size], [0, 0]];
    const geometry = { type: 'Polygon', coordinates: [square(10), square(2)] };
    expect(pointInGeometry([1, 1], geometry)).toBe(false);
    expect(pointInGeometry([5, 5], geometry)).toBe(true);
    expect(() => pointInGeometry([0, 0], { type: 'Point', coordinates: [0, 0] })).toThrow(/Polygon/);
  });

  it('cite l’attribution OSM et la licence ODbL du polygone du PNR', () => {
    expect(pnr.properties).toMatchObject({ attribution: '© OpenStreetMap contributors', source: 'OpenStreetMap, relation 4287018' });
    expect(pnr.properties.license).toMatch(/^ODbL/);
  });

  it('trouve le point du tracé le plus proche, y compris au milieu d’un segment', () => {
    const line = [[1.0, 46.6], [1.01, 46.6]];
    const nearest = nearestPointOnLines([1.005, 46.6009], [line]);
    expect(nearest.distanceM).toBeGreaterThan(95);
    expect(nearest.distanceM).toBeLessThan(105);
    expect(nearest.point[0]).toBeCloseTo(1.005, 6);
    expect(nearest.point[1]).toBeCloseTo(46.6, 6);
    expect(nearestPointOnLines([1, 46], [])).toBeNull();
  });

  it('assemble les voies contiguës et garde les morceaux disjoints', () => {
    const merged = mergeLines([
      [[0, 0], [1, 0]],
      [[2, 0], [1, 0]], // à l'envers
      [[5, 5], [6, 6]],
      [[3, 0], [2, 0]],
      [[9, 9]], // un seul point : ignoré
    ]);
    expect(merged).toEqual([[[0, 0], [1, 0], [2, 0], [3, 0]], [[5, 5], [6, 6]]]);
  });

  it('produit un WKT MultiLineString et refuse un tracé vide', () => {
    expect(toMultiLineStringWkt([[[1.17, 46.63], [1.18, 46.64]], [[1.19, 46.65], [1.2, 46.66]]]))
      .toBe('MULTILINESTRING((1.17 46.63, 1.18 46.64), (1.19 46.65, 1.2 46.66))');
    expect(() => toMultiLineStringWkt([])).toThrow(/vide/);
    expect(() => toMultiLineStringWkt([[[1, 2]]])).toThrow(/deux points/);
  });
});
