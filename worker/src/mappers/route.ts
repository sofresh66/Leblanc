import {
  EventI18nDescriptionSchema,
  EventI18nTitleSchema,
  TrailDetailSchema,
  TrailGeoItemSchema,
  TrailModeSchema,
  TrailSummarySchema,
  TrailTrackSchema,
  applyTranslationStatus,
  datatourismeAttribution,
  osmTrackAttribution,
  resolveEventContent,
  type SupportedLanguage,
  type TrailDetail,
  type TrailGeoItem,
  type TrailSummary,
  type TrailTrack,
} from '@leblanc/shared';

/** Ligne SQL d'un parcours (types bruts du pilote Neon : numeric et bigint en texte). */
export interface TrailDbRow {
  id: string;
  title_i18n: unknown;
  description_i18n: unknown;
  translation_status: unknown;
  modes: string[];
  is_loop: boolean | null;
  distance_m: number | null;
  duration_min: number | null;
  duration_days: number | string | null;
  start_latitude: number | string;
  start_longitude: number | string;
  start_city: string | null;
  start_postal_code?: string | null;
  distance_le_blanc_m: number;
  has_track: boolean;
  track_geojson?: string | null;
  track_osm_relation_id: number | string | null;
  official_url: string | null;
  image_url: string | null;
  image_credit: string | null;
  image_license: string | null;
  producer: string | null;
  content_updated_at: string | Date;
}

function json(value: unknown): unknown {
  return typeof value === 'string' ? JSON.parse(value) as unknown : value;
}

function nullableNumber(value: number | string | null | undefined): number | null {
  return value === null || value === undefined ? null : Number(value);
}

/** Langue demandée, sinon français ; traductions rejetées ou recopiées jamais servies. */
function resolveContent(row: TrailDbRow, lang: SupportedLanguage) {
  const translations = applyTranslationStatus({
    title_i18n: EventI18nTitleSchema.parse(json(row.title_i18n)),
    description_i18n: EventI18nDescriptionSchema.parse(json(row.description_i18n)),
  }, json(row.translation_status));
  return resolveEventContent(translations, lang);
}

export function parseTrack(geojson: string | null | undefined): TrailTrack | null {
  return geojson ? TrailTrackSchema.parse(JSON.parse(geojson) as unknown) : null;
}

export function mapDbRowToTrailSummary(row: TrailDbRow, lang: SupportedLanguage): TrailSummary {
  const content = resolveContent(row, lang);
  return TrailSummarySchema.parse({
    id: row.id,
    title: content.title,
    contentLanguage: content.contentLanguage,
    modes: row.modes.map((mode) => TrailModeSchema.parse(mode)),
    isLoop: row.is_loop,
    distanceM: row.distance_m,
    durationMin: row.duration_min,
    durationDays: nullableNumber(row.duration_days),
    start: { lat: Number(row.start_latitude), lng: Number(row.start_longitude) },
    startCity: row.start_city,
    distanceFromLeBlancM: row.distance_le_blanc_m,
    hasTrack: row.has_track,
    imageUrl: row.image_url,
    imageCredit: row.image_credit,
    imageLicense: row.image_license,
    officialUrl: row.official_url,
    producer: row.producer,
    updatedAt: new Date(row.content_updated_at).toISOString(),
  });
}

export function mapDbRowToTrailDetail(row: TrailDbRow, lang: SupportedLanguage): TrailDetail {
  const summary = mapDbRowToTrailSummary(row, lang);
  const content = resolveContent(row, lang);
  const track = parseTrack(row.track_geojson);
  const osmRelationId = track ? nullableNumber(row.track_osm_relation_id) : null;
  return TrailDetailSchema.parse({
    ...summary,
    description: content.description,
    descriptionLanguage: content.descriptionLanguage,
    isFallback: content.isFallback,
    startPostalCode: row.start_postal_code ?? null,
    track,
    osmRelationId,
    // Seul un tracé OSM (ODbL) peut être redistribué en GPX.
    gpxAvailable: osmRelationId !== null,
    attributions: [
      datatourismeAttribution(row.producer),
      ...(osmRelationId !== null ? [osmTrackAttribution(osmRelationId)] : []),
    ],
  });
}

export function mapDbRowToTrailGeoItem(row: TrailDbRow, lang: SupportedLanguage): TrailGeoItem {
  const track = parseTrack(row.track_geojson);
  return TrailGeoItemSchema.parse({
    id: row.id,
    title: resolveContent(row, lang).title,
    modes: row.modes.map((mode) => TrailModeSchema.parse(mode)),
    isLoop: row.is_loop,
    distanceM: row.distance_m,
    start: { lat: Number(row.start_latitude), lng: Number(row.start_longitude) },
    hasTrack: track !== null,
    track,
    osmRelationId: track ? nullableNumber(row.track_osm_relation_id) : null,
  });
}
