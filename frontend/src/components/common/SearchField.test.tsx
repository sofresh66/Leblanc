// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SEARCH_DEBOUNCE_MS, SearchField } from './SearchField';

function Location() {
  return <output data-testid="location">{useLocation().search}</output>;
}

function renderField(initial = '/fr/liste', resetParams?: string[]) {
  return render(<MemoryRouter initialEntries={[initial]}>
    <SearchField label="Rechercher" placeholder="Titre" clearLabel="Effacer" {...(resetParams ? { resetParams } : {})} />
    <Location />
  </MemoryRouter>);
}

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('SearchField', () => {
  it('écrit q dans l’URL après 300 ms, espaces normalisés', () => {
    renderField('/fr/liste?category=sport');
    fireEvent.change(screen.getByLabelText('Rechercher'), { target: { value: '  soirée   choucroute ' } });
    act(() => { vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS - 1); });
    expect(screen.getByTestId('location').textContent).toBe('?category=sport');
    act(() => { vi.advanceTimersByTime(1); });
    expect(new URLSearchParams(screen.getByTestId('location').textContent ?? '').get('q')).toBe('soirée choucroute');
    expect(new URLSearchParams(screen.getByTestId('location').textContent ?? '').get('category')).toBe('sport');
  });

  it('reprend q depuis l’URL, retire q quand le champ est vidé et efface le curseur demandé', () => {
    renderField('/fr/ou-manger?q=pizza&cursor=abc', ['cursor']);
    expect((screen.getByLabelText('Rechercher') as HTMLInputElement).value).toBe('pizza');
    fireEvent.click(screen.getByRole('button', { name: 'Effacer' }));
    act(() => { vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS); });
    expect(screen.getByTestId('location').textContent).toBe('');
  });

  it('expose un rôle search et limite la saisie à 80 caractères', () => {
    renderField();
    expect(screen.getByRole('search')).toBeTruthy();
    expect(screen.getByLabelText('Rechercher').getAttribute('maxLength')).toBe('80');
  });
});
