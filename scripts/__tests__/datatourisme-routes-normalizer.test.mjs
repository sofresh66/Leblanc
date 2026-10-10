import { describe, expect, it } from 'vitest';
import { normalizeDatatourismeRoute, routeIsLoop, routeModes } from '../lib/datatourisme-routes-normalizer.mjs';

// Forme réelle d'un objet /v1/tour (fiche Destination Brenne, textes abrégés).
const tour = (overrides = {}) => ({
  uuid: '96aa7161-3c2f-3ea4-bae1-fc0718bed3ed',
  uri: 'https://data.datatourisme.fr/15/96aa7161-3c2f-3ea4-bae1-fc0718bed3ed',
  label: { '@fr': "Balade à pied n°39 - Le val d'Anglin", '@en': "Walk n°39 - The Anglin valley" },
  type: ['WalkingTour', 'OrderedList', 'Tour', 'PointOfInterest'],
  lastUpdate: '2026-01-04',
  hasDescription: [{ description: { '@fr': 'Il faut s’élever quelque peu et quitter le Val d’Anglin.', '@en': 'It is necessary to rise somewhat.' } }],
  isLocatedAt: [{ geo: { latitude: 46.723668, longitude: 1.215031 },
    address: [{ addressLocality: 'Rosnay', postalCode: '36300' }] }],
  hasContact: [{ homepage: ['http://www.parc-naturel-brenne.fr/'] }],
  hasBeenCreatedBy: { legalName: 'Destination Brenne' },
  hasMainRepresentation: [{
    hasAnnotation: [{ credits: ['CRT Centre Val de Loire P Aucante'], isCoveredBy: 'By-NC-ND 4.0' }],
    hasRelatedResource: [{ locator: ['https://centre.media.tourinsoft.eu/upload/photo.jpg'] }],
  }],
  tourDistance: 9000.4,
  duration: 135,
  durationDays: 0.5,
  ...overrides,
});

describe('Normalisation des itinéraires DATAtourisme', () => {
  it('reprend les champs de la fiche sans rien inventer', () => {
    const result = normalizeDatatourismeRoute(tour());
    expect(result).toMatchObject({
      ok: true,
      externalId: '96aa7161-3c2f-3ea4-bae1-fc0718bed3ed',
      sourceUpdatedAt: '2026-01-04T00:00:00Z',
      route: {
        titleI18n: { fr: "Balade à pied n°39 - Le val d'Anglin", en: 'Walk n°39 - The Anglin valley' },
        modes: ['foot'], isLoop: null, distanceM: 9000, durationMin: 135, durationDays: 0.5,
        start: [1.215031, 46.723668], startCity: 'Rosnay', startPostalCode: '36300',
        officialUrl: 'http://www.parc-naturel-brenne.fr/', producer: 'Destination Brenne',
        imageUrl: 'https://centre.media.tourinsoft.eu/upload/photo.jpg',
        imageCredit: 'CRT Centre Val de Loire P Aucante', imageLicense: 'By-NC-ND 4.0',
        normalizedTitle: 'balade a pied n 39 le val d anglin',
      },
    });
  });

  it('laisse vides la distance, la durée et la description absentes', () => {
    const result = normalizeDatatourismeRoute(tour({ tourDistance: undefined, duration: undefined, durationDays: 194,
      hasDescription: undefined, hasContact: [{ homepage: ['https://data.datatourisme.fr/15/x'] }] }));
    expect(result.route).toMatchObject({ distanceM: null, durationMin: null, durationDays: null,
      descriptionI18n: { fr: '' }, officialUrl: null });
  });

  it('n’affiche pas un crédit « Non communiqué »', () => {
    const result = normalizeDatatourismeRoute(tour({ hasMainRepresentation: [{
      hasAnnotation: [{ credits: ['Non communiqué'] }], hasRelatedResource: [{ locator: ['https://x.example/a.jpg'] }] }] }));
    expect(result.route).toMatchObject({ imageCredit: null, imageLicense: null, imageUrl: 'https://x.example/a.jpg' });
  });

  it('exclut les circuits motorisés', () => {
    expect(normalizeDatatourismeRoute(tour({ type: ['RoadTour', 'Tour'] }))).toMatchObject({ ok: false, reason: 'motorised' });
    expect(normalizeDatatourismeRoute(tour({ type: ['Tour'], label: { '@fr': 'Itinéraire 3 - Au pays des 1000 étangs à moto' } })))
      .toMatchObject({ ok: false, reason: 'motorised' });
    expect(normalizeDatatourismeRoute(tour({ label: { '@fr': 'Autour du lac' } })).ok).toBe(true);
  });

  it('refuse une fiche sans titre français ou sans coordonnées', () => {
    expect(normalizeDatatourismeRoute(tour({ label: { '@en': 'Walk' } }))).toMatchObject({ ok: false, reason: 'missing_title_or_uuid' });
    expect(normalizeDatatourismeRoute(tour({ isLocatedAt: [{ geo: { latitude: 0, longitude: 0 } }] })))
      .toMatchObject({ ok: false, reason: 'invalid_coordinates' });
  });
});

describe('Modes et boucle', () => {
  it('traduit les sous-types DATAtourisme', () => {
    expect(routeModes(['WalkingTour', 'CyclingTour'], 'Balade à pied n°21 - Du parc à la forêt', '')).toEqual(['foot', 'bike']);
    expect(routeModes(['HorseTour'], 'La Brenne à cheval', '')).toEqual(['horse']);
  });

  it('distingue le VTT du vélo', () => {
    expect(routeModes(['CyclingTour'], 'Circuit VTT - Boucle des 7 gués', '')).toEqual(['mtb']);
    expect(routeModes(['WalkingTour'], 'Les trois paroisses', 'Accessible en VTT.')).toEqual(['foot', 'mtb']);
  });

  it('déduit le mode du titre sans sous-type, à pied par défaut', () => {
    expect(routeModes([], 'Par Les Patureaux / Boucle 6', '')).toEqual(['foot']);
    expect(routeModes([], 'Gravel (non jalonné) - Entre bord de Creuse et plateau', '')).toEqual(['bike']);
    expect(routeModes([], 'Randonnée équestre des étangs', '')).toEqual(['horse']);
  });

  it('ne conclut à une boucle que si la source le dit sans ambiguïté', () => {
    expect(routeIsLoop([{ key: 'Loop' }])).toBe(true);
    expect(routeIsLoop([{ key: 'OpenJaw' }])).toBe(false);
    expect(routeIsLoop([{ key: 'Loop' }, { key: 'OpenJaw' }])).toBeNull();
    expect(routeIsLoop(undefined)).toBeNull();
  });
});
