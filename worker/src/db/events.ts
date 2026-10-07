import {
  LE_BLANC_CENTER,
  type Event,
  type EventDetail,
  type SupportedLanguage,
} from '@leblanc/shared';
import {
  mapDbRowToEvent,
  mapDbRowToEventDetail,
  type EventDbRow,
  type OccurrenceDbRow,
} from '../mappers/event.js';
import { encodeCursor } from '../validation/cursor.js';
import type { ParsedEventListQuery } from '../validation/query.js';
import { executeQuery } from './client.js';

export interface EventListDbResult {
  items: Event[];
  nextCursor: string | null;
}

/**
 * Récupère la liste paginée et filtrée des événements depuis Neon PostgreSQL.
 */
export async function listEventsFromDb(
  databaseUrl: string,
  query: ParsedEventListQuery,
  nowIso: string
): Promise<EventListDbResult> {
  const centerLng = LE_BLANC_CENTER.lng; // 1.0622
  const centerLat = LE_BLANC_CENTER.lat; // 46.6339

  const params: unknown[] = [
    centerLng, // $1
    centerLat, // $2
    nowIso,    // $3
  ];

  const startTime = query.from ? query.from : nowIso;
  params.push(startTime); // $4

  const maxDistance = query.maxDistance ? Math.min(query.maxDistance, 20000) : 20000;
  params.push(maxDistance); // $5

  let sqlTo = '';
  if (query.to) {
    params.push(query.to);
    sqlTo = `AND o1.starts_at ${query.toExclusive ? '<' : '<='} $${params.length}::timestamptz`;
  }

  let sqlCat = '';
  if (query.categories && query.categories.length > 0) {
    params.push(query.categories);
    sqlCat = `AND e.category = ANY($${params.length})`;
  }

  let sqlCity = '';
  if (query.city) {
    params.push(query.city);
    sqlCity = `AND LOWER(e.city) = LOWER($${params.length})`;
  }

  let sqlFree = '';
  if (query.isFree !== undefined) {
    params.push(query.isFree);
    sqlFree = `AND e.is_free = $${params.length}`;
  }

  let sqlCursor = '';
  if (query.decodedCursor) {
    params.push(query.decodedCursor.d);
    const dateParamIndex = params.length;
    params.push(query.decodedCursor.i);
    const idParamIndex = params.length;
    sqlCursor = `AND ((o.starts_at > $${dateParamIndex}::timestamptz) OR (o.starts_at = $${dateParamIndex}::timestamptz AND e.id > $${idParamIndex}::uuid))`;
  }

  const limitPlusOne = query.limit + 1;
  params.push(limitPlusOne);
  const sqlLimit = `LIMIT $${params.length}`;

  const sql = `
    SELECT
      e.id,
      e.category,
      e.title_i18n,
      e.description_i18n,
      e.translation_status,
      (SELECT string_agg(DISTINCT sr.source, ', ' ORDER BY sr.source)
       FROM source_records sr WHERE sr.event_id = e.id) AS source,
      e.venue_name,
      e.address,
      e.postal_code,
      e.city,
      e.latitude,
      e.longitude,
      e.public_url,
      e.image_url,
      e.is_free,
      e.price_min,
      e.currency,
      o.starts_at,
      o.ends_at,
      o.timezone,
      to_char(o.starts_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor_date,
      ROUND(ST_Distance(e.location, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography))::integer AS distance
    FROM events e
    CROSS JOIN LATERAL (
      SELECT o1.starts_at, o1.ends_at, o1.timezone
      FROM event_occurrences o1
      WHERE o1.event_id = e.id
        AND o1.status = 'scheduled'
        AND o1.starts_at >= GREATEST($4::timestamptz, $3::timestamptz)
        AND o1.starts_at <= ($3::timestamptz + interval '90 days')
        ${sqlTo}
      ORDER BY o1.starts_at ASC, o1.id ASC
      LIMIT 1
    ) o
    WHERE e.status = 'published'
      AND ST_DWithin(e.location, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography, $5)
      ${sqlCat}
      ${sqlCity}
      ${sqlFree}
      ${sqlCursor}
    ORDER BY o.starts_at ASC, e.id ASC
    ${sqlLimit};
  `;

  const rows = await executeQuery<EventDbRow>(databaseUrl, sql, params);

  const hasNextPage = rows.length > query.limit;
  const resultRows = hasNextPage ? rows.slice(0, query.limit) : rows;

  const items = resultRows.map((row) => mapDbRowToEvent(row, query.lang));

  let nextCursor: string | null = null;
  if (hasNextPage && items.length > 0) {
    const lastRow = resultRows[resultRows.length - 1];
    if (lastRow?.cursor_date) {
      // Conserver les microsecondes PostgreSQL dans le curseur, sans conversion en Date.
      nextCursor = encodeCursor(lastRow.cursor_date, lastRow.id);
    } else {
      throw new Error('Horodatage de pagination absent de la réponse SQL');
    }
  }

  return {
    items,
    nextCursor,
  };
}

/**
 * Récupère un événement par son identifiant unique avec ses occurrences.
 * Renvoie null si l'événement n'existe pas, n'est pas publié ou se situe hors du rayon de 20 km.
 */
export async function getEventByIdFromDb(
  databaseUrl: string,
  id: string,
  lang: SupportedLanguage,
  nowIso: string
): Promise<EventDetail | null> {
  const centerLng = LE_BLANC_CENTER.lng;
  const centerLat = LE_BLANC_CENTER.lat;

  // Requête événement avec contrôle spatial CB7 (max 20 km)
  const eventSql = `
    SELECT
      e.id,
      e.category,
      e.title_i18n,
      e.description_i18n,
      e.translation_status,
      (SELECT string_agg(DISTINCT sr.source, ', ' ORDER BY sr.source)
       FROM source_records sr WHERE sr.event_id = e.id) AS source,
      e.venue_name,
      e.address,
      e.postal_code,
      e.city,
      e.latitude,
      e.longitude,
      e.public_url,
      e.image_url,
      e.is_free,
      e.price_min,
      e.currency,
      ROUND(ST_Distance(e.location, ST_SetSRID(ST_MakePoint($2, $3), 4326)::geography))::integer AS distance
    FROM events e
    WHERE e.id = $1::uuid
      AND e.status = 'published'
      AND ST_DWithin(e.location, ST_SetSRID(ST_MakePoint($2, $3), 4326)::geography, 20000);
  `;

  const eventRows = await executeQuery<Omit<EventDbRow, 'starts_at' | 'ends_at' | 'timezone'>>(
    databaseUrl,
    eventSql,
    [id, centerLng, centerLat]
  );

  if (eventRows.length === 0) {
    return null;
  }

  const baseRow = eventRows[0];
  if (!baseRow) {
    return null;
  }

  // Historique complet des séances programmées ; les séances annulées sont exclues.
  const occSql = `
    SELECT
      o.id,
      o.starts_at,
      o.ends_at,
      o.timezone
    FROM event_occurrences o
    WHERE o.event_id = $1::uuid
      AND o.status = 'scheduled'
    ORDER BY o.starts_at ASC, o.id ASC;
  `;

  const occRows = await executeQuery<OccurrenceDbRow>(databaseUrl, occSql, [id]);

  // La fiche représente la prochaine séance, ou la dernière passée si l'événement est terminé.
  const nextOccurrence = occRows.find((occ) => new Date(occ.starts_at).getTime() >= Date.parse(nowIso))
    ?? occRows[occRows.length - 1];
  if (!nextOccurrence) {
    return null;
  }

  const fullRow: EventDbRow = {
    id: baseRow.id,
    category: baseRow.category,
    title_i18n: baseRow.title_i18n,
    description_i18n: baseRow.description_i18n,
    translation_status: baseRow.translation_status,
    source: baseRow.source,
    venue_name: baseRow.venue_name,
    address: baseRow.address,
    postal_code: baseRow.postal_code,
    city: baseRow.city,
    latitude: baseRow.latitude,
    longitude: baseRow.longitude,
    public_url: baseRow.public_url,
    image_url: baseRow.image_url,
    is_free: baseRow.is_free,
    price_min: baseRow.price_min,
    currency: baseRow.currency,
    distance: baseRow.distance,
    starts_at: nextOccurrence.starts_at,
    ends_at: nextOccurrence.ends_at,
    timezone: nextOccurrence.timezone,
  };

  return mapDbRowToEventDetail(fullRow, occRows, lang);
}
