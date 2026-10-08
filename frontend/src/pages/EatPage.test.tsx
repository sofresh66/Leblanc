// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EatPage } from './EatPage';
import { placeFixture } from '../components/places/__tests__/fixture';
import { testI18n } from '../components/places/__tests__/testI18n';

const { mockCategories, mockInfinitePlaces, mockPlacesForMap } = vi.hoisted(() => ({
  mockCategories: vi.fn(), mockInfinitePlaces: vi.fn(), mockPlacesForMap: vi.fn(),
}));
vi.mock('../hooks/usePlaceCategories', () => ({ usePlaceCategories: mockCategories }));
vi.mock('../hooks/usePlaces', () => ({ useInfinitePlaces: mockInfinitePlaces, usePlacesForMap: mockPlacesForMap }));
vi.mock('../components/places/PlacesMapView', () => ({
  default: ({ places }: { places: unknown[] }) => <div data-testid="places-map">{places.length} lieux</div>,
}));
vi.mock('../components/PageSeo', () => ({ PageSeo: () => null }));

afterEach(async () => { cleanup(); await testI18n.changeLanguage('fr'); });

describe('EatPage', () => {
  it('bascule entre liste et carte via ?view=map, sans charger la carte en vue liste', async () => {
    mockCategories.mockReturnValue({ data: undefined, isError: false, isLoading: true });
    mockInfinitePlaces.mockReturnValue({
      isLoading: false, isError: false, isFetchNextPageError: false,
      data: { pages: [{ items: [placeFixture], nextCursor: null }] }, hasNextPage: false,
    });
    mockPlacesForMap.mockReturnValue({ data: [placeFixture, { ...placeFixture, id: 'a1000000-0000-4000-8000-000000000002', latitude: null, longitude: null }], isError: false });
    render(<I18nextProvider i18n={testI18n}><MemoryRouter initialEntries={['/fr/ou-manger']}><EatPage /></MemoryRouter></I18nextProvider>);
    expect(mockPlacesForMap).toHaveBeenLastCalledWith({ lang: 'fr' }, false);
    const mapButton = screen.getByRole('button', { name: 'Carte' });
    expect(mapButton.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(mapButton);
    expect(await screen.findByTestId('places-map')).toBeTruthy();
    expect(screen.getByTestId('places-map').textContent).toBe('2 lieux');
    expect(screen.getByRole('button', { name: 'Carte' }).getAttribute('aria-pressed')).toBe('true');
    expect(mockPlacesForMap).toHaveBeenLastCalledWith({ lang: 'fr' }, true);
    expect(screen.queryByTestId(`place-card-${placeFixture.id}`)).toBeNull();
  });

  it('affiche la liste et le total fourni par les catégories', () => {
    mockCategories.mockReturnValue({
      data: { types: [{ value: 'restaurant', count: 28 }, { value: 'bar', count: 7 }], cuisines: [] },
      isError: false, isLoading: false,
    });
    mockInfinitePlaces.mockReturnValue({
      isLoading: false, isError: false, isFetchNextPageError: false,
      data: { pages: [{ items: [placeFixture], nextCursor: null }] }, hasNextPage: false,
    });
    render(<I18nextProvider i18n={testI18n}><MemoryRouter initialEntries={['/fr/ou-manger']}><EatPage /></MemoryRouter></I18nextProvider>);
    expect(screen.getByRole('heading', { name: 'Où manger autour du Blanc' })).toBeTruthy();
    expect(screen.getByText('35 adresses')).toBeTruthy();
    expect(screen.getByTestId(`place-card-${placeFixture.id}`)).toBeTruthy();
    expect(mockInfinitePlaces).toHaveBeenCalledWith({ lang: 'fr' });
  });

  it.each([
    ['en', 'Where to eat around Le Blanc'],
    ['es', 'Dónde comer cerca de Le Blanc'],
    ['de', 'Essen gehen rund um Le Blanc'],
    ['it', 'Dove mangiare nei dintorni di Le Blanc'],
    ['nl', 'Waar eten rond Le Blanc'],
  ])('affiche le titre en %s', async (lang, title) => {
    await testI18n.changeLanguage(lang);
    mockCategories.mockReturnValue({ data: { types: [], cuisines: [] }, isError: false, isLoading: false });
    mockInfinitePlaces.mockReturnValue({ isLoading: false, isError: false, data: { pages: [{ items: [], nextCursor: null }] } });
    render(<I18nextProvider i18n={testI18n}><MemoryRouter initialEntries={[`/${lang}/ou-manger`]}><EatPage /></MemoryRouter></I18nextProvider>);
    expect(screen.getByRole('heading', { name: title })).toBeTruthy();
  });
});
