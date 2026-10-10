import { randomUUID } from 'node:crypto';
import { LE_BLANC, haversineMeters, toMultiLineStringWkt } from './geo.mjs';
import { warnOnInternalNoteMarkers } from './public-description-guard.mjs';
import { carryRecordMismatch, contentFingerprint } from './translation-validator.mjs';
import { reportRows } from './translation-report.mjs';

export const ROUTES_SOURCE = 'datatourisme';
export const ROUTES_RUN_SOURCE = 'datatourisme_routes';
export const ROUTES_LOCK_ID = 8493023;
// Une fiche absente du flux pendant 3 jours est masquée ; elle revient si elle réapparaît.
export const STALE_AFTER_DAYS = 3;
// Version allégée du tracé pour la carte : environ 15 m.
const SIMPLIFY_TOLERANCE_DEG = 0.00015;

/**
 * Valeurs de la ligne `routes` pour un parcours normalisé et sa correspondance
 * OSM éventuelle (null : pas de tracé sûr).
 */
export function routeRow(item, match) {
  const r = item.route;
  const start = match?.start ?? r.start;
  return {
    start,
    distanceLeBlancM: Math.round(haversineMeters(start, LE_BLANC)),
    isLoop: r.isLoop ?? match?.isLoop ?? null,
    trackWkt: match ? toMultiLineStringWkt(match.lines) : null,
    trackRelationId: match?.relationId ?? null,
  };
}

/**
 * Insère ou met à jour un parcours. L'appelant détient ROUTES_LOCK_ID et ouvre
 * une transaction. `osmAvailable` faux (Overpass en panne) : le tracé, le départ
 * qui en dépend et la boucle déduite d'OSM sont conservés tels quels.
 */
export async function upsertRoute(client, item, { match, osmAvailable, translationRows }) {
  warnOnInternalNoteMarkers(item.route.descriptionI18n, `${ROUTES_SOURCE}:${item.externalId}`);
  const { rows } = await client.query(
    'SELECT route_id FROM route_source_records WHERE source = $1 AND external_id = $2 FOR UPDATE',
    [ROUTES_SOURCE, item.externalId],
  );
  const existingId = rows[0]?.route_id;
  const r = item.route;
  if (item.translationStatus) {
    // Un rejet de fiche (embeddings) n'est conservé que si le contenu source est inchangé.
    const previous = existingId
      ? (await client.query('SELECT translation_status FROM routes WHERE id = $1', [existingId])).rows[0]?.translation_status
      : null;
    const carried = carryRecordMismatch(item.translationStatus, previous, contentFingerprint(r.titleI18n, r.descriptionI18n));
    item.translationStatus = carried.status;
    translationRows.push(...reportRows({ eventId: existingId ?? '', externalId: item.externalId, titleFr: r.titleI18n.fr },
      carried.status, { rescore: carried.rescore }));
  }
  const routeId = existingId ?? randomUUID();
  const row = routeRow(item, match);
  await client.query(
    `
    INSERT INTO routes (
      id, title_i18n, description_i18n, source_language, translation_status, modes, is_loop,
      distance_m, duration_min, duration_days, start_latitude, start_longitude, start_location,
      start_city, start_postal_code, distance_le_blanc_m, track, track_simplified, track_source,
      track_osm_relation_id, official_url, image_url, image_credit, image_license, producer,
      normalized_title, last_seen_at
    ) VALUES (
      $1, $2::jsonb, $3::jsonb, $4, $5::jsonb, $6, $7, $8, $9, $10, $11, $12,
      ST_SetSRID(ST_MakePoint($12, $11), 4326)::geography, $13, $14, $15,
      ST_GeogFromText($16::text),
      ST_Multi(ST_SimplifyPreserveTopology(ST_GeomFromText($16::text, 4326), ${SIMPLIFY_TOLERANCE_DEG})),
      CASE WHEN $16::text IS NULL THEN NULL ELSE 'osm' END, $17, $18, $19, $20, $21, $22, $23, now()
    )
    ON CONFLICT (id) DO UPDATE SET
      title_i18n = EXCLUDED.title_i18n, description_i18n = EXCLUDED.description_i18n,
      source_language = EXCLUDED.source_language, translation_status = EXCLUDED.translation_status,
      modes = EXCLUDED.modes, distance_m = EXCLUDED.distance_m, duration_min = EXCLUDED.duration_min,
      duration_days = EXCLUDED.duration_days, start_city = EXCLUDED.start_city,
      start_postal_code = EXCLUDED.start_postal_code, official_url = EXCLUDED.official_url,
      image_url = EXCLUDED.image_url, image_credit = EXCLUDED.image_credit,
      image_license = EXCLUDED.image_license, producer = EXCLUDED.producer,
      normalized_title = EXCLUDED.normalized_title,
      is_loop = CASE WHEN $24 THEN EXCLUDED.is_loop ELSE COALESCE(EXCLUDED.is_loop, routes.is_loop) END,
      track = CASE WHEN $24 THEN EXCLUDED.track ELSE routes.track END,
      track_simplified = CASE WHEN $24 THEN EXCLUDED.track_simplified ELSE routes.track_simplified END,
      track_source = CASE WHEN $24 THEN EXCLUDED.track_source ELSE routes.track_source END,
      track_osm_relation_id = CASE WHEN $24 THEN EXCLUDED.track_osm_relation_id ELSE routes.track_osm_relation_id END,
      start_latitude = CASE WHEN $24 OR routes.track IS NULL THEN EXCLUDED.start_latitude ELSE routes.start_latitude END,
      start_longitude = CASE WHEN $24 OR routes.track IS NULL THEN EXCLUDED.start_longitude ELSE routes.start_longitude END,
      start_location = CASE WHEN $24 OR routes.track IS NULL THEN EXCLUDED.start_location ELSE routes.start_location END,
      distance_le_blanc_m = CASE WHEN $24 OR routes.track IS NULL THEN EXCLUDED.distance_le_blanc_m
        ELSE routes.distance_le_blanc_m END,
      -- Masquée faute d'être vue : republiée. Masquée à la main (encore vue) : inchangée.
      status = CASE WHEN routes.status = 'hidden' AND routes.last_seen_at < now() - interval '${STALE_AFTER_DAYS} days'
        THEN 'published' ELSE routes.status END,
      last_seen_at = now()
  `,
    [
      routeId,
      JSON.stringify(r.titleI18n),
      JSON.stringify(r.descriptionI18n),
      r.sourceLanguage,
      JSON.stringify(item.translationStatus ?? {}),
      r.modes,
      row.isLoop,
      r.distanceM,
      r.durationMin,
      r.durationDays,
      row.start[1],
      row.start[0],
      r.startCity,
      r.startPostalCode,
      row.distanceLeBlancM,
      row.trackWkt,
      row.trackRelationId,
      r.officialUrl,
      r.imageUrl,
      r.imageCredit,
      r.imageLicense,
      r.producer,
      r.normalizedTitle,
      osmAvailable,
    ],
  );
  await client.query(
    `
    INSERT INTO route_source_records (id, source, external_id, route_id, source_url, source_updated_at, raw_excerpt, last_seen_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, now())
    ON CONFLICT (source, external_id) DO UPDATE SET
      source_url = EXCLUDED.source_url, source_updated_at = EXCLUDED.source_updated_at,
      raw_excerpt = EXCLUDED.raw_excerpt, last_seen_at = now()
  `,
    [randomUUID(), ROUTES_SOURCE, item.externalId, routeId, item.sourceUrl, item.sourceUpdatedAt,
      JSON.stringify({ ...item.rawExcerpt, osmMatch: match ? { relationId: match.relationId, name: match.relationName,
        startDistanceM: match.startDistanceM, forced: match.forced } : null })],
  );
  return existingId ? 'updated' : 'created';
}

/** Masque les parcours absents du flux depuis plus de STALE_AFTER_DAYS jours. */
export async function hideStaleRoutes(client) {
  const { rows } = await client.query(`
    UPDATE routes r SET status = 'hidden'
    FROM route_source_records s
    WHERE s.route_id = r.id AND s.source = $1 AND r.status = 'published'
      AND s.last_seen_at < now() - interval '${STALE_AFTER_DAYS} days'
    RETURNING r.id`, [ROUTES_SOURCE]);
  return rows.length;
}
