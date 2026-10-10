import {
  TRAIL_NEARBY_RADIUS_M,
  calculateHaversineDistance,
  type SupportedLanguage,
  type TrailDetail,
  type TrailGeoItem,
  type TrailNearbyResponse,
  type TrailSummary,
} from '@leblanc/shared';
import {
  mapDbRowToTrailDetail,
  mapDbRowToTrailGeoItem,
  mapDbRowToTrailSummary,
  type TrailDbRow,
} from '../mappers/route.js';
import { encodeTrailCursor, type ParsedTrailListQuery, type TrailFilters } from '../validation/routesQuery.js';
import { escapeLikePattern, parseEventListQuery } from '../validation/query.js';
import { executeQuery } from './client.js';
import { listEventsFromDb } from './events.js';
import { listPlacesNearFromDb } from './places.js';

/** Borne de sécurité de la carte (167 parcours aujourd'hui). */
export const TRAIL_GEO_MAX = 1000;
const NEARBY_LIMIT = 6;

const TRAIL_COLUMNS = `
  r.id, r.title_i18n, r.description_i18n, r.translation_status, r.modes, r.is_loop,
  r.distance_m, r.duration_min, r.duration_days, r.start_latitude, r.start_longitude,
  r.start_city, r.start_postal_code, r.distance_le_blanc_m, (r.track IS NOT NULL) AS has_track,
  r.track_osm_relation_id, r.official_url, r.image_url, r.image_credit, r.image_license, r.producer,
  COALESCE((SELECT max(s.source_updated_at) FROM route_source_records s WHERE s.route_id = r.id), r.created_at)
    AS content_updated_at`;

/** Conditions communes à la liste et à la carte ; complète `params`. */
function filterSql(filters: TrailFilters, params: unknown[]): string {
  // Chevauchement : un parcours « à pied + cheval » reste dans la vue par défaut.
  params.push(filters.modes);
  const conditions = [`r.status = 'published'`, `r.modes && $${params.length}::text[]`];
  if (filters.withTrack !== undefined) conditions.push(`(r.track IS NOT NULL) = ${filters.withTrack ? 'true' : 'false'}`);
  if (filters.loop !== undefined) {
    params.push(filters.loop);
    conditions.push(`r.is_loop = $${params.length}`);
  }
  if (filters.minDistanceM !== undefined) {
    params.push(filters.minDistanceM);
    conditions.push(`r.distance_m >= $${params.length}`);
  }
  if (filters.maxDistanceM !== undefined) {
    params.push(filters.maxDistanceM);
    conditions.push(`r.distance_m <= $${params.length}`);
  }
  if (filters.maxDurationMin !== undefined) {
    params.push(filters.maxDurationMin);
    conditions.push(`COALESCE(r.duration_min, r.duration_days * 1440) <= $${params.length}`);
  }
  if (filters.q) {
    params.push(`%${escapeLikePattern(filters.q)}%`);
    const pattern = `unaccent(lower($${params.length}))`;
    conditions.push(`(
      EXISTS (SELECT 1 FROM jsonb_each_text(r.title_i18n) t WHERE unaccent(lower(t.value)) LIKE ${pattern} ESCAPE '\\')
      OR unaccent(lower(coalesce(r.start_city, ''))) LIKE ${pattern} ESCAPE '\\'
    )`);
  }
  return conditions.join('\n      AND ');
}

const ORDER_BY = 'ORDER BY (r.track IS NOT NULL) DESC, r.distance_le_blanc_m ASC, r.id ASC';

export async function listTrailsFromDb(
  databaseUrl: string,
  query: ParsedTrailListQuery,
): Promise<{ items: TrailSummary[]; nextCursor: string | null }> {
  const params: unknown[] = [];
  const where = filterSql(query, params);
  let cursorSql = '';
  if (query.decodedCursor) {
    const { t, d, i } = query.decodedCursor;
    params.push(t, d, i);
    const [tIndex, dIndex, iIndex] = [params.length - 2, params.length - 1, params.length];
    // Ordre : avec tracé (1) avant sans tracé (0), puis distance et id croissants.
    cursorSql = `AND ((r.track IS NOT NULL)::int < $${tIndex}
      OR ((r.track IS NOT NULL)::int = $${tIndex} AND (r.distance_le_blanc_m, r.id) > ($${dIndex}, $${iIndex}::uuid)))`;
  }
  params.push(query.limit + 1);
  const rows = await executeQuery<TrailDbRow>(databaseUrl, `
    SELECT ${TRAIL_COLUMNS}
    FROM routes r
    WHERE ${where}
      ${cursorSql}
    ${ORDER_BY}
    LIMIT $${params.length};`, params);
  const page = rows.slice(0, query.limit);
  const last = page[page.length - 1];
  const nextCursor = rows.length > query.limit && last
    ? encodeTrailCursor({ t: last.has_track ? 1 : 0, d: last.distance_le_blanc_m, i: last.id, a: query.asOf })
    : null;
  return { items: page.map((row) => mapDbRowToTrailSummary(row, query.lang)), nextCursor };
}

/** Parcours publié avec son tracé allégé, ou null (inconnu ou masqué). */
export async function getTrailByIdFromDb(databaseUrl: string, id: string, lang: SupportedLanguage): Promise<TrailDetail | null> {
  const rows = await executeQuery<TrailDbRow>(databaseUrl, `
    SELECT ${TRAIL_COLUMNS}, ST_AsGeoJSON(r.track_simplified, 6) AS track_geojson
    FROM routes r
    WHERE r.id = $1::uuid AND r.status = 'published';`, [id]);
  const row = rows[0];
  return row ? mapDbRowToTrailDetail(row, lang) : null;
}

export async function listTrailGeoFromDb(
  databaseUrl: string,
  filters: TrailFilters,
): Promise<{ items: TrailGeoItem[]; truncated: boolean }> {
  const params: unknown[] = [];
  const where = filterSql(filters, params);
  params.push(TRAIL_GEO_MAX + 1);
  const rows = await executeQuery<TrailDbRow>(databaseUrl, `
    SELECT ${TRAIL_COLUMNS}, ST_AsGeoJSON(r.track_simplified, 5) AS track_geojson
    FROM routes r
    WHERE ${where}
    ${ORDER_BY}
    LIMIT $${params.length};`, params);
  return {
    items: rows.slice(0, TRAIL_GEO_MAX).map((row) => mapDbRowToTrailGeoItem(row, filters.lang)),
    truncated: rows.length > TRAIL_GEO_MAX,
  };
}

export interface TrailGpxSource {
  title: string;
  osmRelationId: number;
  /** Tracé complet (non allégé), GeoJSON MultiLineString. */
  trackGeojson: string;
}

/** Tracé complet d'un parcours publié dont le tracé vient d'OSM, ou null. */
export async function getTrailGpxSourceFromDb(databaseUrl: string, id: string): Promise<TrailGpxSource | null> {
  const rows = await executeQuery<{ title: string; osm_relation_id: number | string; track_geojson: string }>(databaseUrl, `
    SELECT r.title_i18n->>'fr' AS title, r.track_osm_relation_id AS osm_relation_id,
      ST_AsGeoJSON(r.track::geometry, 7) AS track_geojson
    FROM routes r
    WHERE r.id = $1::uuid AND r.status = 'published' AND r.track IS NOT NULL AND r.track_source = 'osm';`, [id]);
  const row = rows[0];
  return row ? { title: row.title, osmRelationId: Number(row.osm_relation_id), trackGeojson: row.track_geojson } : null;
}

/**
 * Événements à venir et lieux à 5 km au plus du départ d'un parcours publié,
 * ou null si le parcours est inconnu ou masqué.
 */
export async function getTrailNearbyFromDb(
  databaseUrl: string,
  id: string,
  lang: SupportedLanguage,
  nowIso: string,
): Promise<Omit<TrailNearbyResponse, 'generatedAt'> | null> {
  const starts = await executeQuery<{ lat: number | string; lng: number | string }>(databaseUrl, `
    SELECT r.start_latitude AS lat, r.start_longitude AS lng FROM routes r
    WHERE r.id = $1::uuid AND r.status = 'published';`, [id]);
  const start = starts[0];
  if (!start) return null;
  const point = { lng: Number(start.lng), lat: Number(start.lat) };
  const eventQuery = parseEventListQuery(new URL(`https://api.local/?lang=${lang}&limit=${NEARBY_LIMIT}`), nowIso);
  const [events, places] = await Promise.all([
    listEventsFromDb(databaseUrl, eventQuery, nowIso, { ...point, radiusM: TRAIL_NEARBY_RADIUS_M }),
    listPlacesNearFromDb(databaseUrl, point, TRAIL_NEARBY_RADIUS_M, NEARBY_LIMIT, lang, new Date(nowIso)),
  ]);
  return {
    radiusM: TRAIL_NEARBY_RADIUS_M,
    events: events.items.map((event) => ({
      id: event.id, title: event.title, startDate: event.startDate, endDate: event.endDate,
      allDay: event.allDay === true, timezone: event.timezone, city: event.city,
      distanceFromStartM: calculateHaversineDistance(point.lat, point.lng, event.latitude, event.longitude),
    })),
    places: places.map((place) => ({
      id: place.id, title: place.title, type: place.type, city: place.city,
      distanceFromStartM: Math.round(place.distance ?? 0),
    })),
  };
}

