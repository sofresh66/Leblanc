import { describe, expect, it } from 'vitest';
import type { OpeningHoursRule } from '@leblanc/shared';
import { groupOpeningHoursByDay } from './openingHours';

const rule: OpeningHoursRule = {
  id: 'b1000000-0000-4000-8000-000000000001',
  placeId: 'a1000000-0000-4000-8000-000000000001',
  validFrom: null, validThrough: null,
  dayOfWeek: [1], opens: '12:00:00', closes: '14:00:00', weekOfMonth: null,
};

describe('groupOpeningHoursByDay', () => {
  const monday = new Date('2026-09-28T10:00:00Z');

  it('produit sept jours du lundi au dimanche et regroupe les services multiples', () => {
    const days = groupOpeningHoursByDay([
      rule,
      { ...rule, id: 'b1000000-0000-4000-8000-000000000002', opens: '19:00:00', closes: '22:00:00' },
    ], monday);
    expect(days).toHaveLength(7);
    expect(days[0]).toMatchObject({ date: '2026-09-28', dayOfWeek: 1, isToday: true });
    expect(days[6]?.date).toBe('2026-10-04');
    expect(days[0]?.slots.map(({ opens }) => opens)).toEqual(['12:00:00', '19:00:00']);
    expect(days[1]?.slots).toEqual([]);
  });

  it('respecte les périodes de validité et le rang de semaine', () => {
    const days = groupOpeningHoursByDay([
      { ...rule, validFrom: '2026-10-01' },
      { ...rule, opens: '08:00:00', closes: '09:00:00', weekOfMonth: 0 },
      { ...rule, opens: '10:00:00', closes: '11:00:00', weekOfMonth: 1 },
    ], monday);
    expect(days[0]?.slots.map(({ opens }) => opens)).toEqual(['08:00:00']);
  });

  it('signale les services de nuit et les horaires indéterminés', () => {
    const days = groupOpeningHoursByDay([
      { ...rule, opens: '19:00:00', closes: '02:00:00' },
      { ...rule, opens: '00:00:00', closes: '00:00:00' },
    ], monday);
    expect(days[0]?.slots[0]?.overnight).toBe(true);
    expect(days[0]?.indeterminate).toBe(true);
  });

  it('prend le jour de Paris, même quand UTC indique encore dimanche', () => {
    const days = groupOpeningHoursByDay([rule], new Date('2026-09-27T22:30:00Z'));
    expect(days[0]).toMatchObject({ date: '2026-09-28', isToday: true });
  });
});
