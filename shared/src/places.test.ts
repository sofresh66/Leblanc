import { describe, expect, it } from 'vitest';
import {
  OpeningHoursRuleSchema,
  PlaceListParamsSchema,
  PlacePriceDetailSchema,
} from './schemas.js';

describe('contrats partagés des lieux', () => {
  const rule = {
    id: '03bd32d0-2c79-433a-aecb-2a00d4cf3835',
    placeId: '03bd32d0-2c79-433a-aecb-2a00d4cf3835',
    validFrom: null,
    validThrough: null,
    dayOfWeek: [1, 7],
    opens: '18:00:00',
    closes: '02:00:00',
    weekOfMonth: null,
  };
  it('accepte un service de nuit et une validité non bornée', () => {
    expect(OpeningHoursRuleSchema.safeParse(rule).success).toBe(true);
  });
  it.each([
    { dayOfWeek: [] },
    { dayOfWeek: [0] },
    { dayOfWeek: [1, 1] },
    { opens: '24:00:00' },
    { validFrom: '2026-02-30' },
    { validFrom: '2026-12-31', validThrough: '2026-01-01' },
  ])('rejette une règle inutilisable %j', (patch) => {
    expect(OpeningHoursRuleSchema.safeParse({ ...rule, ...patch }).success).toBe(false);
  });
  it('valide les filtres dédiés et leurs limites', () => {
    expect(PlaceListParamsSchema.parse({})).toEqual({ lang: 'fr', limit: 20 });
    expect(
      PlaceListParamsSchema.safeParse({ types: ['cafe', 'bar'], takeaway: true }).success,
    ).toBe(true);
    expect(PlaceListParamsSchema.safeParse({ maxDistance: 20001 }).success).toBe(false);
    expect(PlaceListParamsSchema.safeParse({ types: ['culture'] }).success).toBe(false);
  });
  it('refuse une fourchette inversée', () => {
    expect(
      PlacePriceDetailSchema.safeParse({
        label_i18n: {},
        policies: [],
        offers: [],
        priceRangeMin: 40,
        priceRangeMax: 20,
        currency: 'EUR',
      }).success,
    ).toBe(false);
  });
});
