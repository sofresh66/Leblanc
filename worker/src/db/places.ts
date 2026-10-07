import {
  LE_BLANC_CENTER,
  PlaceCategoriesResponseSchema,
  type PlaceApi,
  type PlaceCategoriesResponse,
  type SupportedLanguage,
} from '@leblanc/shared';
import { mapDbRowToPlace, type PlaceDbRow } from '../mappers/place.js';
import {
  encodePlaceCursor,
  type ParsedPlaceListQuery,
  type PlaceCursor,
} from '../validation/placesQuery.js';
import { escapeLikePattern } from '../validation/query.js';
import { executeQuery } from './client.js';

const PLACE_COLUMNS = `
  p.id, p.type, p.subtypes, p.title_i18n, p.description_i18n,
  p.source_language, p.venue_name, p.address, p.postal_code, p.city,
  p.latitude, p.longitude, p.phone, p.email, p.website, p.image_url,
  p.public_url, p.cuisines, p.price_range_min, p.price_range_max,
  p.currency, p.price_details, p.takeaway, p.opening_hours_status,
  p.status, p.normalized_title`;

const RELATED_COLUMNS = `
  (SELECT string_agg(DISTINCT psr.source, ', ' ORDER BY psr.source)
   FROM place_source_records psr WHERE psr.place_id = p.id) AS source,
  (SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', poh.id, 'placeId', poh.place_id,
    'validFrom', poh.valid_from, 'validThrough', poh.valid_through,
    'dayOfWeek', poh.day_of_week, 'opens', poh.opens,
    'closes', poh.closes, 'weekOfMonth', poh.week_of_month
  ) ORDER BY poh.id), '[]'::jsonb)
   FROM place_opening_hours poh WHERE poh.place_id = p.id) AS opening_hours`;

export interface PlaceListDbResult {
  items: PlaceApi[];
  nextCursor: string | null;
}

async function fetchPlaceBatch(
  databaseUrl: string,
  query: ParsedPlaceListQuery,
  cursor: PlaceCursor | undefined,
  limit: number,
): Promise<PlaceDbRow[]> {
  const params: unknown[] = [LE_BLANC_CENTER.lng, LE_BLANC_CENTER.lat, query.maxDistance ?? 20000];
  let typeFilter = '';
  let cuisineFilter = '';
  let cursorFilter = '';
  if (query.types?.length) {
    params.push(query.types);
    typeFilter = `AND p.type = ANY($${params.length}::text[])`;
  }
  if (query.cuisines?.length) {
    params.push(query.cuisines);
    cuisineFilter = `AND p.cuisines && $${params.length}::text[]`;
  }
  let searchFilter = '';
  if (query.q) {
    params.push(`%${escapeLikePattern(query.q)}%`);
    const pattern = `unaccent(lower($${params.length}))`;
    searchFilter = `AND (
      EXISTS (SELECT 1 FROM jsonb_each_text(p.title_i18n) t WHERE unaccent(lower(t.value)) LIKE ${pattern} ESCAPE '\\')
      OR unaccent(lower(coalesce(p.city, ''))) LIKE ${pattern} ESCAPE '\\'
      OR EXISTS (SELECT 1 FROM unnest(p.cuisines) c WHERE unaccent(lower(c)) LIKE ${pattern} ESCAPE '\\')
    )`;
  }
  if (cursor) {
    if (cursor.d === null) {
      params.push(cursor.i);
      cursorFilter = `WHERE distance_m IS NULL AND id > $${params.length}::uuid`;
    } else {
      params.push(cursor.d, cursor.i);
      cursorFilter = `WHERE (distance_m IS NULL OR distance_m > $${params.length - 1}::double precision
        OR (distance_m = $${params.length - 1}::double precision AND id > $${params.length}::uuid))`;
    }
  }
  params.push(limit);
  const sql = `
    WITH centre AS (
      SELECT ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography AS point
    ), candidates AS (
      SELECT ${PLACE_COLUMNS},
        ST_Distance(p.location, centre.point) AS distance_m,
        ${RELATED_COLUMNS}
      FROM places p CROSS JOIN centre
      WHERE p.status = 'published'
        AND (p.location IS NULL OR ST_DWithin(p.location, centre.point, $3::double precision))
        ${typeFilter}
        ${cuisineFilter}
        ${searchFilter}
    )
    SELECT * FROM candidates
    ${cursorFilter}
    ORDER BY distance_m ASC NULLS LAST, id ASC
    LIMIT $${params.length};
  `;
  return executeQuery<PlaceDbRow>(databaseUrl, sql, params);
}

export async function listPlacesFromDb(
  databaseUrl: string,
  query: ParsedPlaceListQuery,
  now: Date,
): Promise<PlaceListDbResult> {
  const filteredByOpening = query.isOpenNow !== undefined;
  const batchSize = filteredByOpening ? 50 : query.limit + 1;
  const maxBatches = filteredByOpening ? 5 : 1;
  const matches: { place: PlaceApi; cursor: PlaceCursor }[] = [];
  let scanCursor = query.decodedCursor;
  let lastScanned: PlaceCursor | undefined;
  let exhausted = false;

  for (let batch = 0; batch < maxBatches; batch++) {
    const rows = await fetchPlaceBatch(databaseUrl, query, scanCursor, batchSize);
    if (rows.length < batchSize) exhausted = true;
    for (const row of rows) {
      const point = { d: row.distance_m === null ? null : Number(row.distance_m), i: row.id };
      lastScanned = point;
      const place = mapDbRowToPlace(row, query.lang, now);
      if (!place) continue;
      if (query.isOpenNow === undefined || place.isOpenNow === query.isOpenNow) {
        matches.push({ place, cursor: point });
        if (matches.length > query.limit) break;
      }
    }
    if (matches.length > query.limit || exhausted) break;
    scanCursor = lastScanned;
  }

  const page = matches.slice(0, query.limit);
  const more = matches.length > query.limit || !exhausted;
  // Après la borne des cinq lots, un résultat vide avance sur le dernier lieu examiné.
  const continuation = page[page.length - 1]?.cursor ?? lastScanned;
  return {
    items: page.map(({ place }) => place),
    nextCursor: more && continuation ? encodePlaceCursor(continuation) : null,
  };
}

export async function getPlaceByIdFromDb(
  databaseUrl: string,
  id: string,
  lang: SupportedLanguage,
  now = new Date(),
): Promise<PlaceApi | null> {
  const sql = `
    SELECT ${PLACE_COLUMNS}, p.opening_hours_raw,
      ST_Distance(p.location, ST_SetSRID(ST_MakePoint($2, $3), 4326)::geography) AS distance_m,
      ${RELATED_COLUMNS}
    FROM places p
    WHERE p.id = $1::uuid AND p.status = 'published'
      AND (p.location IS NULL OR ST_DWithin(p.location,
        ST_SetSRID(ST_MakePoint($2, $3), 4326)::geography, 20000));
  `;
  const rows = await executeQuery<PlaceDbRow>(databaseUrl, sql, [id, LE_BLANC_CENTER.lng, LE_BLANC_CENTER.lat]);
  const row = rows[0];
  return row ? mapDbRowToPlace(row, lang, now) : null;
}

interface PlaceCategoriesRow {
  types: unknown;
  cuisines: unknown;
}

export async function listPlaceCategoriesFromDb(databaseUrl: string): Promise<PlaceCategoriesResponse> {
  const sql = `
    WITH eligible AS (
      SELECT p.id, p.type, p.cuisines FROM places p
      WHERE p.status = 'published'
        AND (p.location IS NULL OR ST_DWithin(p.location,
          ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography, 20000))
    )
    SELECT
      (SELECT COALESCE(jsonb_agg(jsonb_build_object('value', value, 'count', count) ORDER BY value), '[]'::jsonb)
       FROM (SELECT type AS value, count(*)::integer AS count FROM eligible GROUP BY type) t) AS types,
      (SELECT COALESCE(jsonb_agg(jsonb_build_object('value', value, 'count', count) ORDER BY value), '[]'::jsonb)
       FROM (SELECT u.cuisine AS value, count(DISTINCT e.id)::integer AS count
             FROM eligible e CROSS JOIN LATERAL unnest(e.cuisines) AS u(cuisine)
             GROUP BY u.cuisine) c) AS cuisines;
  `;
  const rows = await executeQuery<PlaceCategoriesRow>(databaseUrl, sql, [LE_BLANC_CENTER.lng, LE_BLANC_CENTER.lat]);
  const row = rows[0];
  return PlaceCategoriesResponseSchema.parse({
    types: row?.types ?? [],
    cuisines: row?.cuisines ?? [],
  });
}
