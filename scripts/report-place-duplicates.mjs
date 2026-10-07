// Rapport des doublons probables parmi les lieux publiés. Lecture seule : aucune
// fusion n'est effectuée ici ; les décisions passent par place_dedupe_candidates.
// Usage : node scripts/report-place-duplicates.mjs [--json] [--all]
// Par défaut, les paires déjà tranchées (merge, keep_separate) sont omises.
import 'dotenv/config';
import pg from 'pg';

const NEAR_METERS = 150;
const SAME_SPOT_METERS = 50;
const MIN_SIMILARITY = 0.4;
const SAME_NAME_SIMILARITY = 0.9;
const SAME_ADDRESS_SIMILARITY = 0.8;

const SQL = `
WITH published AS (
  SELECT p.id, p.title_i18n->>'fr' AS name, p.type, p.city, p.location,
    unaccent(lower(coalesce(p.title_i18n->>'fr', ''))) AS folded,
    unaccent(lower(coalesce(p.address, ''))) AS folded_address,
    (SELECT string_agg(DISTINCT sr.source, ',' ORDER BY sr.source)
     FROM place_source_records sr WHERE sr.place_id = p.id) AS sources
  FROM places p WHERE p.status = 'published'
),
pairs AS (
  SELECT a.id AS left_id, b.id AS right_id,
    CASE WHEN a.location IS NULL OR b.location IS NULL THEN NULL
      ELSE round(ST_Distance(a.location, b.location)::numeric, 1) END AS distance_m,
    round(similarity(a.folded, b.folded)::numeric, 2) AS similarity,
    CASE WHEN a.folded_address = '' OR b.folded_address = '' THEN NULL
      ELSE round(similarity(a.folded_address, b.folded_address)::numeric, 2) END AS address_similarity,
    lower(unaccent(coalesce(a.city, ''))) = lower(unaccent(coalesce(b.city, ''))) AS same_city
  FROM published a JOIN published b ON a.id < b.id
)
SELECT pr.*, l.name AS left_name, l.type AS left_type, l.sources AS left_sources, l.city AS left_city,
  r.name AS right_name, r.type AS right_type, r.sources AS right_sources, r.city AS right_city,
  d.decision AS existing_decision,
  CASE
    WHEN pr.distance_m IS NOT NULL AND pr.distance_m < $1 AND pr.similarity >= $3 THEN 'proche_et_nom_similaire'
    WHEN pr.distance_m IS NOT NULL AND pr.distance_m < $2 THEN 'meme_emplacement'
    WHEN pr.same_city AND pr.similarity >= $4 THEN 'meme_nom_meme_ville'
    WHEN pr.same_city AND pr.address_similarity >= $5 AND coalesce(pr.distance_m < $1, true) THEN 'adresse_similaire'
    ELSE 'sans_coordonnees_meme_ville'
  END AS reason
FROM pairs pr
JOIN published l ON l.id = pr.left_id
JOIN published r ON r.id = pr.right_id
LEFT JOIN place_dedupe_candidates d
  ON (d.left_place_id, d.right_place_id) IN ((pr.left_id, pr.right_id), (pr.right_id, pr.left_id))
WHERE ($6::boolean OR d.decision IS NULL OR d.decision = 'pending')
  AND ((pr.distance_m IS NOT NULL AND pr.distance_m < $1 AND pr.similarity >= $3)
   OR (pr.distance_m IS NOT NULL AND pr.distance_m < $2)
   OR (pr.distance_m IS NULL AND pr.same_city AND pr.similarity >= $3)
   OR (pr.same_city AND pr.similarity >= $4)
   OR (pr.same_city AND pr.address_similarity >= $5 AND coalesce(pr.distance_m < $1, true)))
ORDER BY pr.distance_m NULLS LAST, pr.similarity DESC`;

const databaseUrl = process.env.DATABASE_URL_DIRECT;
if (!databaseUrl) throw new Error('DATABASE_URL_DIRECT est requis');
console.error(`Base : ${new URL(databaseUrl).hostname} (lecture seule)`);

const client = new pg.Client({ connectionString: databaseUrl });
await client.connect();
try {
  await client.query('BEGIN TRANSACTION READ ONLY');
  const { rows } = await client.query(SQL, [NEAR_METERS, SAME_SPOT_METERS, MIN_SIMILARITY, SAME_NAME_SIMILARITY, SAME_ADDRESS_SIMILARITY, process.argv.includes('--all')]);
  await client.query('ROLLBACK');
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(rows, null, 2));
  } else {
    console.log(`${rows.length} paire(s) candidate(s)\n`);
    for (const row of rows) {
      const distance = row.distance_m === null ? 'sans GPS' : `${row.distance_m} m`;
      console.log(`[${row.reason}] ${distance} · similarité ${row.similarity}${row.address_similarity !== null ? ` · adresse ${row.address_similarity}` : ''}${row.existing_decision ? ` · décision existante : ${row.existing_decision}` : ''}`);
      console.log(`  A ${row.left_id}  ${row.left_name} (${row.left_type}, ${row.left_city}) [${row.left_sources}]`);
      console.log(`  B ${row.right_id}  ${row.right_name} (${row.right_type}, ${row.right_city}) [${row.right_sources}]\n`);
    }
  }
} finally {
  await client.end();
}
