import 'dotenv/config';
import pg from 'pg';

if (!process.env.DATABASE_URL_DIRECT) throw new Error('DATABASE_URL_DIRECT requise');
const client = new pg.Client({ connectionString: process.env.DATABASE_URL_DIRECT,
  connectionTimeoutMillis: 30_000, query_timeout: 30_000 });
try {
  await client.connect();
  const [migration, bySource, byType, candidates, examples, rawHoursExample] = await Promise.all([
    client.query("SELECT version, applied_at FROM schema_migrations WHERE version='007_places_osm_hours.sql'"),
    client.query(`SELECT psr.source,p.status,count(*)::int AS count FROM places p
      JOIN place_source_records psr ON psr.place_id=p.id
      WHERE psr.source IN ('datatourisme_places','openstreetmap')
      GROUP BY psr.source,p.status ORDER BY psr.source,p.status`),
    client.query(`SELECT p.type,p.status,count(*)::int AS count FROM places p
      JOIN place_source_records psr ON psr.place_id=p.id
      WHERE psr.source='openstreetmap'
      GROUP BY p.type,p.status ORDER BY p.type,p.status`),
    client.query(`SELECT level,decision,count(*)::int AS count
      FROM place_dedupe_candidates GROUP BY level,decision ORDER BY level,decision`),
    client.query(`SELECT d.level,d.decision,d.score::float8 AS score,
      d.distance_meters::float8 AS "distanceMeters",
      l.title_i18n->>'fr' AS datatourisme,r.title_i18n->>'fr' AS osm
      FROM place_dedupe_candidates d JOIN places l ON l.id=d.left_place_id
      JOIN places r ON r.id=d.right_place_id
      ORDER BY d.level,d.score DESC LIMIT 15`),
    client.query(`SELECT p.id,p.title_i18n->>'fr' AS name,p.opening_hours_raw AS hours
      FROM places p JOIN place_source_records psr ON psr.place_id=p.id
      WHERE psr.source='openstreetmap' AND p.status='published'
        AND p.opening_hours_raw IS NOT NULL
      ORDER BY p.id LIMIT 1`),
  ]);
  console.log(JSON.stringify({ migration: migration.rows[0] ?? null, bySource: bySource.rows,
    byType: byType.rows, candidates: candidates.rows, examples: examples.rows,
    rawHoursExample: rawHoursExample.rows[0] ?? null }, null, 2));
} finally {
  await client.end().catch(() => {});
}
