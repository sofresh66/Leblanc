// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PlaceFilters } from './PlaceFilters';
import { testI18n } from './__tests__/testI18n';

const { mockCategories } = vi.hoisted(() => ({ mockCategories: vi.fn() }));
vi.mock('../../hooks/usePlaceCategories', () => ({ usePlaceCategories: mockCategories }));

function CurrentSearch() {
  const location = useLocation();
  return <output data-testid="search">{location.search}</output>;
}

afterEach(async () => { cleanup(); await testI18n.changeLanguage('fr'); });

describe('PlaceFilters', () => {
  it('applique les filtres multiples dans l’URL et supprime le curseur', () => {
    mockCategories.mockReturnValue({
      data: {
        types: [{ value: 'restaurant', count: 28 }, { value: 'bar', count: 1 }],
        cuisines: [{ value: 'TraditionalCuisine', count: 2 }],
      }, isError: false, isLoading: false,
    });
    render(<I18nextProvider i18n={testI18n}><MemoryRouter initialEntries={['/fr/ou-manger?cursor=old']}>
      <PlaceFilters /><CurrentSearch />
    </MemoryRouter></I18nextProvider>);
    fireEvent.click(screen.getByRole('button', { name: 'Afficher' }));
    fireEvent.click(screen.getByRole('checkbox', { name: /Restaurant/ }));
    fireEvent.click(screen.getByRole('checkbox', { name: /^Bar/ }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Cuisine traditionnelle' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Afficher uniquement les lieux ouverts' }));
    fireEvent.change(screen.getByRole('slider', { name: 'Rayon de recherche' }), { target: { value: '5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Appliquer' }));
    const params = new URLSearchParams(screen.getByTestId('search').textContent ?? '');
    expect(params.get('type')).toBe('restaurant,bar');
    expect(params.get('cuisine')).toBe('TraditionalCuisine');
    expect(params.get('openNow')).toBe('true');
    expect(params.get('maxDistance')).toBe('5000');
    expect(params.has('cursor')).toBe(false);
  });

  it('réinitialise les filtres depuis une URL profonde', () => {
    mockCategories.mockReturnValue({ data: { types: [], cuisines: [] }, isError: false, isLoading: false });
    render(<I18nextProvider i18n={testI18n}><MemoryRouter initialEntries={['/fr/ou-manger?type=bar&openNow=true&maxDistance=5000&cursor=next']}>
      <PlaceFilters /><CurrentSearch />
    </MemoryRouter></I18nextProvider>);
    fireEvent.click(screen.getByRole('button', { name: 'Afficher' }));
    expect(screen.getByRole('checkbox', { name: /^Bar/ })).toHaveProperty('checked', true);
    fireEvent.click(screen.getByRole('button', { name: 'Réinitialiser' }));
    expect(screen.getByTestId('search').textContent).toBe('');
  });
});
