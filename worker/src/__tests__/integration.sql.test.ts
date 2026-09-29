import { randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { EventDetailSchema, LE_BLANC_CENTER, PlaceApiSchema, type Event } from '@leblanc/shared';
import { executeQuery } from '../db/client.js';
import { getEventByIdFromDb, listEventsFromDb } from '../db/events.js';
import { listCitiesFromDb } from '../db/referenceData.js';
import { getPlaceByIdFromDb, listPlaceCategoriesFromDb, listPlacesFromDb } from '../db/places.js';
import { parsePlaceListQuery } from '../validation/placesQuery.js';
import { decodeCursor } from '../validation/cursor.js';
import { parseEventListQuery } from '../validation/query.js';

const databaseUrl = process.env.DATABASE_URL_DIRECT ?? '';
const isCI = process.env.CI === 'true' || !!process.env.GITHUB_ACTIONS;

// Échec franc en local si la variable n'est pas définie (évite un succès trompeur).
// En CI, on autorise le skip car les secrets ne sont pas disponibles.
if (!databaseUrl && !isCI) {
  throw new Error(
    'DATABASE_URL_DIRECT est requis pour exécuter test:integration en ' +
      'local. Renseignez-le dans votre .env, ou définissez CI=true pour ' +
      'ignorer ces tests.'
  );
}

// Aucun INSERT, UPDATE, DELETE, seed ou migration : les fixtures sont découvertes par SELECT.
describe.skipIf(!databaseUrl)('Intégration SQL sur Neon réel, en lecture seule', () => {
  let nowIso: string;
  let existing: Event;
  let outsideId: string | null;
  let missingId: string;

  beforeAll(async () => {
    // Le réveil Neon dispose de 30 secondes ; les requêtes applicatives restent limitées à 5 secondes.
    await executeQuery(databaseUrl, 'SELECT 1 AS ready', [], 30000);
    nowIso = new Date().toISOString();
    const page = await listEventsFromDb(databaseUrl, { lang: 'fr', limit: 50 }, nowIso);
    const first = page.items[0];
    if (!first || page.items.length < 6) {
      throw new Error('Fixtures Neon insuffisantes : au moins six événements admissibles sont nécessaires');
    }
    existing = first;
    const outside = await executeQuery<{ id: string }>(databaseUrl, `
      SELECT id FROM events
      WHERE status = 'published'
        AND NOT ST_DWithin(location, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography, 20000)
      ORDER BY id LIMIT 1`, [LE_BLANC_CENTER.lng, LE_BLANC_CENTER.lat]);
    outsideId = outside[0]?.id ?? null;
    missingId = randomUUID();
    const collision = await executeQuery(databaseUrl, 'SELECT id FROM events WHERE id = $1::uuid', [missingId]);
    if (collision.length) throw new Error('Collision inattendue de la fixture UUID absente');
  });

  it('liste des événements sans filtre', async () => {
    const page = await listEventsFromDb(databaseUrl, { lang: 'fr', limit: 20 }, nowIso);
    expect(page.items.length).toBeGreaterThan(0);
    expect(page).not.toHaveProperty('total');
  });

  it('résout une description anglaise réelle sans titre anglais', async () => {
    const rows = await executeQuery<{ id: string; description_en: string }>(databaseUrl, `
      SELECT id, description_i18n->>'en' AS description_en FROM events
      WHERE status='published' AND coalesce(title_i18n->>'en','')=''
        AND coalesce(description_i18n->>'en','')<>''
        AND ST_DWithin(location, ST_SetSRID(ST_MakePoint($1,$2),4326)::geography,20000)
      ORDER BY id LIMIT 1`, [LE_BLANC_CENTER.lng, LE_BLANC_CENTER.lat]);
    const row = rows[0];
    if (!row) throw new Error('Fixture bilingue absente');
    const event = await getEventByIdFromDb(databaseUrl, row.id, 'en', nowIso);
    expect(event).toMatchObject({
      description: row.description_en, contentLanguage: 'fr', descriptionLanguage: 'en',
    });
  });

  it('retourne cinq événements et un curseur', async () => {
    const page = await listEventsFromDb(databaseUrl, { lang: 'fr', limit: 5 }, nowIso);
    expect(page.items).toHaveLength(5);
    expect(page.nextCursor).toBeTypeOf('string');
  });

  it('charge une seconde page sans doublon', async () => {
    const first = await listEventsFromDb(databaseUrl, { lang: 'fr', limit: 5 }, nowIso);
    if (!first.nextCursor) throw new Error('Curseur attendu');
    const second = await listEventsFromDb(databaseUrl, {
      lang: 'fr', limit: 5, decodedCursor: decodeCursor(first.nextCursor),
    }, nowIso);
    expect(second.items.length).toBeGreaterThan(0);
    const ids = new Set(first.items.map((event) => event.id));
    expect(second.items.every((event) => !ids.has(event.id))).toBe(true);
  });

  it('filtre la catégorie culture', async () => {
    const page = await listEventsFromDb(databaseUrl, { lang: 'fr', limit: 50, categories: ['culture'] }, nowIso);
    expect(page.items.length).toBeGreaterThan(0);
    expect(page.items.every((event) => event.category === 'culture')).toBe(true);
  });

  it('respecte le rayon de dix kilomètres', async () => {
    const page = await listEventsFromDb(databaseUrl, { lang: 'fr', limit: 50, maxDistance: 10000 }, nowIso);
    expect(page.items.length).toBeGreaterThan(0);
    expect(page.items.every((event) => event.distance <= 10000)).toBe(true);
  });

  it('retourne le détail et toutes ses occurrences programmées', async () => {
    const detail = EventDetailSchema.parse(await getEventByIdFromDb(databaseUrl, existing.id, 'fr', nowIso));
    const occurrences = await executeQuery<{ id: string }>(databaseUrl, `
      SELECT id FROM event_occurrences WHERE event_id = $1::uuid AND status = 'scheduled'
      ORDER BY starts_at, id`, [existing.id]);
    expect(detail.id).toBe(existing.id);
    expect(detail.occurrences.length).toBeGreaterThan(0);
    expect(detail.occurrences.map((occurrence) => occurrence.id)).toEqual(occurrences.map((row) => row.id));
  });

  it('retourne null pour un événement inexistant', async () => {
    expect(await getEventByIdFromDb(databaseUrl, missingId, 'fr', nowIso)).toBeNull();
  });

  it('retourne null pour un événement publié hors du rayon', async () => {
    if (outsideId) {
      expect(await getEventByIdFromDb(databaseUrl, outsideId, 'fr', nowIso)).toBeNull();
    } else {
      const outside = await executeQuery<{ id: string }>(databaseUrl, `
        SELECT id FROM events WHERE status = 'published'
          AND NOT ST_DWithin(location,
            ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography, 20000)
        LIMIT 1`, [LE_BLANC_CENTER.lng, LE_BLANC_CENTER.lat]);
      expect(outside).toEqual([]);
    }
  });

  it('liste Le Blanc parmi les villes actives', async () => {
    expect(await listCitiesFromDb(databaseUrl, nowIso)).toContain('Le Blanc');
  });

  it('dérive la provenance depuis source_records', async () => {
    const sources = await executeQuery<{ source: string }>(databaseUrl,
      'SELECT DISTINCT source FROM source_records WHERE event_id = $1::uuid ORDER BY source', [existing.id]);
    expect(sources.length).toBeGreaterThan(0);
    expect(existing.source).toBe(sources.map((row) => row.source).join(', '));
  });

  it('filtre les événements gratuits et une ville sans interpoler les valeurs', async () => {
    const page = await listEventsFromDb(databaseUrl, { lang: 'fr', limit: 50, isFree: true, city: 'Le Blanc' }, nowIso);
    expect(page.items.length).toBeGreaterThan(0);
    expect(page.items.every((event) => event.isFree && event.city === 'Le Blanc')).toBe(true);
    const injection = await listEventsFromDb(databaseUrl, { lang: 'fr', limit: 5, city: "' OR true --" }, nowIso);
    expect(injection.items).toEqual([]);
  });

  it('exécute le filtre to exclusif dans PostgreSQL', async () => {
    const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(new Date(existing.startDate));
    const query = parseEventListQuery(new URL(`https://example.test/?to=${date}&limit=50`));
    const page = await listEventsFromDb(databaseUrl, query, nowIso);
    expect(page.items.length).toBeGreaterThan(0);
    expect(page.items.every((event) => Date.parse(event.startDate) < Date.parse(query.to ?? ''))).toBe(true);
  });
});

describe.skipIf(!databaseUrl)('Intégration SQL des lieux, en lecture seule', () => {
  const now = new Date();
  const query = (search: string) => parsePlaceListQuery(new URL(`https://example.test/api/v1/places${search}`));

  beforeAll(async () => {
    await executeQuery(databaseUrl, 'SELECT 1 AS ready', [], 30000);
  });

  it('ne publie aucune note interne des lieux manuels et conserve leur trace privée', async () => {
    // Les fiches déjà masquées ne font pas partie du nettoyage public approuvé.
    const suspicious = await executeQuery<{ id: string }>(databaseUrl, `
      SELECT p.id FROM places p
      WHERE p.status='published'
        AND EXISTS (SELECT 1 FROM place_source_records sr WHERE sr.place_id=p.id AND sr.source='manuel')
        AND p.description_i18n::text ~* '(doublon|vérifier|à confirmer|incertain|suspect|à revoir|non confirm)'`);
    expect(suspicious).toEqual([]);
    const manual = await executeQuery<{ id: string; description_i18n: Record<string, string>; precision: string }>(databaseUrl, `
      SELECT p.id,p.description_i18n,sr.raw_excerpt->>'precision' AS precision
      FROM places p JOIN place_source_records sr ON sr.place_id=p.id AND sr.source='manuel'
      WHERE p.status='published' AND coalesce(sr.raw_excerpt->>'precision','')<>''`);
    expect(manual.length).toBeGreaterThan(0);
    for (const place of manual) {
      expect(place.description_i18n).toEqual({});
      expect(place.precision.length).toBeGreaterThan(0);
    }
  });

  it('récupère trois lieux publiés', async () => {
    const page = await listPlacesFromDb(databaseUrl, query('?limit=3'), now);
    expect(page.items).toHaveLength(3);
    expect(page.items.every((place) => place.status === 'published')).toBe(true);
  });

  it('filtre par type restaurant', async () => {
    const page = await listPlacesFromDb(databaseUrl, query('?type=restaurant&limit=50'), now);
    expect(page.items.length).toBeGreaterThan(0);
    expect(page.items.every((place) => place.type === 'restaurant')).toBe(true);
  });

  it('filtre par cuisine présente dans le référentiel', async () => {
    const categories = await listPlaceCategoriesFromDb(databaseUrl);
    const cuisine = categories.cuisines[0]?.value;
    if (!cuisine) throw new Error('Aucune cuisine disponible pour la fixture');
    const page = await listPlacesFromDb(databaseUrl, query(`?cuisine=${encodeURIComponent(cuisine)}&limit=50`), now);
    expect(page.items.length).toBeGreaterThan(0);
    expect(page.items.every((place) => place.cuisines.includes(cuisine))).toBe(true);
  });

  it('applique ST_DWithin dans le rayon de 20 km', async () => {
    const page = await listPlacesFromDb(databaseUrl, query('?limit=50'), now);
    expect(page.items.length).toBeGreaterThan(0);
    expect(page.items.every((place) => place.distance === null || place.distance <= 20000)).toBe(true);
  });

  it('retourne les lieux sans GPS après les lieux géocodés, jusque dans la pagination', async () => {
    const rows = await executeQuery<{ id: string }>(databaseUrl, `
      SELECT id FROM places WHERE status='published' AND location IS NULL ORDER BY id`);
    const items: { id: string; distance: number | null }[] = [];
    let cursor: string | null = null;
    for (let pageNumber = 0; pageNumber < 10; pageNumber++) {
      const page = await listPlacesFromDb(databaseUrl,
        query(`?limit=50${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`), now);
      items.push(...page.items.map(({ id, distance }) => ({ id, distance })));
      cursor = page.nextCursor;
      if (!cursor) break;
    }
    expect(cursor).toBeNull();
    expect(items.filter((place) => place.distance === null).map((place) => place.id))
      .toEqual(rows.map(({ id }) => id));
    const firstMissing = items.findIndex((place) => place.distance === null);
    if (firstMissing >= 0) expect(items.slice(firstMissing).every((place) => place.distance === null)).toBe(true);
  });

  it('dispose de la colonne des horaires OSM et de la table de déduplication', async () => {
    const columns = await executeQuery<{ column_name: string }>(databaseUrl, `
      SELECT column_name FROM information_schema.columns
      WHERE table_name='places' AND column_name='opening_hours_raw'`);
    const tables = await executeQuery<{ name: string | null }>(databaseUrl,
      "SELECT to_regclass('place_dedupe_candidates')::text AS name");
    expect(columns).toHaveLength(1);
    expect(tables[0]?.name).toBe('place_dedupe_candidates');
  });

  it('compte les lieux OSM ingérés sans doublon de source', async () => {
    const rows = await executeQuery<{ total: string; unique_ids: string }>(databaseUrl, `
      SELECT count(*)::text AS total, count(DISTINCT external_id)::text AS unique_ids
      FROM place_source_records WHERE source='openstreetmap'`);
    expect(Number(rows[0]?.total)).toBeGreaterThan(0);
    expect(rows[0]?.total).toBe(rows[0]?.unique_ids);
  });

  it('charge le détail d’un lieu existant avec ses horaires', async () => {
    const page = await listPlacesFromDb(databaseUrl, query('?limit=1'), now);
    const first = page.items[0];
    if (!first) throw new Error('Aucun lieu disponible');
    const detail = PlaceApiSchema.parse(await getPlaceByIdFromDb(databaseUrl, first.id, 'fr', now));
    expect(detail.id).toBe(first.id);
    expect(detail.openingHours).toEqual(first.openingHours);
  });
});
