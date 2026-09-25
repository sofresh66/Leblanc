import 'dotenv/config';
import pg from 'pg';

const action = process.argv[2];
if (!['--hide', '--unhide'].includes(action) || process.argv.length !== 3) {
  console.error('Usage : npm run db:openagenda -- --hide | --unhide');
  process.exit(1);
}
if (!process.env.DATABASE_URL_DIRECT) {
  console.error('DATABASE_URL_DIRECT requis');
  process.exit(1);
}

const agendaUids = ['54621', '86244142'];
const hiding = action === '--hide';
const targetStatus = hiding ? 'hidden' : 'published';
const previousStatus = hiding ? 'published' : 'hidden';
const client = new pg.Client({
  connectionString: process.env.DATABASE_URL_DIRECT,
  connectionTimeoutMillis: 30_000,
  query_timeout: 30_000,
  statement_timeout: 30_000,
});

try {
  await client.connect();
  await client.query('BEGIN');
  const agendas = await client.query(
    'UPDATE source_agendas SET enabled=$1 WHERE agenda_uid=ANY($2::text[])',
    [!hiding, agendaUids],
  );
  if (agendas.rowCount !== agendaUids.length) {
    throw new Error('AGENDAS_MISSING');
  }
  const events = await client.query(
    `UPDATE events AS e SET status=$1
     WHERE e.status=$2
       AND EXISTS (SELECT 1 FROM source_records sr
                   WHERE sr.event_id=e.id AND sr.source='openagenda')
       AND NOT EXISTS (SELECT 1 FROM source_records sr
                       WHERE sr.event_id=e.id AND sr.source<>'openagenda')`,
    [targetStatus, previousStatus],
  );
  await client.query('COMMIT');
  console.log(
    JSON.stringify({
      step: 'openagenda_status',
      timestamp: new Date().toISOString(),
      agendas: agendas.rowCount,
      events: events.rowCount,
      enabled: !hiding,
      status: targetStatus,
      errors: 0,
    }),
  );
} catch (error) {
  await client.query('ROLLBACK').catch(() => {});
  console.error(
    JSON.stringify({
      step: 'openagenda_status',
      timestamp: new Date().toISOString(),
      agendas: 0,
      events: 0,
      errors: 1,
      code: error?.code ?? (error?.message === 'AGENDAS_MISSING' ? 'AGENDAS_MISSING' : 'DB_ERROR'),
    }),
  );
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
