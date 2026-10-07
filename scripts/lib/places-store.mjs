import { createHash, randomUUID } from 'node:crypto';
import { assertPublicDescriptionClean } from './public-description-guard.mjs';

export const PLACES_SOURCE = 'datatourisme_places';
export const PLACES_LOCK_ID = 8493022;

function ruleId(placeId, rule) {
  const bytes = createHash('sha256')
    .update(`${placeId}|${JSON.stringify(rule)}`)
    .digest();
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.subarray(0, 16).toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

// L'appelant doit détenir PLACES_LOCK_ID et ouvrir une transaction.
export async function upsertPlace(client, item) {
  assertPublicDescriptionClean(item.place.description_i18n, `${PLACES_SOURCE}:${item.externalId}`);
  const { rows } = await client.query(
    'SELECT place_id FROM place_source_records WHERE source=$1 AND external_id=$2 FOR UPDATE',
    [PLACES_SOURCE, item.externalId],
  );
  const existingId = rows[0]?.place_id;
  const placeId = existingId ?? randomUUID();
  const p = item.place;
  await client.query(
    `
    INSERT INTO places (
      id, type, subtypes, title_i18n, description_i18n, source_language,
      venue_name, address, postal_code, city, latitude, longitude, location,
      phone, email, website, image_url, public_url, cuisines, price_range_min,
      price_range_max, currency, price_details, takeaway, opening_hours_status, normalized_title
    ) VALUES (
      $1,$2,$3,$4::jsonb,$5::jsonb,$6,$7,$8,$9,$10,$11,$12,
      ST_SetSRID(ST_MakePoint($12,$11),4326)::geography,
      $13,$14,$15,$16,$17,$18,$19,$20,$21,$22::jsonb,$23,$24,$25
    ) ON CONFLICT (id) DO UPDATE SET
      type=EXCLUDED.type, subtypes=EXCLUDED.subtypes, title_i18n=EXCLUDED.title_i18n,
      description_i18n=EXCLUDED.description_i18n, source_language=EXCLUDED.source_language,
      venue_name=EXCLUDED.venue_name, address=EXCLUDED.address, postal_code=EXCLUDED.postal_code,
      city=EXCLUDED.city, latitude=EXCLUDED.latitude, longitude=EXCLUDED.longitude,
      location=EXCLUDED.location, phone=EXCLUDED.phone, email=EXCLUDED.email,
      website=EXCLUDED.website, image_url=EXCLUDED.image_url, public_url=EXCLUDED.public_url,
      cuisines=EXCLUDED.cuisines, price_range_min=EXCLUDED.price_range_min,
      price_range_max=EXCLUDED.price_range_max, currency=EXCLUDED.currency,
      price_details=EXCLUDED.price_details, takeaway=EXCLUDED.takeaway,
      opening_hours_status=EXCLUDED.opening_hours_status,
      normalized_title=EXCLUDED.normalized_title, last_seen_at=now()
  `,
    [
      placeId,
      p.type,
      p.subtypes,
      JSON.stringify(p.title_i18n),
      JSON.stringify(p.description_i18n),
      p.sourceLanguage,
      p.venueName,
      p.address,
      p.postalCode,
      p.city,
      p.latitude,
      p.longitude,
      p.phone,
      p.email,
      p.website,
      p.imageUrl,
      p.publicUrl,
      p.cuisines,
      p.priceRangeMin,
      p.priceRangeMax,
      p.currency,
      JSON.stringify(p.priceDetails),
      p.takeaway,
      p.openingHoursStatus,
      p.normalizedTitle,
    ],
  );
  // Ne réactive pas un lieu masqué/fermé manuellement. Ne masque aucun absent du flux.
  await client.query(
    `
    INSERT INTO place_source_records
      (id,source,external_id,place_id,source_url,source_updated_at,raw_excerpt,last_seen_at)
    VALUES (gen_random_uuid(),$1,$2,$3,$4,$5,$6::jsonb,now())
    ON CONFLICT (source,external_id) DO UPDATE SET
      source_url=EXCLUDED.source_url, source_updated_at=EXCLUDED.source_updated_at,
      raw_excerpt=EXCLUDED.raw_excerpt, last_seen_at=now()
  `,
    [
      PLACES_SOURCE,
      item.externalId,
      placeId,
      item.sourceUrl,
      item.sourceUpdatedAt,
      JSON.stringify(item.rawExcerpt),
    ],
  );

  const ids = [];
  for (const rule of item.openingHours) {
    const id = ruleId(placeId, rule);
    ids.push(id);
    await client.query(
      `
      INSERT INTO place_opening_hours
        (id,place_id,valid_from,valid_through,day_of_week,opens,closes,week_of_month)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (id) DO NOTHING
    `,
      [
        id,
        placeId,
        rule.validFrom,
        rule.validThrough,
        rule.dayOfWeek,
        rule.opens,
        rule.closes,
        rule.weekOfMonth,
      ],
    );
  }
  // Remplacement atomique des horaires source ; une règle retirée ne reste pas active.
  await client.query(
    'DELETE FROM place_opening_hours WHERE place_id=$1 AND id <> ALL($2::uuid[])',
    [placeId, ids],
  );
  return existingId ? 'updated' : 'created';
}
