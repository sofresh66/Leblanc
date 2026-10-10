// Retour arrière de l'ingestion des parcours : vide routes et route_source_records
// dans une seule transaction (le schéma de la migration 012 est conservé).
// Par défaut : lecture seule (décompte). Écriture seulement avec --apply ET
// --confirm-host=<hôte> égal à l'hôte réellement visé.
// Usage : DOTENV_CONFIG_PATH=.env.production-backup node scripts/clear-routes.mjs [--apply --confirm-host=ep-…]
import 'dotenv/config';
import pg from 'pg';

const url = process.env.DATABASE_URL_DIRECT;
if (!url) throw new Error('DATABASE_URL_DIRECT manquant');
const host = new URL(url).hostname;
const apply = process.argv.includes('--apply');
const confirmed = process.argv.find((arg) => arg.startsWith('--confirm-host='))?.slice('--confirm-host='.length);
console.log(`Hôte : ${host} (${apply ? 'ÉCRITURE' : 'lecture seule'})`);
if (apply && confirmed !== host) throw new Error(`--confirm-host doit valoir exactement ${host} : rien n'est écrit`);

const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 30000 });
await client.connect();
const counts = async () => (await client.query(
  'SELECT (SELECT count(*)::int FROM routes) AS routes, (SELECT count(*)::int FROM route_source_records) AS sources')).rows[0];
try {
  console.log('Avant :', await counts());
  if (!apply) process.exit(0);
  await client.query('BEGIN');
  // route_source_records d'abord (clé étrangère), puis routes.
  const sources = await client.query('DELETE FROM route_source_records');
  const routes = await client.query('DELETE FROM routes');
  await client.query('COMMIT');
  console.log(`Supprimé : ${routes.rowCount} parcours, ${sources.rowCount} fiches source`);
  console.log('Après :', await counts());
} catch (error) {
  await client.query('ROLLBACK').catch(() => {});
  throw error;
} finally {
  await client.end();
}
