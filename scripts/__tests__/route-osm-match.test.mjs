import { describe, expect, it } from 'vitest';
import {
  comparableOsmName, indexMatchDecisions, matchRoute, modesMatch, namesMatch, prepareRelations, relationLines,
} from '../lib/route-osm-match.mjs';

// Relations Overpass (`out geom`) réduites à quelques points des tracés réels.
const relation = (id, tags, ...ways) => ({
  type: 'relation', id, tags: { type: 'route', ...tags },
  members: ways.map(([role, points]) => ({ type: 'way', role, geometry: points.map(([lon, lat]) => ({ lon, lat })) })),
});
const anglinWalk = relation(18296130, { name: "Les bords de l'Anglin", route: 'hiking', network: 'lwn', roundtrip: 'yes' },
  ['', [[1.0050, 46.5650], [1.0080, 46.5660]]], ['', [[1.0080, 46.5660], [1.0110, 46.5640]]]);
const bikeSeven = relation(11805614, { name: "Itinéraire vélo n°7 - En passant par Angles-sur-l'Anglin", route: 'bicycle', network: 'lcn' },
  ['', [[0.8870, 46.6950], [0.8900, 46.6960]]]);
const relations = prepareRelations([anglinWalk, bikeSeven, { type: 'node', id: 1 }]);

const item = (title, modes, start, externalId = 'uuid-1') => ({ externalId, route: { titleI18n: { fr: title }, modes, start } });

describe('Correspondance DATAtourisme ↔ OSM', () => {
  it('compare les noms sans préfixe numéroté ni accents', () => {
    expect(comparableOsmName("Itinéraire vélo n°8 - La Creuse, entre viaduc et prieuré")).toBe('la creuse entre viaduc et prieure');
    expect(comparableOsmName('Bois')).toBeNull();
    expect(namesMatch("Balade à pied n°22 - Les bords de l'Anglin", "Les bords de l'Anglin")).toBe(true);
    expect(namesMatch("Itinéraire vélo n°9 - Le val d'Anglin par Château Guillaume", "Les bords de l'Anglin")).toBe(false);
    // « Loup y es-tu ? » : mots entiers seulement.
    expect(namesMatch('Balade à pied n°16 - Loup y es-tu ?', 'Loup y es-tu ?')).toBe(true);
  });

  it('associe les familles de mode', () => {
    expect(modesMatch(['foot'], 'hiking')).toBe(true);
    expect(modesMatch(['mtb'], 'bicycle')).toBe(true);
    expect(modesMatch(['foot'], 'bicycle')).toBe(false);
    expect(modesMatch(['horse'], 'unknown')).toBe(false);
  });

  it('retient la relation au nom concordant, au même mode et à moins de 500 m', () => {
    const match = matchRoute(item("Balade à pied n°22 - Les bords de l'Anglin", ['foot'], [1.0081, 46.5662]), relations);
    expect(match).toMatchObject({ relationId: 18296130, isLoop: true, forced: false, lines: [[[1.005, 46.565], [1.008, 46.566], [1.011, 46.564]]] });
    expect(match.startDistanceM).toBeLessThan(30);
    expect(match.start[0]).toBeCloseTo(1.008, 3);
  });

  it('écarte les faux positifs de l’inventaire', () => {
    // Vélo n°9 à 130 m des « bords de l'Anglin » : autre nom, autre mode.
    expect(matchRoute(item("Itinéraire vélo n°9 - Le val d'Anglin par Château Guillaume", ['bike'], [1.0081, 46.5672]), relations)).toBeNull();
    // GR 48 à côté du vélo n°7 : nom différent et mode différent.
    expect(matchRoute(item("Sentier GR 48 : Angles-sur-l'Anglin / Saint-Savin", ['foot'], [0.8880, 46.6955]), relations)).toBeNull();
  });

  it('refuse un départ à plus de 500 m même si le nom concorde', () => {
    expect(matchRoute(item("Balade à pied n°22 - Les bords de l'Anglin", ['foot'], [1.0081, 46.5720]), relations)).toBeNull();
  });

  it('applique les décisions manuelles', () => {
    const far = item("Balade à pied n°22 - Les bords de l'Anglin", ['foot'], [1.0081, 46.5720], 'uuid-far');
    const forced = indexMatchDecisions([{ externalId: 'uuid-far', osmRelationId: 18296130, decision: 'force', note: 'départ au bourg' }]);
    expect(matchRoute(far, relations, forced)).toMatchObject({ relationId: 18296130, forced: true });
    const near = item("Balade à pied n°22 - Les bords de l'Anglin", ['foot'], [1.0081, 46.5662], 'uuid-near');
    const rejected = indexMatchDecisions([{ externalId: 'uuid-near', osmRelationId: 18296130, decision: 'reject', note: 'variante' }]);
    expect(matchRoute(near, relations, rejected)).toBeNull();
    expect(() => indexMatchDecisions([{ externalId: 'x', osmRelationId: 1, decision: 'force' }])).toThrow(/invalide/);
  });

  it('ignore les variantes et les approches d’une relation', () => {
    const withVariant = relation(1, { name: 'Test', route: 'hiking' },
      ['', [[0, 0], [1, 0]]], ['alternative', [[5, 5], [6, 6]]], ['approach', [[7, 7], [8, 8]]]);
    expect(relationLines(withVariant)).toEqual([[[0, 0], [1, 0]]]);
  });
});
