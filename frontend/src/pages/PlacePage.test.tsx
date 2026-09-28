// @vitest-environment jsdom
import { HelmetProvider } from 'react-helmet-async';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PlacePage } from './PlacePage';
import { placeFixture } from '../components/places/__tests__/fixture';
import { testI18n } from '../components/places/__tests__/testI18n';

const { mockUsePlace } = vi.hoisted(() => ({ mockUsePlace: vi.fn() }));
vi.mock('../hooks/usePlace', () => ({ usePlace: mockUsePlace }));
vi.mock('../components/places/PlaceMap', () => ({
  PlaceMap: () => 'mini-map',
  hasValidPlaceCoordinates: (latitude: number, longitude: number) =>
    Number.isFinite(latitude) && Number.isFinite(longitude) && !(latitude === 0 && longitude === 0),
  googleMapsDirectionsUrl: (latitude: number, longitude: number) =>
    `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}`,
}));

function renderPage(id = placeFixture.id) {
  return render(<HelmetProvider><I18nextProvider i18n={testI18n}>
    <MemoryRouter initialEntries={[`/fr/lieux/${id}`]}>
      <Routes><Route path="/fr/lieux/:id" element={<PlacePage />} /></Routes>
    </MemoryRouter>
  </I18nextProvider></HelmetProvider>);
}

afterEach(async () => { cleanup(); await testI18n.changeLanguage('fr'); });

describe('PlacePage', () => {
  it('affiche la fiche, les contacts, les badges, la carte et le SEO indexable', async () => {
    mockUsePlace.mockReturnValue({
      data: {
        ...placeFixture,
        isOpenNow: true,
        openingHoursStatus: 'unknown',
        phone: '+33 2 54 00 00 00',
        email: 'contact@example.test',
        website: 'https://example.test',
      },
      isLoading: false, isError: false,
    });
    renderPage();
    expect(screen.getByRole('heading', { level: 1, name: 'La Table' })).toBeTruthy();
    expect(screen.getByText('Ouvert')).toBeTruthy();
    expect(screen.getAllByText('15–30 €').length).toBeGreaterThan(0);
    expect(screen.getByText('Cuisine locale')).toBeTruthy();
    expect(screen.getAllByText('Horaires non renseignés').length).toBeGreaterThan(0);
    expect(screen.getByText('mini-map')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Appeler' }).getAttribute('href')).toBe('tel:+33254000000');
    expect(screen.getByRole('link', { name: 'contact@example.test' }).getAttribute('href')).toBe('mailto:contact@example.test');
    expect(screen.getAllByRole('link', { name: 'Site web' })[0]?.getAttribute('target')).toBe('_blank');
    await waitFor(() => expect(document.title).toBe('La Table — Le Blanc & Moi'));
    expect(document.querySelector('meta[name="description"]')?.getAttribute('content')).toBe('Cuisine locale');
    expect(document.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe('index, follow');
    expect(document.querySelector('link[rel="alternate"][hreflang="en"]')?.getAttribute('href')).toContain(`/en/places/${placeFixture.id}`);
    expect([...document.querySelectorAll('script[type="application/ld+json"]')].some((script) => script.textContent?.includes('"@type":"Restaurant"'))).toBe(true);
  });

  it('montre un skeleton pendant le chargement', () => {
    mockUsePlace.mockReturnValue({ isLoading: true, isError: false, data: undefined });
    renderPage();
    expect(screen.getByRole('status', { name: 'Chargement...' }).getAttribute('aria-busy')).toBe('true');
  });

  it('montre ErrorState et relance la requête après une erreur', () => {
    const refetch = vi.fn();
    mockUsePlace.mockReturnValue({ isLoading: false, isError: true, error: new Error('offline'), refetch });
    renderPage();
    expect(screen.getByTestId('error-state')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }));
    expect(refetch).toHaveBeenCalledOnce();
  });

  it('utilise NotFoundPage avec un message adapté au lieu absent', () => {
    mockUsePlace.mockReturnValue({ isLoading: false, isError: false, data: null });
    renderPage();
    expect(screen.getByRole('heading', { name: 'Lieu introuvable' })).toBeTruthy();
    expect(screen.getByText('Ce lieu n’existe pas ou n’est plus disponible.')).toBeTruthy();
  });

  it('montre la 404 pour un identifiant invalide sans lancer la requête', () => {
    mockUsePlace.mockReturnValue({ isLoading: false, isError: false, data: undefined });
    renderPage('invalid-uuid');
    expect(screen.getByRole('heading', { name: 'Lieu introuvable' })).toBeTruthy();
    expect(mockUsePlace).toHaveBeenLastCalledWith(undefined, 'fr');
  });

  it('masque la carte sans coordonnées valides et indique les données manquantes', () => {
    mockUsePlace.mockReturnValue({
      isLoading: false, isError: false,
      data: { ...placeFixture, latitude: 0, longitude: 0, description: '', priceRangeMin: null, priceRangeMax: null },
    });
    renderPage();
    expect(screen.queryByText('mini-map')).toBeNull();
    expect(screen.getByText('Description non disponible')).toBeTruthy();
    expect(screen.getByText('Prix non renseigné')).toBeTruthy();
  });
});
