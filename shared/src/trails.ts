import { z } from 'zod';
import { SupportedContentLanguageSchema } from './schemas.js';

// Contrat HTTP des parcours « Se balader » (/api/v1/routes). Préfixe « Trail »
// pour ne pas confondre avec les routes localisées du site (routes.ts).

export const TRAIL_MODES = ['foot', 'bike', 'mtb', 'horse'] as const;
export const TrailModeSchema = z.enum(TRAIL_MODES);
/** Vue par défaut : à pied, vélo et VTT ; l'équitation seulement sur demande. */
export const DEFAULT_TRAIL_MODES: readonly TrailMode[] = ['foot', 'bike', 'mtb'];
export const TRAIL_LIST_MAX_LIMIT = 50;
export const TRAIL_NEARBY_RADIUS_M = 5000;

// Textes d'attribution servis tels quels par l'API (affichés par le front).
export const OSM_ATTRIBUTION_TEXT = '© contributeurs OpenStreetMap, ODbL';
export const OSM_COPYRIGHT_URL = 'https://www.openstreetmap.org/copyright';
export const ODBL_LICENSE_URL = 'https://opendatacommons.org/licenses/odbl/1-0/';
export const DATATOURISME_ATTRIBUTION_TEXT = 'DATAtourisme';
export const LICENCE_OUVERTE_URL = 'https://www.etalab.gouv.fr/licence-ouverte-open-licence/';

const HttpUrlSchema = z.string().url().refine((value) => /^https?:\/\//i.test(value));
const PointSchema = z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) });
const PositionSchema = z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]);

/** Tracé GeoJSON : plusieurs morceaux quand la relation OSM n'est pas continue. */
export const TrailTrackSchema = z.object({
  type: z.literal('MultiLineString'),
  coordinates: z.array(z.array(PositionSchema).min(2)).min(1),
});

export const TrailAttributionSchema = z.object({
  source: z.enum(['datatourisme', 'osm']),
  text: z.string().min(1),
  license: z.string().min(1),
  licenseUrl: HttpUrlSchema,
  url: HttpUrlSchema.nullable(),
  /** Producteur de la fiche (DATAtourisme). */
  producer: z.string().min(1).nullable(),
  /** Relation OSM d'où provient le tracé. */
  osmRelationId: z.number().int().positive().nullable(),
});

export const TrailSummarySchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1),
  contentLanguage: SupportedContentLanguageSchema,
  modes: z.array(TrailModeSchema).min(1),
  /** null : la source ne dit pas si c'est une boucle. */
  isLoop: z.boolean().nullable(),
  distanceM: z.number().int().positive().nullable(),
  durationMin: z.number().int().positive().nullable(),
  durationDays: z.number().positive().nullable(),
  start: PointSchema,
  startCity: z.string().nullable(),
  distanceFromLeBlancM: z.number().int().nonnegative(),
  hasTrack: z.boolean(),
  imageUrl: HttpUrlSchema.nullable(),
  imageCredit: z.string().nullable(),
  imageLicense: z.string().nullable(),
  officialUrl: HttpUrlSchema.nullable(),
  producer: z.string().nullable(),
  updatedAt: z.string().datetime({ offset: true }),
});

export const TrailDetailSchema = TrailSummarySchema.extend({
  description: z.string(),
  descriptionLanguage: SupportedContentLanguageSchema,
  isFallback: z.boolean(),
  startPostalCode: z.string().nullable(),
  /** Tracé allégé (environ 15 m) pour la carte, null sans tracé sûr. */
  track: TrailTrackSchema.nullable(),
  osmRelationId: z.number().int().positive().nullable(),
  gpxAvailable: z.boolean(),
  attributions: z.array(TrailAttributionSchema).min(1),
});

export const TrailListResponseSchema = z.object({
  items: z.array(TrailSummarySchema),
  nextCursor: z.string().nullable(),
  attributions: z.array(TrailAttributionSchema),
  generatedAt: z.string().datetime({ offset: true }),
});

export const TrailGeoItemSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1),
  modes: z.array(TrailModeSchema).min(1),
  isLoop: z.boolean().nullable(),
  distanceM: z.number().int().positive().nullable(),
  start: PointSchema,
  hasTrack: z.boolean(),
  track: TrailTrackSchema.nullable(),
  osmRelationId: z.number().int().positive().nullable(),
});

export const TrailGeoResponseSchema = z.object({
  items: z.array(TrailGeoItemSchema),
  attributions: z.array(TrailAttributionSchema),
  truncated: z.boolean(),
  generatedAt: z.string().datetime({ offset: true }),
});

export const TrailNearbyResponseSchema = z.object({
  radiusM: z.number().int().positive(),
  events: z.array(z.object({
    id: z.string().uuid(),
    title: z.string().min(1),
    startDate: z.string().datetime({ offset: true }),
    endDate: z.string().datetime({ offset: true }).nullable(),
    allDay: z.boolean(),
    timezone: z.string().min(1),
    city: z.string().nullable(),
    distanceFromStartM: z.number().int().nonnegative(),
  })),
  places: z.array(z.object({
    id: z.string().uuid(),
    title: z.string().min(1),
    type: z.string().min(1),
    city: z.string().nullable(),
    distanceFromStartM: z.number().int().nonnegative(),
  })),
  generatedAt: z.string().datetime({ offset: true }),
});

export type TrailMode = z.infer<typeof TrailModeSchema>;
export type TrailTrack = z.infer<typeof TrailTrackSchema>;
export type TrailAttribution = z.infer<typeof TrailAttributionSchema>;
export type TrailSummary = z.infer<typeof TrailSummarySchema>;
export type TrailDetail = z.infer<typeof TrailDetailSchema>;
export type TrailListResponse = z.infer<typeof TrailListResponseSchema>;
export type TrailGeoItem = z.infer<typeof TrailGeoItemSchema>;
export type TrailGeoResponse = z.infer<typeof TrailGeoResponseSchema>;
export type TrailNearbyResponse = z.infer<typeof TrailNearbyResponseSchema>;

/** Attribution de la fiche (DATAtourisme, Licence Ouverte), avec son producteur. */
export function datatourismeAttribution(producer: string | null): TrailAttribution {
  return {
    source: 'datatourisme', text: DATATOURISME_ATTRIBUTION_TEXT, license: 'Licence Ouverte 2.0',
    licenseUrl: LICENCE_OUVERTE_URL, url: 'https://www.datatourisme.fr/', producer, osmRelationId: null,
  };
}

/** Attribution d'un tracé OpenStreetMap (ODbL), avec la relation d'origine. */
export function osmTrackAttribution(osmRelationId: number): TrailAttribution {
  return {
    source: 'osm', text: OSM_ATTRIBUTION_TEXT, license: 'ODbL 1.0', licenseUrl: ODBL_LICENSE_URL,
    url: OSM_COPYRIGHT_URL, producer: null, osmRelationId,
  };
}
