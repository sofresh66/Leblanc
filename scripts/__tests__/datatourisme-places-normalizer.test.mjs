import { describe, expect, it } from 'vitest';
import { RawPlaceSchema, OpeningHoursRuleSchema } from '@leblanc/shared';
import {
  classifyPlace,
  normalizeDatatourismePlace,
  normalizeOpeningHours,
  normalizePlacePricing,
} from '../lib/datatourisme-places-normalizer.mjs';

// Formes et valeurs issues du probe réel du 27/09/2026 ; textes descriptifs omis.
const fixture = () => ({
  uuid: '03bd32d0-2c79-333a-aecb-2a00d4cf3835',
  uri: 'https://data.datatourisme.fr/15/7189cec0-3206-3ffa-afbe-4412c9884d14',
  label: { '@fr': 'Les Rives de la Creuse', '@en': 'Les Rives de la Creuse' },
  type: [
    'BrasserieOrTavern',
    'PlaceOfInterest',
    'FoodEstablishment',
    'PointOfInterest',
    'Restaurant',
  ],
  lastUpdate: '2026-08-13',
  isLocatedAt: [
    {
      geo: { latitude: 46.6353214, longitude: 1.28616238 },
      address: [{ streetAddress: ['Scoury'], postalCode: '36300', addressLocality: 'Ciron' }],
    },
  ],
  hasContact: [
    {
      telephone: ['+33 2 54 37 44 58'],
      homepage: ['https://www.facebook.com/lesrivesdelacreuse.scoury.3'],
    },
  ],
  providesCuisineOfType: [{ key: 'TraditionalCuisine' }],
  offers: [
    {
      priceSpecification: [
        {
          additionalInformation: { '@fr': 'Menu du jour' },
          priceCurrency: 'EUR',
          price: 18,
          minPrice: [18],
          hasEligiblePolicy: [{ key: 'BaseRateFullRate' }],
        },
        {
          priceCurrency: 'EUR',
          price: 10,
          minPrice: [10],
          hasEligiblePolicy: [{ key: 'ChildRate' }],
        },
      ],
    },
  ],
  hasFeature: [{ features: [{ key: 'TakeawayFoodOrMeals' }] }],
});
const rule = () => ({
  validFrom: '2026-06-30T22:00:00Z',
  validThrough: '2026-08-30T22:00:00Z',
  dayOfWeek: [{ label: { '@fr': 'Mercredi', '@en': 'Wednesday' } }],
  opens: '08:00',
  closes: '21:00',
});
const hours = (specs) => normalizeOpeningHours({}, { openingHoursSpecification: specs });
const uuid = '03bd32d0-2c79-433a-aecb-2a00d4cf3835';

describe('normaliseur des lieux DATAtourisme', () => {
  it('mappe le probe réel sans confondre enfant et plein tarif', () => {
    const result = normalizeDatatourismePlace(fixture());
    expect(result.ok).toBe(true);
    expect(result.place).toMatchObject({
      type: 'restaurant',
      city: 'Ciron',
      priceRangeMin: 18,
      priceRangeMax: 18,
      takeaway: true,
      openingHoursStatus: 'unknown',
      cuisines: ['TraditionalCuisine'],
    });
    expect(result.place.priceDetails[1]).toMatchObject({
      priceRangeMin: 10,
      policies: ['ChildRate'],
    });
    expect(result.place.priceDetails[0].label_i18n.fr).toBe('Menu du jour');
    expect(RawPlaceSchema.safeParse({ id: uuid, ...result.place }).success).toBe(true);
  });

  it.each([
    [['Restaurant', 'FastFoodRestaurant'], 'fast_food'],
    [['FastFoodRestaurant', 'StreetFood'], 'food_truck'],
    [['Restaurant', 'CafeOrTeahouse', 'BistroOrWineBar'], 'cafe'],
    [['Restaurant', 'BistroOrWineBar'], 'bar'],
    [['BarOrPub'], 'bar'],
    [['FoodEstablishment'], 'other_food'],
    [['Hotel'], null],
  ])('classe %j sans perdre les autres classifications', (types, expected) => {
    expect(classifyPlace(types)).toBe(expected);
  });

  it('préserve les données absentes sans prix, photo, horaires ou vente à emporter inventés', () => {
    const raw = fixture();
    delete raw.offers;
    delete raw.hasFeature;
    delete raw.hasContact;
    const { place, openingHours } = normalizeDatatourismePlace(raw);
    expect(place).toMatchObject({
      priceRangeMin: null,
      priceRangeMax: null,
      imageUrl: null,
      email: null,
      phone: null,
      website: null,
      takeaway: null,
      openingHoursStatus: 'unknown',
      description_i18n: {},
    });
    expect(openingHours).toEqual([]);
  });

  it('ne copie pas une traduction dans une langue absente', () => {
    const raw = fixture();
    raw.label = { '@en': 'English title' };
    const { place } = normalizeDatatourismePlace(raw);
    expect(place.sourceLanguage).toBe('en');
    expect(place.title_i18n).toEqual({ en: 'English title' });
  });

  it('prend les descriptions disponibles pour chaque langue', () => {
    const raw = fixture();
    raw.hasDescription = [
      { description: { '@fr': 'Description' }, shortDescription: { '@en': 'Summary' } },
    ];
    expect(normalizeDatatourismePlace(raw).place.description_i18n).toEqual({
      fr: 'Description',
      en: 'Summary',
    });
  });

  it.each([null, { latitude: 91, longitude: 1 }, { latitude: 48.85, longitude: 2.35 }])(
    'rejette des coordonnées absentes, invalides ou hors rayon : %j',
    (geo) => {
      const raw = fixture();
      raw.isLocatedAt = [{ geo }];
      expect(normalizeDatatourismePlace(raw).ok).toBe(false);
    },
  );

  it('cherche une représentation secondaire et garde ses crédits', () => {
    const raw = fixture();
    raw.hasMainRepresentation = [{ hasRelatedResource: [{ locator: ['javascript:alert(1)'] }] }];
    raw.hasRepresentation = [
      {
        hasRelatedResource: [{ locator: ['https://example.org/photo.jpg'] }],
        hasAnnotation: [{ credits: ['Photographe'] }],
      },
    ];
    const result = normalizeDatatourismePlace(raw);
    expect(result.place.imageUrl).toBe('https://example.org/photo.jpg');
    expect(result.rawExcerpt.imageAnnotations[0].credits).toEqual(['Photographe']);
  });
});

describe('règles horaires normalisées', () => {
  it('convertit la validité UTC en jour civil Paris, été et hiver', () => {
    const result = hours([
      rule(),
      { ...rule(), validFrom: '2025-12-31T23:00:00Z', validThrough: '2026-12-30T23:00:00Z' },
    ]);
    expect(result.openingHours[0]).toMatchObject({
      validFrom: '2026-07-01',
      validThrough: '2026-08-31',
      dayOfWeek: [3],
      opens: '08:00:00',
      closes: '21:00:00',
    });
    expect(result.openingHours[1]).toMatchObject({
      validFrom: '2026-01-01',
      validThrough: '2026-12-31',
    });
    expect(
      OpeningHoursRuleSchema.safeParse({ id: uuid, placeId: uuid, ...result.openingHours[0] })
        .success,
    ).toBe(true);
  });

  it('conserve plusieurs services et le passage minuit, sans doublons', () => {
    const lunch = { ...rule(), opens: '12:00', closes: '14:00' };
    const dinner = { ...rule(), opens: '18:00', closes: '02:00' };
    const result = hours([lunch, dinner, lunch]);
    expect(result.openingHours).toHaveLength(2);
    expect(result.openingHours[1].closes).toBe('02:00:00');
  });

  it('déploie plusieurs semaines dont Week0 (dernière semaine)', () => {
    const result = hours([{ ...rule(), weekOfMonth: [{ key: 'Week0' }, { key: 'Week2' }] }]);
    expect(result.openingHours.map((item) => item.weekOfMonth)).toEqual([0, 2]);
  });

  it.each([
    { opens: '25:00' },
    { closes: null },
    { dayOfWeek: [] },
    { dayOfWeek: [{ key: 'PublicHoliday' }] },
    { validFrom: '2026-02-30' },
    { validThrough: '2020-01-01' },
    { weekOfMonth: [{ key: 'Unknown' }] },
  ])('signale une règle partielle sans compléter les valeurs : %j', (patch) => {
    const result = hours([rule(), { ...rule(), ...patch }]);
    expect(result.openingHoursStatus).toBe('partial');
    expect(result.openingHours).toHaveLength(1);
    expect(result.rejected).toBe(1);
  });

  it('horaires absents ou entièrement invalides restent inconnus', () => {
    expect(hours([]).openingHoursStatus).toBe('unknown');
    expect(hours([null]).openingHoursStatus).toBe('unknown');
    expect(hours('12h-14h').openingHoursStatus).toBe('unknown');
  });

  it('préserve opens=closes sans en déduire fermé ou ouvert 24h', () => {
    expect(hours([{ ...rule(), opens: '00:00', closes: '00:00' }]).openingHours).toHaveLength(1);
  });
});

describe('tarifs des lieux', () => {
  const pricing = (...specs) => normalizePlacePricing([{ priceSpecification: specs }]);
  const adult = { hasEligiblePolicy: [{ key: 'BaseRateFullRate' }], priceCurrency: 'EUR' };

  it('conserve une fourchette adulte et les offres carte/enfant distinctes', () => {
    const result = pricing(
      { ...adult, minPrice: [19], maxPrice: [35], price: 19 },
      { price: 15, priceCurrency: 'EUR', hasEligiblePolicy: [{ key: 'ChildRate' }] },
      { price: 40, priceCurrency: 'EUR', additionalInformation: { '@fr': 'À la carte' } },
    );
    expect(result).toMatchObject({ priceRangeMin: 19, priceRangeMax: 35 });
    expect(result.priceDetails).toHaveLength(3);
  });

  it('ne transforme pas un minimum en maximum', () => {
    expect(pricing({ ...adult, minPrice: [18] })).toMatchObject({
      priceRangeMin: 18,
      priceRangeMax: null,
    });
  });

  it('ne mélange pas les devises et ne suppose pas celle d’un tarif inconnu', () => {
    expect(
      pricing({ ...adult, price: 18 }, { ...adult, price: 20, priceCurrency: 'USD' }),
    ).toMatchObject({ priceRangeMin: null, priceRangeMax: null });
    expect(pricing({ price: 18 }).priceDetails[0].currency).toBeNull();
  });

  it.each([null, { price: -1 }, { price: '18' }, { minPrice: [30], maxPrice: [20] }])(
    'signale les tarifs invalides : %j',
    (spec) => {
      expect(pricing(spec)).toMatchObject({
        priceRangeMin: null,
        priceRangeMax: null,
        rejected: 1,
      });
    },
  );
});
