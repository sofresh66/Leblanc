import { randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { EventDetailSchema, LE_BLANC_CENTER, type Event } from '@leblanc/shared';
import { executeQuery } from '../db/client.js';
import { getEventByIdFromDb, listEventsFromDb } from '../db/events.js';
import { listCitiesFromDb } from '../db/referenceData.js';
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
  let outsideId: string;
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
    if (!outside[0]) throw new Error('Fixture Neon manquante : aucun événement publié hors des 20 km');
    outsideId = outside[0].id;
    missingId = randomUUID();
    const collision = await executeQuery(databaseUrl, 'SELECT id FROM events WHERE id = $1::uuid', [missingId]);
    if (collision.length) throw new Error('Collision inattendue de la fixture UUID absente');
  });

  it('liste des événements sans filtre', async () => {
    const page = await listEventsFromDb(databaseUrl, { lang: 'fr', limit: 20 }, nowIso);
    expect(page.items.length).toBeGreaterThan(0);
    expect(page).not.toHaveProperty('total');
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
    expect(await getEventByIdFromDb(databaseUrl, outsideId, 'fr', nowIso)).toBeNull();
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
