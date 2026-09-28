// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { OpeningHoursRule } from '@leblanc/shared';
import { OpeningHoursTable } from './OpeningHoursTable';
import { testI18n } from './__tests__/testI18n';

const rule: OpeningHoursRule = {
  id: 'b1000000-0000-4000-8000-000000000001',
  placeId: 'a1000000-0000-4000-8000-000000000001',
  validFrom: null, validThrough: null,
  dayOfWeek: [1], opens: '12:00:00', closes: '14:00:00', weekOfMonth: null,
};

function renderTable(rules: OpeningHoursRule[], status: 'provided' | 'partial' | 'unknown' = 'provided') {
  return render(<I18nextProvider i18n={testI18n}><OpeningHoursTable rules={rules} status={status} /></I18nextProvider>);
}

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-28T10:00:00Z')); });
afterEach(async () => { cleanup(); vi.useRealTimers(); await testI18n.changeLanguage('fr'); });

describe('OpeningHoursTable', () => {
  it('affiche sept jours, les créneaux multiples, le jour actuel et les jours fermés', () => {
    renderTable([rule, { ...rule, id: 'b1000000-0000-4000-8000-000000000002', opens: '19:00:00', closes: '22:00:00' }]);
    expect(screen.getAllByTestId(/hours-day-/)).toHaveLength(7);
    expect(screen.getByTestId('hours-day-1').textContent).toContain('12:00–14:00');
    expect(screen.getByTestId('hours-day-1').textContent).toContain('19:00–22:00');
    expect(screen.getByTestId('hours-day-1').textContent).toContain('Aujourd’hui');
    expect(screen.getByTestId('hours-day-2').textContent).toContain('Fermé');
  });

  it('affiche le statut inconnu quand aucune règle n’est disponible', () => {
    renderTable([], 'unknown');
    expect(screen.getByText('Horaires non renseignés')).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('ne présente pas comme fermé un jour non couvert par des horaires partiels', () => {
    renderTable([rule], 'partial');
    expect(screen.getByTestId('hours-day-2').textContent).toContain('Horaires non renseignés');
    expect(screen.getByText(/Ces horaires sont partiels/)).toBeTruthy();
  });
});
