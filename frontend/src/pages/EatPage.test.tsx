// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EatPage } from './EatPage';
import { placeFixture } from '../components/places/__tests__/fixture';
import { testI18n } from '../components/places/__tests__/testI18n';

const { mockCategories, mockInfinitePlaces } = vi.hoisted(() => ({
  mockCategories: vi.fn(), mockInfinitePlaces: vi.fn(),
}));
vi.mock('../hooks/usePlaceCategories', () => ({ usePlaceCategories: mockCategories }));
vi.mock('../hooks/usePlaces', () => ({ useInfinitePlaces: mockInfinitePlaces }));
vi.mock('../components/PageSeo', () => ({ PageSeo: () => null }));

afterEach(async () => { cleanup(); await testI18n.changeLanguage('fr'); });

describe('EatPage', () => {
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
