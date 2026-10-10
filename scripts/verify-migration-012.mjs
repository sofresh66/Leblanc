// Vérification de la migration 012 (parcours), en lecture seule (transaction READ ONLY).
// Base visée : DATABASE_URL_DIRECT, lu par dotenv (DOTENV_CONFIG_PATH pour un autre fichier).
// Usage : DOTENV_CONFIG_PATH=.env.production-backup node scripts/verify-migration-012.mjs
import 'dotenv/config';
import fs from 'node:fs';
import pg from 'pg';
import { computeChecksum } from './lib/migrations-helpers.mjs';

const url = process.env.DATABASE_URL_DIRECT;
if (!url) throw new Error('DATABASE_URL_DIRECT manquant');
console.log(`Hôte : ${new URL(url).hostname}`);
const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 30000 });
await client.connect();
await client.query('BEGIN TRANSACTION READ ONLY');
const q = async (sql, params = []) => (await client.query(sql, params)).rows;
try {
  const expected = computeChecksum(fs.readFileSync(new URL('../migrations/012_routes.sql', import.meta.url), 'utf8'));
  const [migration] = await q("SELECT checksum, applied_at FROM schema_migrations WHERE version = '012_routes.sql'");
  console.log('Migration :', migration
    ? `appliquée le ${migration.applied_at.toISOString()}, checksum ${migration.checksum === expected ? 'identique au fichier' : 'DIFFÉRENT du fichier'}`
    : 'ABSENTE');
  console.log('Tables :', (await q(`SELECT tablename FROM pg_tables WHERE schemaname = 'public'
    AND tablename IN ('routes', 'route_source_records') ORDER BY 1`)).map((r) => r.tablename).join(', ') || 'aucune');
  if (!migration) process.exit(1);
  console.log('Types :', (await q(`SELECT a.attname, format_type(a.atttypid, a.atttypmod) AS type FROM pg_attribute a
    WHERE a.attrelid = 'public.routes'::regclass AND a.attname IN ('track', 'track_simplified', 'start_location') ORDER BY 1`))
    .map((r) => `${r.attname} ${r.type}`).join(' ; '));
  console.log('Colonnes : routes', (await q("SELECT count(*)::int n FROM information_schema.columns WHERE table_name = 'routes'"))[0].n,
    '| route_source_records', (await q("SELECT count(*)::int n FROM information_schema.columns WHERE table_name = 'route_source_records'"))[0].n);
  console.log('Index :');
  for (const r of await q("SELECT indexname, indexdef FROM pg_indexes WHERE tablename IN ('routes', 'route_source_records') ORDER BY tablename, indexname")) {
    console.log(`  ${r.indexname} : ${r.indexdef.replace(/^CREATE (UNIQUE )?INDEX \S+ ON public\.\S+ /, '$1')}`);
  }
  const constraints = await q(`SELECT conrelid::regclass AS tbl, contype, count(*)::int n FROM pg_constraint
    WHERE conrelid IN ('public.routes'::regclass, 'public.route_source_records'::regclass) GROUP BY 1, 2 ORDER BY 1, 2`);
  console.log('Contraintes (c vérification, f clé étrangère, n non nul, p clé primaire, u unicité) :',
    constraints.map((r) => `${r.tbl}.${r.contype}=${r.n}`).join(' '));
  const [fk] = await q(`SELECT pg_get_constraintdef(oid) d FROM pg_constraint WHERE conrelid = 'public.route_source_records'::regclass AND contype = 'f'`);
  console.log('Clé étrangère :', fk?.d);
  console.log('Déclencheur :', (await q("SELECT tgname FROM pg_trigger WHERE tgrelid = 'public.routes'::regclass AND NOT tgisinternal")).map((r) => r.tgname).join(', '));
  console.log('Lignes : routes', (await q('SELECT count(*)::int n FROM routes'))[0].n,
    '| route_source_records', (await q('SELECT count(*)::int n FROM route_source_records'))[0].n);
} finally {
  await client.query('ROLLBACK').catch(() => {});
  await client.end();
}
