// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { PlaceCard } from './PlaceCard';
import { PlaceStatusBadge } from './PlaceBadges';
import { placeFixture } from './__tests__/fixture';
import { testI18n } from './__tests__/testI18n';

function renderCard(place = placeFixture) {
  return render(<I18nextProvider i18n={testI18n}><MemoryRouter><PlaceCard place={place} /></MemoryRouter></I18nextProvider>);
}

afterEach(async () => { cleanup(); await testI18n.changeLanguage('fr'); });

describe('PlaceCard et PlaceBadges', () => {
  it('affiche un placeholder, l’adresse, le prix, la distance et le lien français', () => {
    renderCard();
    expect(screen.getByText('La Table')).toBeTruthy();
    expect(screen.getByText('1 rue du Centre, 36300, Le Blanc')).toBeTruthy();
    expect(screen.getByText('15–30 €')).toBeTruthy();
    expect(screen.getByText('1,5 km')).toBeTruthy();
    expect(screen.getByText('Horaires non renseignés')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Voir la fiche de La Table' }).getAttribute('href'))
      .toBe(`/fr/lieux/${placeFixture.id}`);
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('affiche une image et passe au placeholder si elle échoue', () => {
    const { container } = renderCard({ ...placeFixture, imageUrl: 'https://example.test/image.jpg' });
    const image = container.querySelector('img');
    expect(image).not.toBeNull();
    if (!image) throw new Error('Image de test absente');
    fireEvent.error(image);
    expect(container.querySelector('img')).toBeNull();
  });

  it('choisit le visuel et la couleur selon le type de lieu', () => {
    const { container, rerender } = renderCard({ ...placeFixture, type: 'bar', imageUrl: null });
    expect(container.querySelector('[aria-hidden="true"][style]')?.getAttribute('style')).toContain('rgb(232, 240, 224)');
    rerender(<I18nextProvider i18n={testI18n}><MemoryRouter>
      <PlaceCard place={{ ...placeFixture, type: 'fast_food', imageUrl: null }} />
    </MemoryRouter></I18nextProvider>);
    expect(container.querySelector('[aria-hidden="true"][style]')?.getAttribute('style')).toContain('rgb(250, 240, 224)');
  });

  it('n’affiche pas de distance inventée sans coordonnées', () => {
    renderCard({ ...placeFixture, latitude: null, longitude: null, distance: null });
    expect(screen.getByText('La Table')).toBeTruthy();
    expect(screen.queryByText(/km/)).toBeNull();
  });

  it('affiche un prix à partir du minimum et traduit le lien anglais', async () => {
    await testI18n.changeLanguage('en');
    renderCard({ ...placeFixture, priceRangeMax: null, isOpenNow: true });
    expect(screen.getByText('From 15 €')).toBeTruthy();
    expect(screen.getByText('Open')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'View details for La Table' }).getAttribute('href'))
      .toBe(`/en/places/${placeFixture.id}`);
  });

  it.each([
    [true, 'Ouvert'], [false, 'Fermé'], [null, 'Horaires non renseignés'],
  ] as const)('distingue le statut %s', (status, label) => {
    render(<I18nextProvider i18n={testI18n}><PlaceStatusBadge isOpenNow={status} /></I18nextProvider>);
    expect(screen.getByTestId('place-status').textContent).toContain(label);
  });
});
