import 'dotenv/config';
import pg from 'pg';

const action = process.argv[2];
if (!['--hide', '--unhide'].includes(action) || process.argv.length !== 3) {
  console.error('Usage : npm run db:mocks -- --hide | --unhide');
  process.exit(1);
}
if (!process.env.DATABASE_URL_DIRECT) {
  console.error('DATABASE_URL_DIRECT requis');
  process.exit(1);
}
const client = new pg.Client({
  connectionString: process.env.DATABASE_URL_DIRECT,
  connectionTimeoutMillis: 30_000,
  query_timeout: 30_000,
  statement_timeout: 30_000,
});
try {
  await client.connect();
  const status = action === '--hide' ? 'hidden' : 'published';
  const result = await client.query(
    `
    UPDATE events AS e SET status=$1
    WHERE EXISTS (SELECT 1 FROM source_records sr WHERE sr.event_id=e.id AND sr.source='mock')
      AND NOT EXISTS (SELECT 1 FROM source_records sr WHERE sr.event_id=e.id AND sr.source<>'mock')
  `,
    [status],
  );
  console.log(
    JSON.stringify({
      step: 'mocks_status',
      timestamp: new Date().toISOString(),
      count: result.rowCount,
      errors: 0,
      status,
    }),
  );
} catch (error) {
  console.error(
    JSON.stringify({
      step: 'mocks_status',
      timestamp: new Date().toISOString(),
      count: 0,
      errors: 1,
      code: error?.code ?? 'DB_ERROR',
    }),
  );
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
