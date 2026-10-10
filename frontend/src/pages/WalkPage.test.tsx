// @vitest-environment jsdom
import { HelmetProvider } from 'react-helmet-async';
import { cleanup, render, screen, within } from '@testing-library/react';
import { createInstance } from 'i18next';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { osmTrackAttribution, datatourismeAttribution, type TrailDetail, type TrailNearbyResponse } from '@leblanc/shared';
import frWalks from '../../public/locales/fr/walks.json';
import frCommon from '../../public/locales/fr/common.json';
import frErrors from '../../public/locales/fr/errors.json';
import frNav from '../../public/locales/fr/nav.json';
import frSeo from '../../public/locales/fr/seo.json';
import frEvents from '../../public/locales/fr/events.json';
import { WalkPage, listSearchFromState } from './WalkPage';

const { mockUseTrail, mockUseTrailNearby } = vi.hoisted(() => ({ mockUseTrail: vi.fn(), mockUseTrailNearby: vi.fn() }));
vi.mock('../hooks/useTrails', () => ({ useTrail: mockUseTrail, useTrailNearby: mockUseTrailNearby }));
vi.mock('../components/walks/TrailDetailMap', () => ({ default: () => <div data-testid="trail-map" /> }));

const i18n = createInstance();
void i18n.use(initReactI18next).init({
  lng: 'fr', fallbackLng: 'fr', defaultNS: 'walks', ns: ['walks', 'common', 'errors', 'nav', 'seo', 'events'],
  resources: { fr: { walks: frWalks, common: frCommon, errors: frErrors, nav: frNav, seo: frSeo, events: frEvents } },
  initImmediate: false, interpolation: { escapeValue: false },
});

const id = 'c1000000-0000-4000-8000-000000000001';
const track = { type: 'MultiLineString' as const, coordinates: [[[1.17, 46.63], [1.18, 46.64]] as [number, number][]] };
const tracked: TrailDetail = {
  id, title: 'Balade à pied n°14 - Rive gauche, rive droite', contentLanguage: 'fr', modes: ['foot'], isLoop: true,
  distanceM: 11500, durationMin: 180, durationDays: null, start: { lat: 46.63, lng: 1.17 }, startCity: 'Fontgombault',
  distanceFromLeBlancM: 8758, hasTrack: true, imageUrl: 'https://centre.media.tourinsoft.eu/upload/rive.jpg',
  imageCredit: '© Hellio et Van Ingen', imageLicense: null, officialUrl: 'http://www.parc-naturel-brenne.fr/',
  producer: 'Destination Brenne', updatedAt: '2026-01-04T00:00:00.000Z',
  description: 'Une boucle entre les deux rives.', descriptionLanguage: 'fr', isFallback: false, startPostalCode: '36220',
  track, osmRelationId: 18248594, gpxAvailable: true,
  attributions: [datatourismeAttribution('Destination Brenne'), osmTrackAttribution(18248594)],
};
const untracked: TrailDetail = {
  ...tracked, hasTrack: false, track: null, osmRelationId: null, gpxAvailable: false, isLoop: null,
  imageLicense: 'By-NC-ND 4.0', attributions: [datatourismeAttribution('Destination Brenne')],
};
const nearby: TrailNearbyResponse = {
  radiusM: 5000, generatedAt: '2026-10-10T12:00:00.000Z',
  events: [{ id: 'e1000000-0000-4000-8000-000000000001', title: 'Exposition', startDate: '2026-09-11T13:00:00.000Z',
    endDate: '2099-10-18T16:00:00.000Z', allDay: false, timezone: 'Europe/Paris', city: 'Le Blanc', distanceFromStartM: 2242 }],
  places: [{ id: 'p1000000-0000-4000-8000-000000000001', title: 'Berry Bar Team', type: 'bar', city: 'Le Blanc', distanceFromStartM: 968 }],
};

function renderPage(trail: TrailDetail | null, nearbyData: TrailNearbyResponse | undefined = undefined, state?: unknown) {
  mockUseTrail.mockReturnValue({ isLoading: false, isError: false, data: trail });
  mockUseTrailNearby.mockReturnValue({ data: nearbyData });
  return render(<HelmetProvider><I18nextProvider i18n={i18n}>
    <MemoryRouter initialEntries={[{ pathname: `/fr/se-balader/${id}`, state }]}>
      <Routes><Route path="/fr/se-balader/:id" element={<WalkPage />} /></Routes>
    </MemoryRouter>
  </I18nextProvider></HelmetProvider>);
}

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('WalkPage', () => {
  it('fiche avec tracé OSM : caractéristiques, GPX, attribution ODbL et lien vers la relation', () => {
    renderPage(tracked);
    expect(screen.getByRole('heading', { level: 1, name: tracked.title })).toBeTruthy();
    const facts = within(screen.getByRole('region', { name: 'Caractéristiques' }));
    expect(facts.getByText('11,5 km')).toBeTruthy();
    expect(facts.getByText('3 h')).toBeTruthy();
    expect(facts.getByText('Boucle')).toBeTruthy();
    expect(facts.getByText('Fontgombault 36220')).toBeTruthy();
    expect(screen.getByText('Photo : © Hellio et Van Ingen')).toBeTruthy();
    // L'origine dépend de VITE_API_URL ; le chemin GPX reste identique.
    expect(screen.getByRole('link', { name: 'Télécharger le GPX' }).getAttribute('href')).toMatch(new RegExp(`/api/v1/routes/${id}/gpx$`));
    const relation = screen.getByRole('link', { name: 'Relation OpenStreetMap 18248594' });
    expect(relation.getAttribute('href')).toBe('https://www.openstreetmap.org/relation/18248594');
    expect(screen.getAllByRole('link', { name: 'Tracés © contributeurs OpenStreetMap, ODbL' }).length).toBeGreaterThan(0);
    expect(screen.getByText(/Fiche : DATAtourisme, Destination Brenne/)).toBeTruthy();
    expect(screen.queryByText(/Tracé non disponible/)).toBeNull();
    expect(screen.getByRole('link', { name: 'Y aller' }).getAttribute('href')).toContain('destination=46.63,1.17');
  });

  it('fiche sans tracé : pas de GPX, « Tracé non disponible », lien officiel, boucle inconnue absente, licence affichée', () => {
    renderPage(untracked);
    expect(screen.queryByRole('link', { name: 'Télécharger le GPX' })).toBeNull();
    expect(screen.getByText('Tracé non disponible : seul le point de départ est indiqué sur la carte.')).toBeTruthy();
    expect(screen.getAllByRole('link', { name: /Fiche officielle de « Balade à pied n°14/ })[0]?.getAttribute('target')).toBe('_blank');
    expect(screen.queryByText('Boucle')).toBeNull();
    expect(screen.queryByText(/OpenStreetMap, ODbL/)).toBeNull();
    expect(screen.getByText('Photo : © Hellio et Van Ingen (By-NC-ND 4.0)')).toBeTruthy();
  });

  it('signale le repli de la description sur le français', () => {
    renderPage({ ...tracked, contentLanguage: 'fr', isFallback: true });
    expect(screen.getByText(/Description disponible en/)).toBeTruthy();
  });

  it('« À proximité » : liens vers les fiches ; section masquée si vide', () => {
    renderPage(tracked, nearby);
    const section = within(screen.getByRole('region', { name: 'À proximité du départ' }));
    expect(section.getByRole('link', { name: 'Exposition' }).getAttribute('href')).toBe('/fr/evenements/e1000000-0000-4000-8000-000000000001');
    expect(section.getByRole('link', { name: 'Berry Bar Team' }).getAttribute('href')).toBe('/fr/lieux/p1000000-0000-4000-8000-000000000001');
    expect(section.getByText('Le Blanc · À 1 km du départ')).toBeTruthy();
    // Événement en cours : « Jusqu'au … », pas sa date de début passée.
    expect(section.getByText(/^Jusqu/)).toBeTruthy();
    expect(section.queryByText(/11 sept/)).toBeNull();
    cleanup();
    renderPage(tracked, { ...nearby, events: [], places: [] });
    expect(screen.queryByRole('region', { name: 'À proximité du départ' })).toBeNull();
  });

  it('retour à la liste avec les filtres transmis', () => {
    renderPage(tracked, undefined, { listSearch: '?modes=foot%2Chorse&withTrack=true' });
    expect(screen.getByRole('link', { name: 'Retour aux parcours' }).getAttribute('href')).toBe('/fr/se-balader?modes=foot%2Chorse&withTrack=true');
    expect(listSearchFromState({ listSearch: 'javascript:alert(1)' })).toBe('');
    expect(listSearchFromState(null)).toBe('');
  });

  it('parcours inconnu ou masqué : page introuvable', () => {
    renderPage(null);
    expect(screen.getByText('Parcours introuvable')).toBeTruthy();
  });
});
