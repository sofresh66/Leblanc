import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { comparableName, nameSimilarity } from './lib/osm-dedupe.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceFile = path.join(root, 'data/restaurants-manuel.json');
const cacheFile = path.join(root, 'data/restaurants-manuel-geocodage.json');
const SOURCE = 'manuel';
const LOCK_ID = 8493024;
const LE_BLANC_CENTER = { latitude: 46.6333, longitude: 1.0833 };
const TYPE_MAP = {
  'kebab-snack': 'fast_food', 'restauration-rapide': 'fast_food',
  'bar-restaurant': 'bar', 'boulangerie-sandwicherie': 'other_food',
  'bar-brasserie': 'bar', 'café-restaurant': 'cafe',
  boulangerie: 'other_food', 'bar-snack-glacier': 'bar',
  restaurant: 'restaurant', 'restaurant-pizzeria': 'restaurant',
  pizzeria: 'restaurant', 'plats-a-emporter': 'fast_food',
  'restaurant-multiservices': 'restaurant', 'bar-snack': 'bar',
  'restauration-legere': 'other_food', 'restaurant-groupes': 'restaurant',
  'restaurant-bar-épicerie': 'restaurant',
  'restaurant-plats-a-emporter': 'restaurant', snack: 'fast_food',
};

const normalize = (value) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const normalizedTitle = (value) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const cityKey = (value) => normalize(value).replace(/-/g, '');
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function validate(list) {
  if (!Array.isArray(list) || list.length !== 56) throw new Error('MANUAL_LIST_COUNT_INVALID');
  const seen = new Set();
  return list.map((item) => {
    if (!item || typeof item !== 'object' || !item.nom?.trim() || !item.commune?.trim()
      || typeof item.adresse !== 'string' || (item.codePostal !== undefined && !/^\d{5}$/.test(item.codePostal))
      || typeof item.horairesPublies !== 'string'
      || typeof item.precision !== 'string' || !/^https:\/\//.test(item.source)
      || !Object.hasOwn(TYPE_MAP, item.type)) throw new Error('MANUAL_ITEM_INVALID');
    const externalId = `manuel:${normalize(`${item.nom}-${item.commune}`)}`;
    if (seen.has(externalId)) throw new Error('MANUAL_ID_DUPLICATE');
    seen.add(externalId);
    return { ...item, externalId, mappedType: TYPE_MAP[item.type] };
  });
}

async function saveCache(cache) {
  const temporary = `${cacheFile}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify(cache, null, 2)}\n`, 'utf8');
  await fs.rename(temporary, cacheFile);
}

async function geocode(items) {
  let cache;
  try { cache = JSON.parse(await fs.readFile(cacheFile, 'utf8')); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    cache = {};
  }
  const results = new Map();
  let lastRequest = 0;
  for (const item of items) {
    const query = [item.adresse || item.nom, item.codePostal, item.commune, 'France']
      .filter(Boolean).join(', ');
    if (Object.hasOwn(cache, query) && (!cache[query]
      || distanceMeters(cache[query], LE_BLANC_CENTER) <= 20000)) {
      results.set(item.externalId, cache[query]);
      continue;
    }
    await delay(Math.max(0, 1100 - (Date.now() - lastRequest)));
    lastRequest = Date.now();
    let point = null;
    try {
      const url = new URL(process.env.NOMINATIM_URL || 'https://nominatim.openstreetmap.org/search');
      url.search = new URLSearchParams({ q: query, format: 'jsonv2', limit: '1', addressdetails: '1', countrycodes: 'fr' });
      const response = await fetch(url, {
        headers: {
          'User-Agent': process.env.NOMINATIM_USER_AGENT || 'LeBlancEtMoi-restaurant-import/1.0 (https://leblanc-et-moi.pages.dev)',
          'Accept-Language': 'fr',
        },
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) throw new Error(`HTTP_${response.status}`);
      const matches = await response.json();
      const match = matches[0];
      const locality = [match?.address?.city, match?.address?.town, match?.address?.village,
        match?.address?.municipality, match?.address?.commune, match?.display_name]
        .filter(Boolean).map(cityKey);
      if (match && locality.some((value) => value.includes(cityKey(item.commune)))) {
        const latitude = Number(match.lat);
        const longitude = Number(match.lon);
        if (Number.isFinite(latitude) && Number.isFinite(longitude)
          && distanceMeters({ latitude, longitude }, LE_BLANC_CENTER) <= 20000)
          point = { latitude, longitude };
      }
      cache[query] = point;
      await saveCache(cache);
    } catch (error) {
      console.warn(JSON.stringify({ step: 'geocode_failed', name: item.nom,
        code: error?.name === 'TimeoutError' ? 'TIMEOUT' : /^HTTP_\d+$/.test(error?.message ?? '') ? error.message : 'NETWORK' }));
    }
    results.set(item.externalId, point);
  }
  return results;
}

function distanceMeters(a, b) {
  const radians = (degrees) => degrees * Math.PI / 180;
  const phi1 = radians(a.latitude);
  const phi2 = radians(b.latitude);
  const deltaPhi = radians(b.latitude - a.latitude);
  const deltaLambda = radians(b.longitude - a.longitude);
  const h = Math.sin(deltaPhi / 2) ** 2 + Math.cos(phi1) * Math.cos(phi2)
    * Math.sin(deltaLambda / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function bestDuplicate(item, point, datatourisme) {
  const candidates = datatourisme.flatMap((place) => {
    if (cityKey(place.city || '') !== cityKey(item.commune)) return [];
    const similarity = nameSimilarity(place.name, item.nom);
    if (similarity <= 0.85) return [];
    const distance = point && place.latitude != null && place.longitude != null
      ? distanceMeters(point, { latitude: Number(place.latitude), longitude: Number(place.longitude) }) : null;
    if (distance !== null && distance >= 200) return [];
    if (distance === null && similarity !== 1) return [];
    return [{ place, similarity, distance }];
  });
  return candidates.sort((a, b) => b.similarity - a.similarity
    || (a.distance ?? Infinity) - (b.distance ?? Infinity))[0] ?? null;
}

async function main() {
  if (!process.env.DATABASE_URL_DIRECT) throw new Error('DATABASE_URL_DIRECT_MISSING');
  const items = validate(JSON.parse(await fs.readFile(sourceFile, 'utf8')));
  const points = await geocode(items);
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL_DIRECT,
    connectionTimeoutMillis: 30000, query_timeout: 30000 });
  let locked = false;
  let transaction = false;
  try {
    await client.connect();
    const migration = await client.query("SELECT EXISTS (SELECT 1 FROM schema_migrations WHERE version='008_manual_places_nullable_location.sql') AS ready");
    if (!migration.rows[0]?.ready) throw new Error('MIGRATION_008_REQUIRED');
    const lock = await client.query('SELECT pg_try_advisory_lock($1) AS acquired', [LOCK_ID]);
    if (!lock.rows[0]?.acquired) throw new Error('MANUAL_IMPORT_ALREADY_RUNNING');
    locked = true;
    await client.query('BEGIN');
    transaction = true;
    const hiddenOsm = await client.query(`UPDATE places SET status='hidden'
      WHERE status='published' AND EXISTS (SELECT 1 FROM place_source_records
        WHERE place_id=places.id AND source='openstreetmap')`);
    const dt = await client.query(`SELECT p.id,p.title_i18n->>'fr' AS name,p.city,p.latitude,p.longitude
      FROM places p JOIN place_source_records sr ON sr.place_id=p.id
      WHERE sr.source='datatourisme_places' AND p.status='published'`);
    const counts = { osmHidden: hiddenOsm.rowCount, manualCreated: 0, manualUpdated: 0,
      manualDuplicatesHidden: 0, geocoded: 0, ungeocoded: 0, examples: [] };
    for (const item of items) {
      const point = points.get(item.externalId);
      if (point) counts.geocoded++; else counts.ungeocoded++;
      const existing = await client.query(`SELECT place_id FROM place_source_records
        WHERE source=$1 AND external_id=$2 FOR UPDATE`, [SOURCE, item.externalId]);
      const placeId = existing.rows[0]?.place_id ?? randomUUID();
      counts[existing.rows.length ? 'manualUpdated' : 'manualCreated']++;
      const duplicate = bestDuplicate(item, point, dt.rows);
      const reviewedDuplicate = existing.rows.length
        ? await client.query(`SELECT EXISTS (
          SELECT 1 FROM place_dedupe_candidates candidate
          JOIN places official ON official.id=candidate.left_place_id
          JOIN place_source_records source ON source.place_id=official.id
          WHERE candidate.right_place_id=$1 AND candidate.decision='merge'
            AND source.source='datatourisme_places' AND official.status='published'
        ) AS merged`, [placeId]) : null;
      const status = duplicate || reviewedDuplicate?.rows[0]?.merged ? 'hidden' : 'published';
      await client.query(`INSERT INTO places (
        id,type,subtypes,title_i18n,description_i18n,source_language,address,postal_code,city,
        latitude,longitude,location,public_url,opening_hours_raw,normalized_title,status
      ) VALUES ($1,$2,$3,$4::jsonb,$5::jsonb,'fr',$6,$7,$8,$9,$10,
        CASE WHEN $9::double precision IS NULL THEN NULL
          ELSE ST_SetSRID(ST_MakePoint($10,$9),4326)::geography END,$11,$12,$13,$14)
      ON CONFLICT (id) DO UPDATE SET
        type=EXCLUDED.type,subtypes=EXCLUDED.subtypes,title_i18n=EXCLUDED.title_i18n,
        description_i18n=EXCLUDED.description_i18n,source_language='fr',
        address=EXCLUDED.address,postal_code=EXCLUDED.postal_code,city=EXCLUDED.city,
        latitude=EXCLUDED.latitude,
        longitude=EXCLUDED.longitude,location=EXCLUDED.location,public_url=EXCLUDED.public_url,
        opening_hours_raw=EXCLUDED.opening_hours_raw,normalized_title=EXCLUDED.normalized_title,
        status=EXCLUDED.status,last_seen_at=now()`,
      [placeId,item.mappedType,[item.type],JSON.stringify({ fr: item.nom }),
        JSON.stringify(item.precision ? { fr: item.precision } : {}),
        item.adresse || null,item.codePostal || null,item.commune,
        point?.latitude ?? null,point?.longitude ?? null,
        item.source,item.horairesPublies || null,normalizedTitle(item.nom),status]);
      await client.query(`INSERT INTO place_source_records
        (id,source,external_id,place_id,source_url,raw_excerpt)
        VALUES (gen_random_uuid(),$1,$2,$3,$4,$5::jsonb)
        ON CONFLICT (source,external_id) DO UPDATE SET
          source_url=EXCLUDED.source_url,raw_excerpt=EXCLUDED.raw_excerpt,last_seen_at=now()`,
        [SOURCE,item.externalId,placeId,item.source,JSON.stringify(item)]);
      if (status === 'hidden') counts.manualDuplicatesHidden++;
      if (duplicate) {
        await client.query(`INSERT INTO place_dedupe_candidates
          (left_place_id,right_place_id,score,level,distance_meters,reason,decision)
          VALUES ($1,$2,$3,1,$4,$5::jsonb,'merge')
          ON CONFLICT (left_place_id,right_place_id) DO UPDATE SET
            score=EXCLUDED.score,level=1,distance_meters=EXCLUDED.distance_meters,
            reason=EXCLUDED.reason,decision='merge'`,
          [duplicate.place.id,placeId,Number(duplicate.similarity.toFixed(3)),
            duplicate.distance,JSON.stringify({ source: SOURCE, nameSimilarity: duplicate.similarity,
              normalizedManualName: comparableName(item.nom),
              normalizedDatatourismeName: comparableName(duplicate.place.name) })]);
        if (counts.examples.length < 10) counts.examples.push({ manual: item.nom,
          datatourisme: duplicate.place.name, distanceMeters: duplicate.distance });
      }
    }
    const bySource = await client.query(`SELECT sr.source,p.status,count(*)::int AS count
      FROM places p JOIN place_source_records sr ON sr.place_id=p.id
      WHERE sr.source IN ('datatourisme_places','openstreetmap','manuel')
      GROUP BY sr.source,p.status ORDER BY sr.source,p.status`);
    await client.query('COMMIT');
    transaction = false;
    console.log(JSON.stringify({ step: 'finished', ...counts, bySource: bySource.rows }, null, 2));
  } catch (error) {
    if (transaction) await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    if (locked) await client.query('SELECT pg_advisory_unlock($1)', [LOCK_ID]).catch(() => {});
    await client.end().catch(() => {});
  }
}

main().catch((error) => {
  console.error(JSON.stringify({ step: 'failed', code: typeof error?.code === 'string'
    ? error.code : /^[A-Z_0-9]+$/.test(error?.message ?? '') ? error.message : 'MANUAL_IMPORT_FAILED' }));
  process.exitCode = 1;
});
