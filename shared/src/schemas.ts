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
  imageUrl: z.string().url().nullable(),
  isFree: z.boolean(),
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
