// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PlaceList } from './PlaceList';
import { placeFixture } from './__tests__/fixture';
import { testI18n } from './__tests__/testI18n';

const { mockInfinitePlaces } = vi.hoisted(() => ({ mockInfinitePlaces: vi.fn() }));
vi.mock('../../hooks/usePlaces', () => ({ useInfinitePlaces: mockInfinitePlaces }));

function renderList(onResetFilters = vi.fn()) {
  render(<I18nextProvider i18n={testI18n}><MemoryRouter>
    <PlaceList filters={{ lang: 'fr' }} onResetFilters={onResetFilters} />
  </MemoryRouter></I18nextProvider>);
  return onResetFilters;
}

afterEach(async () => { cleanup(); await testI18n.changeLanguage('fr'); });

describe('PlaceList', () => {
  it('montre des skeletons pendant le chargement', () => {
    mockInfinitePlaces.mockReturnValue({ isLoading: true, data: undefined });
    renderList();
    expect(screen.getByRole('status', { name: 'Chargement...' }).getAttribute('aria-busy')).toBe('true');
    expect(screen.queryByTestId(`place-card-${placeFixture.id}`)).toBeNull();
  });

  it('montre l’état vide avec réinitialisation', () => {
    mockInfinitePlaces.mockReturnValue({ isLoading: false, isError: false, data: { pages: [{ items: [], nextCursor: null }] } });
    const reset = renderList();
    expect(screen.getByText('Aucune adresse trouvée')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Réinitialiser' }));
    expect(reset).toHaveBeenCalledOnce();
  });

  it('montre l’erreur et relance la requête', () => {
    const refetch = vi.fn();
    mockInfinitePlaces.mockReturnValue({ isLoading: false, isError: true, error: new Error('offline'), data: undefined, refetch });
    renderList();
    expect(screen.getByTestId('error-state')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }));
    expect(refetch).toHaveBeenCalledOnce();
  });

  it('affiche la grille et charge la page suivante', () => {
    const fetchNextPage = vi.fn();
    mockInfinitePlaces.mockReturnValue({
      isLoading: false, isError: false, isFetchNextPageError: false, isFetchingNextPage: false,
      data: { pages: [{ items: [placeFixture], nextCursor: 'next' }] },
      hasNextPage: true, fetchNextPage,
    });
    renderList();
    expect(screen.getByTestId(`place-card-${placeFixture.id}`)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Charger plus' }));
    expect(fetchNextPage).toHaveBeenCalledOnce();
  });

  it('conserve les cartes en cas d’erreur sur la page suivante', () => {
    const fetchNextPage = vi.fn();
    mockInfinitePlaces.mockReturnValue({
      isLoading: false, isError: true, isFetchNextPageError: true, isFetchingNextPage: false,
      error: new Error('offline'), data: { pages: [{ items: [placeFixture], nextCursor: 'next' }] },
      hasNextPage: true, fetchNextPage,
    });
    renderList();
    expect(screen.getByTestId(`place-card-${placeFixture.id}`)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }));
    expect(fetchNextPage).toHaveBeenCalledOnce();
  });
});
