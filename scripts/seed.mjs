import 'dotenv/config';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { RawEventSchema } from '@leblanc/shared';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MOCK_EVENTS_FILE = path.resolve(__dirname, '../frontend/src/api/__mocks__/events.json');

function normalizeTitle(title) {
  return title
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/**
 * Calcule l'empreinte de la séance préfixée par 'mock:'
 * pour permettre un ciblage précis lors de la réconciliation.
 */
function computeFingerprint(eventId, startDate, endDate) {
  const raw = `${eventId}_${startDate}_${endDate || ''}`;
  const hash = crypto.createHash('sha256').update(raw, 'utf-8').digest('hex');
  return `mock:${hash}`;
}

async function runSeed() {
  const databaseUrl = process.env.DATABASE_URL_DIRECT;

  if (!databaseUrl) {
    console.error(
      "❌ Erreur : La variable d'environnement DATABASE_URL_DIRECT est requise.\n" +
        "Veuillez définir DATABASE_URL_DIRECT dans votre fichier .env avec l'URL de connexion directe PostgreSQL Neon.",
    );
    process.exit(1);
  }

  if (!fs.existsSync(MOCK_EVENTS_FILE)) {
    console.error(`❌ Fichier mock introuvable : "${MOCK_EVENTS_FILE}"`);
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

  try {
    const rawData = JSON.parse(fs.readFileSync(MOCK_EVENTS_FILE, 'utf-8'));
    console.log(`🌱 Chargement de ${rawData.length} événements mock...`);

    let processedCount = 0;

    await client.query('BEGIN');

    for (const rawEvent of rawData) {
      // Validation stricte du schéma
      const parsed = RawEventSchema.parse(rawEvent);

      const normTitle = normalizeTitle(parsed.title_i18n.fr);
      const fingerprint = computeFingerprint(parsed.id, parsed.startDate, parsed.endDate);

      // 1. Insertion ou mise à jour dans events
      await client.query(
        `
        INSERT INTO events (
          id, category, title_i18n, description_i18n, source_language,
          venue_name, address, postal_code, city, latitude, longitude,
          location, public_url, image_url, is_free, price_min, currency,
          status, normalized_title, updated_at, last_seen_at
        ) VALUES (
          $1, $2, $3, $4, 'fr',
          $5, $6, $7, $8, $9, $10,
          ST_SetSRID(ST_MakePoint($10, $9), 4326)::geography,
          $11, $12, $13, $14, $15,
          'published', $16, now(), now()
        )
        ON CONFLICT (id) DO UPDATE SET
          category = EXCLUDED.category,
          title_i18n = EXCLUDED.title_i18n,
          description_i18n = EXCLUDED.description_i18n,
          venue_name = EXCLUDED.venue_name,
          address = EXCLUDED.address,
          postal_code = EXCLUDED.postal_code,
          city = EXCLUDED.city,
          latitude = EXCLUDED.latitude,
          longitude = EXCLUDED.longitude,
          location = EXCLUDED.location,
          public_url = EXCLUDED.public_url,
          image_url = EXCLUDED.image_url,
          is_free = EXCLUDED.is_free,
          price_min = EXCLUDED.price_min,
          currency = EXCLUDED.currency,
          status = EXCLUDED.status,
          normalized_title = EXCLUDED.normalized_title,
          updated_at = now(),
          last_seen_at = now();
        `,
        [
          parsed.id,
          parsed.category,
          JSON.stringify(parsed.title_i18n),
          JSON.stringify(parsed.description_i18n),
          parsed.venueName,
          parsed.address,
          parsed.postalCode,
          parsed.city,
          parsed.latitude,
          parsed.longitude,
          parsed.publicUrl,
          parsed.imageUrl,
          parsed.isFree,
          parsed.priceMin,
          parsed.currency,
          normTitle,
        ],
      );

      // 2. Insertion ou mise à jour de l'occurrence temporelle
      await client.query(
        `
        INSERT INTO event_occurrences (
          id, event_id, starts_at, ends_at, timezone, status, source_fingerprint
        ) VALUES (
          gen_random_uuid(), $1, $2, $3, $4, 'scheduled', $5
        )
        ON CONFLICT (event_id, source_fingerprint) DO UPDATE SET
          starts_at = EXCLUDED.starts_at,
          ends_at = EXCLUDED.ends_at,
          timezone = EXCLUDED.timezone,
          status = EXCLUDED.status;
        `,
        [
          parsed.id,
          parsed.startDate,
          parsed.endDate,
          parsed.timezone || 'Europe/Paris',
          fingerprint,
        ],
      );

      // Réconciliation des anciennes occurrences mock de cet événement (Correction 1)
      // Ne supprime que les occurrences préfixées par 'mock:' qui ne correspondent plus
      const expectedFingerprints = [fingerprint];
      await client.query(
        `
        DELETE FROM event_occurrences
        WHERE event_id = $1
          AND source_fingerprint LIKE 'mock:%'
          AND source_fingerprint <> ALL($2::text[])
        `,
        [parsed.id, expectedFingerprints],
      );

      // 3. Insertion ou mise à jour dans source_records
      await client.query(
        `
        INSERT INTO source_records (
          id, source, external_id, event_id, source_url, source_updated_at, raw_excerpt, last_seen_at
        ) VALUES (
          gen_random_uuid(), 'mock', $1, $1, $2, now(), $3, now()
        )
        ON CONFLICT (source, external_id) DO UPDATE SET
          source_url = EXCLUDED.source_url,
          source_updated_at = now(),
          raw_excerpt = EXCLUDED.raw_excerpt,
          last_seen_at = now();
        `,
        [
          parsed.id,
          parsed.publicUrl,
          JSON.stringify(parsed),
        ],
      );

      processedCount++;
    }

    // 4. Vérification stricte et ciblée des 25 mocks AVANT le COMMIT (Correction 2)
    const mockIds = rawData.map((e) => e.id);

    const { rows: evRows } = await client.query(
      'SELECT count(*)::int as count FROM events WHERE id = ANY($1::uuid[])',
      [mockIds],
    );
    const { rows: occRows } = await client.query(
      'SELECT count(*)::int as count FROM event_occurrences WHERE event_id = ANY($1::uuid[])',
      [mockIds],
    );
    const { rows: srcRows } = await client.query(
      "SELECT count(*)::int as count FROM source_records WHERE source = 'mock' AND external_id = ANY($1::text[])",
      [mockIds],
    );

    const evCount = Number(evRows[0].count);
    const occCount = Number(occRows[0].count);
    const srcCount = Number(srcRows[0].count);

    console.log(`📊 Vérification stricte des données mock (avant COMMIT) :`);
    console.log(`   - Événements  : ${evCount} / 25 attendus`);
    console.log(`   - Occurrences : ${occCount} / 25 attendues`);
    console.log(`   - Sources     : ${srcCount} / 25 attendues`);

    if (evCount !== 25 || occCount !== 25 || srcCount !== 25) {
      throw new Error(
        `Vérification échouée: events=${evCount}, occurrences=${occCount}, sources=${srcCount} (attendu: 25/25/25)`,
      );
    }

    await client.query('COMMIT');
    console.log(`✅ ${processedCount} événements traités avec succès.`);
    console.log('🎉 Seed de la base de données validé et commité avec succès !');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Échec lors du seed de la base de données :', err instanceof Error ? err.message : err);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

runSeed();
