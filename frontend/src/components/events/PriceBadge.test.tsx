// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { createInstance } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import fr from '../../../public/locales/fr/events.json';
import { PriceBadge } from './PriceBadge';

afterEach(cleanup);

describe('Badge tarifaire', () => {
  it.each([
    { isFree: true, priceMin: null, label: 'Gratuit', color: 'bg-green-100' },
    { isFree: false, priceMin: 15, label: /Dès 15/, color: 'bg-orange-100' },
    { isFree: false, priceMin: null, label: 'Payant', color: 'bg-orange-100' },
    { isFree: null, priceMin: null, label: 'Tarif non précisé', color: 'bg-gray-100' },
  ])('affiche $label', async ({ isFree, priceMin, label, color }) => {
    const i18n = createInstance();
    await i18n.init({ lng: 'fr', resources: { fr: { events: fr } }, defaultNS: 'events' });
    render(<I18nextProvider i18n={i18n}>
      <PriceBadge event={{ isFree, priceMin, currency: 'EUR' }} />
    </I18nextProvider>);
    expect(screen.getByText(label).classList.contains(color)).toBe(true);
  });
});
