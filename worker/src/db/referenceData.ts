import { LE_BLANC_CENTER } from '@leblanc/shared';
import { executeQuery } from './client.js';

interface CityRow {
  city: string;
}

/**
 * Récupère la liste alphabétique des villes ayant au moins un événement publié
 * et actif dans un rayon de 20 km autour du Blanc au cours des 90 prochains jours.
 */
export async function listCitiesFromDb(
  databaseUrl: string,
  nowIso: string
): Promise<string[]> {
  const centerLng = LE_BLANC_CENTER.lng;
  const centerLat = LE_BLANC_CENTER.lat;

  const sql = `
    SELECT DISTINCT e.city
    FROM events e
    JOIN event_occurrences o ON o.event_id = e.id
    WHERE e.status = 'published'
      AND o.status = 'scheduled'
      AND o.starts_at >= $3::timestamptz
      AND o.starts_at <= ($3::timestamptz + interval '90 days')
      AND ST_DWithin(e.location, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography, 20000)
      AND e.city IS NOT NULL
      AND TRIM(e.city) <> ''
    ORDER BY e.city ASC;
  `;

  const rows = await executeQuery<CityRow>(databaseUrl, sql, [
    centerLng,
    centerLat,
    nowIso,
  ]);

  return rows.map((r) => r.city.trim());
}
