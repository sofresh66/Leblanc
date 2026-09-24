import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import {
  sortMigrations,
  computeChecksum,
} from './lib/migrations-helpers.mjs';

// Verrou consultatif unique pour ce projet. Ne pas réutiliser cette 
// valeur dans un autre contexte.
const MIGRATION_LOCK_ID = 8493021;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MIGRATIONS_DIR = path.resolve(__dirname, '../migrations');

async function runMigrations() {
  const databaseUrl = process.env.DATABASE_URL_DIRECT;

  if (!databaseUrl) {
    console.error(
      "❌ Erreur : La variable d'environnement DATABASE_URL_DIRECT est requise.\n" +
        "Veuillez définir DATABASE_URL_DIRECT dans votre fichier .env avec l'URL de connexion directe PostgreSQL Neon.",
    );
    process.exit(1);
  }

  // Connexion persistante unique via pg.Client (requis pour pg_advisory_lock)
  const client = new pg.Client({
    connectionString: databaseUrl,
    connectionTimeoutMillis: 30000, // 30s max pour établir la connexion (NB3)
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

  let lockAcquired = false;

  try {
    // 1. Acquisition du verrou consultatif exclusif pour éviter les exécutions concurrentes
    await client.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK_ID]);
    lockAcquired = true;

    // 2. Initialisation de la table de suivi des migrations si inexistante
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version TEXT PRIMARY KEY,
        checksum TEXT NOT NULL,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);

    // 3. Découverte et ordonnancement déterministe des fichiers SQL
    if (!fs.existsSync(MIGRATIONS_DIR)) {
      throw new Error(`Le dossier des migrations "${MIGRATIONS_DIR}" est introuvable.`);
    }

    const files = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql'));
    const sortedFiles = sortMigrations(files);

    // 4. Récupération des migrations déjà appliquées
    const { rows: appliedRows } = await client.query(
      'SELECT version, checksum FROM schema_migrations',
    );
    const appliedMap = new Map(appliedRows.map((r) => [r.version, r.checksum]));

    console.log(`📦 Vérification de ${sortedFiles.length} fichier(s) de migration...`);

    let appliedCount = 0;

    for (const filename of sortedFiles) {
      const filePath = path.join(MIGRATIONS_DIR, filename);
      const rawContent = fs.readFileSync(filePath, 'utf-8');

      // Calcul du checksum SHA-256 avec normalisation des retours à la ligne (CRLF -> LF)
      // pour éviter les faux positifs de modification entre environnements Windows et Linux.
      const checksum = computeChecksum(rawContent);

      if (appliedMap.has(filename)) {
        const recordedChecksum = appliedMap.get(filename);
        if (recordedChecksum !== checksum) {
          throw new Error(
            `❌ Échec d'intégrité : Le fichier "${filename}" a été altéré après son application.\n` +
              `Checksum enregistré : ${recordedChecksum}\n` +
              `Checksum actuel       : ${checksum}`,
          );
        }
        console.log(`  ✓ [DÉJÀ APPLIQUÉE] ${filename}`);
      } else {
        // Exécution atomique de la migration dans une transaction
        console.log(`  ⏳ [EN COURS] Application de ${filename}...`);
        await client.query('BEGIN');
        try {
          await client.query(rawContent);
          await client.query(
            'INSERT INTO schema_migrations (version, checksum) VALUES ($1, $2)',
            [filename, checksum],
          );
          await client.query('COMMIT');
          console.log(`  ✅ [APPLIQUÉE] ${filename}`);
          appliedCount++;
        } catch (migrationErr) {
          await client.query('ROLLBACK');
          throw migrationErr;
        }
      }
    }

    console.log(
      `🎉 Migrations terminées avec succès : ${appliedCount} nouvelle(s) migration(s) appliquée(s).`,
    );
  } catch (err) {
    console.error('❌ Échec lors de l’exécution des migrations :', err instanceof Error ? err.message : err);
    process.exitCode = 1;
  } finally {
    // Libération garantie du verrou consultatif et fermeture de la connexion
    if (lockAcquired) {
      try {
        await client.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK_ID]);
      } catch (unlockErr) {
        console.error('Erreur lors de la libération du verrou advisory :', unlockErr);
      }
    }
    await client.end();
  }
}

runMigrations();
