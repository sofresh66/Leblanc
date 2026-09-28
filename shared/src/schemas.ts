import { z } from 'zod';
import { CATEGORIES, DEFAULT_CURRENCY, DEFAULT_TIMEZONE } from './constants.js';

export const SupportedContentLanguageSchema = z.enum(['fr', 'en', 'es', 'de', 'it', 'nl']);
export const SupportedLanguageSchema = SupportedContentLanguageSchema;

export const EventCategorySchema = z.enum(CATEGORIES);

export const EventI18nTitleSchema = z.object({
  fr: z.string().min(1),
  en: z.string().min(1).optional(),
  es: z.string().min(1).optional(),
  de: z.string().min(1).optional(),
  it: z.string().min(1).optional(),
  nl: z.string().min(1).optional(),
});

export const EventI18nDescriptionSchema = z.object({
  fr: z.string(),
  en: z.string().optional(),
  es: z.string().optional(),
  de: z.string().optional(),
  it: z.string().optional(),
  nl: z.string().optional(),
});

// Schéma brut de stockage (avec title_i18n et description_i18n)
export const RawEventSchema = z.object({
  id: z.string().uuid(),
  title_i18n: EventI18nTitleSchema,
  description_i18n: EventI18nDescriptionSchema,
  category: EventCategorySchema,
  startDate: z.string().datetime({ offset: true }),
  endDate: z.string().datetime({ offset: true }).nullable(),
  timezone: z.string().default(DEFAULT_TIMEZONE),
  venueName: z.string().nullable(),
  address: z.string().nullable(),
  postalCode: z.string().nullable(),
  city: z.string().nullable(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  // URL absolue (http/https) OU chemin relatif commençant par / (assets servis
  // depuis frontend/public, ex : /images/culture.jpg), OU null si pas d'image.
  imageUrl: z
    .string()
    .refine((val) => val.startsWith('/') || /^https?:\/\//i.test(val), {
      message:
        'imageUrl doit être une URL complète (http/https) ou un chemin relatif commençant par /',
    })
    .nullable(),
  // null : aucune information tarifaire structurée exploitable.
  isFree: z.boolean().nullable(),
  priceMin: z.number().nonnegative().nullable(),
  currency: z.string().default(DEFAULT_CURRENCY),
  publicUrl: z.string().url().nullable(),
  source: z.string().min(1),
});

// Schéma d'événement résolu pour le client (titre/description résolus selon la langue avec repli)
export const EventSchema = RawEventSchema.extend({
  title: z.string().min(1),
  description: z.string(),
  contentLanguage: SupportedContentLanguageSchema,
  isFallback: z.boolean(),
  distance: z.number().nonnegative(), // en mètres calculés depuis LE_BLANC_CENTER
});

export const EventListParamsSchema = z.object({
  lang: z.string().min(2).max(5),
  from: z.string().optional(),
  to: z.string().optional(),
  categories: z.array(EventCategorySchema).optional(),
  isFree: z.boolean().optional(),
  maxDistance: z.number().min(1).max(20000).optional(),
  distance: z.number().min(1).max(20000).optional(),
  city: z.string().trim().min(1).optional(),
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(50).default(20),
});

// Input = ce que l'appelant peut passer (limit optionnel)
export type EventListParamsInput = z.input<typeof EventListParamsSchema>;
// Output = ce que le repository reçoit après parsing (limit garanti)
export type EventListParams = z.output<typeof EventListParamsSchema>;

export const EventListResponseSchema = z.object({
  items: z.array(EventSchema),
  nextCursor: z.string().nullable(),
  generatedAt: z.string(),
  total: z.number().int().nonnegative().optional(),
});

export const EventOccurrenceSchema = z.object({
  id: z.string().uuid(),
  startDate: z.string().datetime({ offset: true }),
  endDate: z.string().datetime({ offset: true }).nullable(),
  timezone: z.string().default(DEFAULT_TIMEZONE),
});

export const EventDetailSchema = EventSchema.extend({
  occurrences: z.array(EventOccurrenceSchema),
});

export const ApiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    requestId: z.string().optional(),
  }),
});

export const CursorPayloadSchema = z.object({
  d: z.string().datetime({ offset: true, message: 'Invalid ISO date string' }).refine(
    (value) => !value.startsWith('0000') && Number.isFinite(Date.parse(value)),
    { message: 'Invalid ISO date string' },
  ),
  i: z.string().uuid(),
});

// Contrats des lieux permanents, indépendants des événements.
export const PlaceTypeSchema = z.enum([
  'restaurant',
  'bar',
  'cafe',
  'fast_food',
  'food_truck',
  'other_food',
]);

const PlaceTranslationsSchema = z.object({
  fr: z.string().min(1).optional(),
  en: z.string().min(1).optional(),
  es: z.string().min(1).optional(),
  de: z.string().min(1).optional(),
  it: z.string().min(1).optional(),
  nl: z.string().min(1).optional(),
});
const PlaceUrlSchema = z
  .string()
  .url()
  .refine((value) => /^https?:\/\//i.test(value));
const PlacePriceSchema = z.number().nonnegative().max(99999999.99);
const orderedPrices = (value: { priceRangeMin: number | null; priceRangeMax: number | null }) =>
  value.priceRangeMin === null ||
  value.priceRangeMax === null ||
  value.priceRangeMin <= value.priceRangeMax;

export const PlacePriceDetailSchema = z
  .object({
    label_i18n: PlaceTranslationsSchema,
    policies: z.array(z.string().min(1)),
    offers: z.array(z.string().min(1)),
    priceRangeMin: PlacePriceSchema.nullable(),
    priceRangeMax: PlacePriceSchema.nullable(),
    currency: z
      .string()
      .regex(/^[A-Z]{3}$/)
      .nullable(),
  })
  .refine(orderedPrices, { message: 'Fourchette de prix inversée' });

export const OpeningHoursRuleSchema = z
  .object({
    id: z.string().uuid(),
    placeId: z.string().uuid(),
    validFrom: z.iso.date().nullable(),
    validThrough: z.iso.date().nullable(),
    dayOfWeek: z
      .array(z.number().int().min(1).max(7))
      .min(1)
      .max(7)
      .refine((days) => new Set(days).size === days.length),
    opens: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d$/),
    closes: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d$/),
    weekOfMonth: z.number().int().min(0).max(5).nullable(),
  })
  .refine((rule) => !rule.validFrom || !rule.validThrough || rule.validFrom <= rule.validThrough, {
    message: 'Période de validité inversée',
  });

export const RawPlaceSchema = z
  .object({
    id: z.string().uuid(),
    type: PlaceTypeSchema,
    subtypes: z.array(z.string().min(1)),
    title_i18n: PlaceTranslationsSchema.refine((value) => Object.keys(value).length > 0),
    description_i18n: PlaceTranslationsSchema,
    sourceLanguage: SupportedContentLanguageSchema,
    venueName: z.string().nullable(),
    address: z.string().nullable(),
    postalCode: z.string().nullable(),
    city: z.string().nullable(),
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
    phone: z.string().nullable(),
    email: z.string().email().nullable(),
    website: PlaceUrlSchema.nullable(),
    imageUrl: PlaceUrlSchema.nullable(),
    publicUrl: PlaceUrlSchema.nullable(),
    cuisines: z.array(z.string().min(1)),
    priceRangeMin: PlacePriceSchema.nullable(),
    priceRangeMax: PlacePriceSchema.nullable(),
    currency: z
      .string()
      .regex(/^[A-Z]{3}$/)
      .default(DEFAULT_CURRENCY),
    priceDetails: z.array(PlacePriceDetailSchema),
    takeaway: z.boolean().nullable(),
    openingHoursStatus: z.enum(['unknown', 'partial', 'provided']),
    status: z.enum(['published', 'hidden', 'closed']),
    normalizedTitle: z.string().min(1),
  })
  .refine(orderedPrices, { message: 'Fourchette de prix inversée' });

export const PlaceSchema = RawPlaceSchema.safeExtend({
  title: z.string().min(1),
  description: z.string(),
  contentLanguage: SupportedContentLanguageSchema,
  isFallback: z.boolean(),
  distance: z.number().nonnegative(),
  source: z.string().min(1),
});

export const PlaceSourceRecordSchema = z.object({
  id: z.string().uuid(),
  source: z.string().min(1),
  externalId: z.string().min(1),
  placeId: z.string().uuid(),
  sourceUrl: PlaceUrlSchema.nullable(),
  sourceUpdatedAt: z.string().datetime({ offset: true }).nullable(),
  rawExcerpt: z.record(z.string(), z.unknown()).nullable(),
  lastSeenAt: z.string().datetime({ offset: true }),
});

export const PlaceDetailSchema = PlaceSchema.safeExtend({
  openingHours: z.array(OpeningHoursRuleSchema),
});

export const PlaceListParamsSchema = z.object({
  lang: SupportedContentLanguageSchema.default('fr'),
  types: z.array(PlaceTypeSchema).optional(),
  cuisines: z.array(z.string().trim().min(1)).optional(),
  takeaway: z.boolean().optional(),
  maxDistance: z.number().min(1).max(20000).optional(),
  city: z.string().trim().min(1).optional(),
  cursor: z.string().min(1).optional(),
  limit: z.number().int().min(1).max(50).default(20),
});

export const PlaceListResponseSchema = z.object({
  items: z.array(PlaceSchema),
  nextCursor: z.string().nullable(),
  generatedAt: z.string().datetime({ offset: true }),
  total: z.number().int().nonnegative().optional(),
});

// Contrats HTTP V2 : les schémas de stockage et de la V2 Lot 1 restent inchangés.
export const PlaceApiListParamsSchema = PlaceListParamsSchema.safeExtend({
  isOpenNow: z.boolean().optional(),
});

export const PlaceApiSchema = PlaceDetailSchema.safeExtend({
  isOpenNow: z.boolean().nullable(),
  openingHoursRaw: z.string().nullable().optional(),
});

export const PlaceApiListResponseSchema = z.object({
  items: z.array(PlaceApiSchema),
  nextCursor: z.string().nullable(),
  generatedAt: z.string().datetime({ offset: true }),
});

export const PlaceCategoriesResponseSchema = z.object({
  types: z.array(z.object({ value: PlaceTypeSchema, count: z.number().int().nonnegative() })),
  cuisines: z.array(z.object({ value: z.string().min(1), count: z.number().int().nonnegative() })),
});
