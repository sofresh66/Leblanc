import 'dotenv/config';
import pg from 'pg';

const EXPECTED_TABLES = [
  'schema_migrations',
  'events',
  'event_occurrences',
  'source_records',
  'source_agendas',
  'sync_state',
  'ingestion_runs',
  'dedupe_candidates',
];

async function runTests() {
  const databaseUrl = process.env.DATABASE_URL_DIRECT;

  if (!databaseUrl) {
    console.error(
      "❌ Erreur : La variable d'environnement DATABASE_URL_DIRECT est requise.\n" +
        "Veuillez définir DATABASE_URL_DIRECT dans votre fichier .env avec l'URL de connexion directe PostgreSQL Neon.",
    );
    process.exit(1);
  }

  const client = new pg.Client({
    connectionString: databaseUrl,
    connectionTimeoutMillis: 30000, // 30s max (NB3)
  });

  try {
    await client.connect();
  } catch (err) {
    console.error(
      "❌ Impossible de se connecter à la base après 30s. " +
        "Vérifie que DATABASE_URL_DIRECT est correct et que la branche Neon n'est pas suspendue.\n",
      err instanceof Error ? err.message : String(err),
    );
    process.exit(1);
  }

  let allPassed = true;
  console.log('🧪 Lancement des vérifications de la base de données PostgreSQL / Neon...\n');

  try {
    // Test 1 : Extension PostGIS
    try {
      const { rows } = await client.query('SELECT postgis_version() AS version');
      console.log(`✅ [1/5] PostGIS installé et actif : version ${rows[0].version}`);
    } catch (err) {
      console.error('❌ [1/5] PostGIS manquant ou inactif :', err instanceof Error ? err.message : err);
      allPassed = false;
    }

    // Test 2 : Présence des tables du schéma
    try {
      const { rows } = await client.query(`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
      `);
      const existingTables = new Set(rows.map((r) => r.table_name));
      const missingTables = EXPECTED_TABLES.filter((t) => !existingTables.has(t));

      if (missingTables.length === 0) {
        console.log(`✅ [2/5] Toutes les 8 tables applicatives sont présentes (${EXPECTED_TABLES.join(', ')})`);
      } else {
        console.error(`❌ [2/5] Tables manquantes : ${missingTables.join(', ')}`);
        allPassed = false;
      }
    } catch (err) {
      console.error('❌ [2/5] Erreur lors de la vérification des tables :', err instanceof Error ? err.message : err);
      allPassed = false;
    }

    // Test 3 : Calcul spatial PostGIS - Point proche (< 20 km)
    // Le Blanc (1.0833, 46.6333) <-> Ingrandes (0.963, 46.598) ~10 km
    try {
      const { rows } = await client.query(`
        SELECT ST_DWithin(
          ST_SetSRID(ST_MakePoint(1.0833, 46.6333), 4326)::geography,
          ST_SetSRID(ST_MakePoint(0.9630, 46.5980), 4326)::geography,
          20000
        ) AS is_within;
      `);
      if (rows[0].is_within === true) {
        console.log('✅ [3/5] PostGIS ST_DWithin : point proche (Ingrandes ~10 km) inclus dans les 20 km');
      } else {
        console.error('❌ [3/5] Échec du calcul spatial ST_DWithin pour le point proche');
        allPassed = false;
      }
    } catch (err) {
      console.error('❌ [3/5] Erreur lors du calcul spatial point proche :', err instanceof Error ? err.message : err);
      allPassed = false;
    }

    // Test 4 : Calcul spatial PostGIS - Point lointain (> 20 km)
    // Le Blanc (1.0833, 46.6333) <-> Châtellerault (0.545, 46.817) ~45 km
    try {
      const { rows } = await client.query(`
        SELECT ST_DWithin(
          ST_SetSRID(ST_MakePoint(1.0833, 46.6333), 4326)::geography,
          ST_SetSRID(ST_MakePoint(0.5450, 46.8170), 4326)::geography,
          20000
        ) AS is_within;
      `);
      if (rows[0].is_within === false) {
        console.log('✅ [4/5] PostGIS ST_DWithin : point lointain (Châtellerault ~45 km) exclu des 20 km');
      } else {
        console.error('❌ [4/5] Échec du calcul spatial ST_DWithin pour le point lointain');
        allPassed = false;
      }
    } catch (err) {
      console.error('❌ [4/5] Erreur lors du calcul spatial point lointain :', err instanceof Error ? err.message : err);
      allPassed = false;
    }

    // Test 5 : Fonctionnement du trigger updated_at (Correction 3)
    const testEventId = '00000000-0000-0000-0000-000000000001';
    try {
      // Nettoyage préalable au cas où
      await client.query('DELETE FROM events WHERE id = $1', [testEventId]);

      // Insertion d'un événement temporaire
      await client.query(
        `
        INSERT INTO events (
          id, category, title_i18n, source_language,
          latitude, longitude, location, is_free,
          normalized_title, status
        ) VALUES (
          $1, 'autre', '{"fr":"test_trigger"}'::jsonb, 'fr',
          46.6333, 1.0833, ST_SetSRID(ST_MakePoint(1.0833, 46.6333), 4326)::geography,
          true, 'test_trigger', 'published'
        )
        `,
        [testEventId],
      );

      const beforeRes = await client.query('SELECT updated_at FROM events WHERE id = $1', [testEventId]);
      const beforeTime = new Date(beforeRes.rows[0].updated_at).getTime();

      // Pause de 100ms pour garantir un écart temporel mesurable
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Mise à jour de l'événement pour déclencher le trigger
      await client.query('UPDATE events SET city = $2 WHERE id = $1', [testEventId, 'Ville Test']);

      const afterRes = await client.query('SELECT updated_at FROM events WHERE id = $1', [testEventId]);
      const afterTime = new Date(afterRes.rows[0].updated_at).getTime();

      if (afterTime > beforeTime) {
        console.log("✅ [5/5] Trigger updated_at : met à jour automatiquement updated_at lors d'un UPDATE");
      } else {
        console.error("❌ [5/5] Trigger updated_at : le timestamp n'a pas été incrémenté lors de l'UPDATE");
        allPassed = false;
      }
    } catch (err) {
      console.error('❌ [5/5] Erreur lors du test du trigger updated_at :', err instanceof Error ? err.message : err);
      allPassed = false;
    } finally {
      // Nettoyage garanti de l'enregistrement de test
      try {
        await client.query('DELETE FROM events WHERE id = $1', [testEventId]);
      } catch (cleanupErr) {
        console.error("Erreur lors du nettoyage de l'événement de test :", cleanupErr);
      }
    }

    if (allPassed) {
      console.log('\n🎉 Tous les tests de validation de la base de données sont validés !');
    } else {
      console.error('\n❌ Un ou plusieurs tests de base de données ont échoué.');
      process.exitCode = 1;
    }
  } finally {
    await client.end();
  }
}

runTests();
