import { randomUUID } from 'node:crypto';
import { bestDedupeCandidate, classifyDedupe } from './osm-dedupe.mjs';
import { warnOnInternalNoteMarkers } from './public-description-guard.mjs';

export const OSM_SOURCE = 'openstreetmap';
export const OSM_LOCK_ID = 8493023;

// L'appelant détient OSM_LOCK_ID et une transaction.
export async function upsertOsmPlace(client, item) {
  warnOnInternalNoteMarkers(item.place.description_i18n, `${OSM_SOURCE}:${item.externalId}`);
  const existing = await client.query(
    'SELECT place_id FROM place_source_records WHERE source=$1 AND external_id=$2 FOR UPDATE',
    [OSM_SOURCE, item.externalId],
  );
  const existingId = existing.rows[0]?.place_id;
  const placeId = existingId ?? randomUUID();
  const p = item.place;
  await client.query(`
    INSERT INTO places (
      id,type,subtypes,title_i18n,description_i18n,source_language,venue_name,
      address,postal_code,city,latitude,longitude,location,phone,email,website,
      image_url,public_url,cuisines,price_range_min,price_range_max,currency,
      price_details,takeaway,opening_hours_status,normalized_title,opening_hours_raw
    ) VALUES (
      $1,$2,$3,$4::jsonb,$5::jsonb,$6,$7,$8,$9,$10,$11,$12,
      ST_SetSRID(ST_MakePoint($12,$11),4326)::geography,
      $13,$14,$15,$16,$17,$18,$19,$20,$21,$22::jsonb,$23,$24,$25,$26
    ) ON CONFLICT (id) DO UPDATE SET
      type=EXCLUDED.type,subtypes=EXCLUDED.subtypes,title_i18n=EXCLUDED.title_i18n,
      description_i18n=EXCLUDED.description_i18n,source_language=EXCLUDED.source_language,
      venue_name=EXCLUDED.venue_name,address=EXCLUDED.address,postal_code=EXCLUDED.postal_code,
      city=EXCLUDED.city,latitude=EXCLUDED.latitude,longitude=EXCLUDED.longitude,
      location=EXCLUDED.location,phone=EXCLUDED.phone,email=EXCLUDED.email,
      website=EXCLUDED.website,image_url=EXCLUDED.image_url,public_url=EXCLUDED.public_url,
      cuisines=EXCLUDED.cuisines,price_range_min=EXCLUDED.price_range_min,
      price_range_max=EXCLUDED.price_range_max,currency=EXCLUDED.currency,
      price_details=EXCLUDED.price_details,takeaway=EXCLUDED.takeaway,
      opening_hours_status=EXCLUDED.opening_hours_status,
      normalized_title=EXCLUDED.normalized_title,
      opening_hours_raw=EXCLUDED.opening_hours_raw,last_seen_at=now()`,
    [placeId,p.type,p.subtypes,JSON.stringify(p.title_i18n),JSON.stringify(p.description_i18n),
      p.sourceLanguage,p.venueName,p.address,p.postalCode,p.city,p.latitude,p.longitude,
      p.phone,p.email,p.website,p.imageUrl,p.publicUrl,p.cuisines,p.priceRangeMin,
      p.priceRangeMax,p.currency,JSON.stringify(p.priceDetails),p.takeaway,
      p.openingHoursStatus,p.normalizedTitle,item.openingHoursRaw],
  );
  await client.query(`
    INSERT INTO place_source_records
      (id,source,external_id,place_id,source_url,source_updated_at,raw_excerpt,last_seen_at)
    VALUES (gen_random_uuid(),$1,$2,$3,$4,$5,$6::jsonb,now())
    ON CONFLICT (source,external_id) DO UPDATE SET
      source_url=EXCLUDED.source_url,source_updated_at=EXCLUDED.source_updated_at,
      raw_excerpt=EXCLUDED.raw_excerpt,last_seen_at=now()`,
    [OSM_SOURCE,item.externalId,placeId,item.sourceUrl,item.sourceUpdatedAt,
      JSON.stringify(item.rawExcerpt)],
  );
  return { placeId, action: existingId ? 'updated' : 'created' };
}

export async function dedupeOsmPlace(client, item, placeId) {
  const previous = await client.query(`
    SELECT EXISTS (
      SELECT 1 FROM place_dedupe_candidates
      WHERE right_place_id=$1 AND decision='merge'
    ) AS auto_hidden`, [placeId]);
  const matches = await client.query(`
    SELECT p.id,p.type,p.title_i18n->>'fr' AS name,p.postal_code AS "postalCode",
      p.city,ST_Distance(p.location,o.location) AS "distanceMeters",
      psr.source
    FROM places p
    JOIN place_source_records psr ON psr.place_id=p.id AND psr.source='datatourisme_places'
    JOIN places o ON o.id=$1
    WHERE p.type=o.type AND ST_DWithin(p.location,o.location,300)
    ORDER BY "distanceMeters" ASC`, [placeId]);
  const osm = { id: placeId, source: OSM_SOURCE, type: item.place.type,
    name: item.place.title_i18n.fr, city: item.place.city, postalCode: item.place.postalCode };
  const best = bestDedupeCandidate(matches.rows.map((row) => classifyDedupe(row, osm)).filter(Boolean));
  if (best) {
    const saved = await client.query(`
      INSERT INTO place_dedupe_candidates
        (left_place_id,right_place_id,score,level,distance_meters,reason,decision)
      VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7)
      ON CONFLICT (left_place_id,right_place_id) DO UPDATE SET
        score=EXCLUDED.score,level=EXCLUDED.level,
        distance_meters=EXCLUDED.distance_meters,reason=EXCLUDED.reason,
        decision=CASE WHEN place_dedupe_candidates.decision='keep_separate'
          THEN 'keep_separate' ELSE EXCLUDED.decision END
      RETURNING decision`,
      [best.leftPlaceId,best.rightPlaceId,best.score,best.level,best.distanceMeters,
        JSON.stringify(best.reason),best.decision]);
    best.decision = saved.rows[0].decision;
  }
  if (best?.decision === 'merge') {
    await client.query("UPDATE places SET status='hidden' WHERE id=$1 AND status='published'", [placeId]);
  } else if (previous.rows[0]?.auto_hidden) {
    await client.query("UPDATE places SET status='published' WHERE id=$1 AND status='hidden'", [placeId]);
  }
  return best;
}
