import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handleRequest } from '../index.js';
import { listEventsFromDb } from '../db/events.js';
import type { EventDbRow } from '../mappers/event.js';
import { decodeCursor, encodeCursor } from '../validation/cursor.js';
import {
  CursorExpiredError, escapeLikePattern, parseEventListQuery, parseSearchQuery,
} from '../validation/query.js';

const { executeQuery } = vi.hoisted(() => ({ executeQuery: vi.fn() }));
vi.mock('../db/client.js', async (original) => ({
  ...await original<typeof import('../db/client.js')>(),
  executeQuery,
}));

const now = '2026-10-10T08:00:00.000Z';
const ids = Array.from({ length: 6 }, (_, index) => `a1000000-0000-4000-8000-00000000000${index + 1}`);
const query = (search: string, at = now) => parseEventListQuery(new URL(`https://example.test/api/v1/events${search}`), at);

// Bloc explicite : une fonction renvoyée par beforeEach serait appelée comme nettoyage.
beforeEach(() => {
  executeQuery.mockReset();
});

describe('Filtres et recherche des événements', () => {
  it('accepte isFree=unknown et filtre les tarifs non précisés', async () => {
    expect(query('?isFree=unknown').isFree).toBeNull();
    expect(() => query('?isFree=maybe')).toThrow(/unknown/);
    executeQuery.mockResolvedValue([]);
    await listEventsFromDb('db', query('?isFree=unknown'), now);
    expect(executeQuery.mock.calls[0]?.[1]).toContain('AND e.is_free IS NULL');
  });

  it('valide q : vide ignoré, 2 à 80 caractères, espaces normalisés', () => {
    expect(parseSearchQuery(null)).toBeUndefined();
    expect(parseSearchQuery('   ')).toBeUndefined();
    expect(parseSearchQuery('  soirée   choucroute ')).toBe('soirée choucroute');
    expect(() => parseSearchQuery('a')).toThrow(/2 et 80/);
    expect(() => parseSearchQuery('x'.repeat(81))).toThrow(/2 et 80/);
  });

  it('échappe les jokers et passe la recherche en paramètre, jamais dans le SQL', async () => {
    expect(escapeLikePattern('50%_off\\')).toBe('50\\%\\_off\\\\');
    executeQuery.mockResolvedValue([]);
    const injection = "%_'; drop table events; --";
    await listEventsFromDb('db', query(`?q=${encodeURIComponent(injection)}`), now);
    const [, sql, params] = executeQuery.mock.calls[0] as [string, string, unknown[]];
    expect(sql).not.toContain('drop table');
    expect(sql).toContain("unaccent(lower(t.value)) LIKE unaccent(lower($");
    expect(sql).toContain("ESCAPE '\\'");
    expect(params).toContain(`%${escapeLikePattern(injection)}%`);
  });

  it('filtre les occurrences par chevauchement et trie sur la date effective', async () => {
    executeQuery.mockResolvedValue([]);
    await listEventsFromDb('db', query('?from=2026-10-10&to=2026-10-12'), now);
    const sql = executeQuery.mock.calls[0]?.[1] as string;
    expect(sql).toContain('COALESCE(o1.ends_at, o1.starts_at) >= GREATEST($4::timestamptz, $3::timestamptz)');
    expect(sql).toContain('GREATEST(o1.starts_at, GREATEST($4::timestamptz, $3::timestamptz)) AS sort_at');
    expect(sql).toContain('ORDER BY o.sort_at ASC, e.id ASC');
  });
});

describe('Curseur stable (asOf)', () => {
  const cursor = (asOf: string) => encodeCursor('2026-10-11T08:00:00.000Z', ids[0] ?? '', asOf);

  it('reprend la date de référence du curseur au lieu de now()', async () => {
    executeQuery.mockResolvedValue([]);
    const later = '2026-10-10T10:00:00.000Z';
    await listEventsFromDb('db', query(`?cursor=${cursor(now)}`, later), later);
    expect((executeQuery.mock.calls[0]?.[2] as unknown[])[2]).toBe(now);
  });

  it('refuse un curseur de plus de 24 h ou daté du futur', () => {
    expect(() => query(`?cursor=${cursor('2026-10-09T07:59:00.000Z')}`)).toThrow(CursorExpiredError);
    expect(() => query(`?cursor=${cursor('2026-10-10T09:00:00.000Z')}`)).toThrow(CursorExpiredError);
    expect(query(`?cursor=${cursor('2026-10-09T09:00:00.000Z')}`).decodedCursor?.a).toBe('2026-10-09T09:00:00.000Z');
  });

  it('accepte un ancien curseur sans date de référence (ancien front) avec now() comme référence', async () => {
    const legacy = Buffer.from(JSON.stringify({ d: '2026-10-11T08:00:00.000Z', i: ids[0] })).toString('base64url');
    const parsed = query(`?cursor=${legacy}`);
    expect(parsed.decodedCursor?.a).toBeUndefined();
    executeQuery.mockResolvedValue([]);
    await listEventsFromDb('db', parsed, now);
    const params = executeQuery.mock.calls[0]?.[2] as unknown[];
    expect(params[2]).toBe(now);
    expect(params).toContain('2026-10-11T08:00:00.000Z');
    const response = await handleRequest(new Request(`https://api.example.test/api/v1/events?cursor=${legacy}`), { DATABASE_URL: 'db', ALLOWED_ORIGINS: '' });
    expect(response.status).toBe(200);
  });

  it('émet toujours la date de référence dans les nouveaux curseurs', async () => {
    executeQuery.mockResolvedValue([
      { ...{ id: ids[0], category: 'culture', title_i18n: { fr: 'A' }, description_i18n: { fr: '' }, source: 'datatourisme', venue_name: null,
        address: null, postal_code: null, city: null, latitude: 46.63, longitude: 1.08, public_url: null, image_url: null,
        is_free: null, price_min: null, starts_at: '2026-10-11T08:00:00.000Z', ends_at: null, timezone: 'Europe/Paris',
        distance: 0, cursor_date: '2026-10-11T08:00:00.000000Z' } },
      { id: ids[1], category: 'culture', title_i18n: { fr: 'B' }, description_i18n: { fr: '' }, source: 'datatourisme', venue_name: null,
        address: null, postal_code: null, city: null, latitude: 46.63, longitude: 1.08, public_url: null, image_url: null,
        is_free: null, price_min: null, starts_at: '2026-10-12T08:00:00.000Z', ends_at: null, timezone: 'Europe/Paris',
        distance: 0, cursor_date: '2026-10-12T08:00:00.000000Z' },
    ]);
    const page = await listEventsFromDb('db', query('?limit=1'), now);
    expect(decodeCursor(page.nextCursor ?? '').a).toBe(now);
  });

  it('répond 400 CURSOR_EXPIRED pour un curseur expiré', async () => {
    const response = await handleRequest(
      new Request(`https://api.example.test/api/v1/events?cursor=${cursor('2026-01-01T00:00:00.000Z')}`),
      { DATABASE_URL: 'db', ALLOWED_ORIGINS: '' },
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: 'CURSOR_EXPIRED' } });
    expect(executeQuery).not.toHaveBeenCalled();
  });

  it('pagine sans doublon ni trou malgré un décalage d’horloge entre deux pages', async () => {
    // Base simulée : une exposition en cours (début passé) et des événements futurs.
    const base = (startsAt: string, endsAt: string | null, id: string) => ({ id, startsAt, endsAt });
    const occurrences = [
      base('2026-10-01T12:00:00.000Z', '2026-11-10T16:00:00.000Z', ids[0] ?? ''),
      base('2026-10-10T09:00:00.000Z', null, ids[1] ?? ''),
      base('2026-10-10T09:30:00.000Z', null, ids[2] ?? ''),
      base('2026-10-11T18:00:00.000Z', null, ids[3] ?? ''),
      base('2026-10-12T18:00:00.000Z', null, ids[4] ?? ''),
      base('2026-10-13T18:00:00.000Z', null, ids[5] ?? ''),
    ];
    // Réplique en mémoire de la sémantique SQL : chevauchement, clé de tri, curseur.
    executeQuery.mockImplementation((...args: unknown[]) => {
      const sql = String(args[1]);
      const params = args[2] as unknown[];
      const asOf = Date.parse(String(params[2]));
      const lower = Math.max(Date.parse(String(params[3])), asOf);
      const limit = Number(params[params.length - 1]);
      const hasCursor = sql.includes('o.sort_at > $');
      const cursorDate = hasCursor ? Date.parse(String(params[params.length - 3])) : null;
      const cursorId = hasCursor ? String(params[params.length - 2]) : null;
      return occurrences
        .filter((occ) => Date.parse(occ.endsAt ?? occ.startsAt) >= lower)
        .map((occ) => ({ occ, sortAt: Math.max(Date.parse(occ.startsAt), lower) }))
        .filter(({ occ, sortAt }) => cursorDate === null || sortAt > cursorDate || (sortAt === cursorDate && occ.id > (cursorId ?? '')))
        .sort((a, b) => a.sortAt - b.sortAt || a.occ.id.localeCompare(b.occ.id))
        .slice(0, limit)
        .map(({ occ, sortAt }): EventDbRow => ({
          id: occ.id, category: 'culture', title_i18n: { fr: occ.id }, description_i18n: { fr: '' }, source: 'datatourisme',
          venue_name: null, address: null, postal_code: null, city: 'Le Blanc', latitude: 46.63, longitude: 1.08,
          public_url: null, image_url: null, is_free: null, price_min: null, starts_at: occ.startsAt, ends_at: occ.endsAt,
          timezone: 'Europe/Paris', distance: 0, cursor_date: new Date(sortAt).toISOString(),
        }));
    });

    const reference = await listEventsFromDb('db', query('?limit=50'), now);
    expect(reference.items.map((item) => item.id)).toEqual(ids);
    // L'exposition en cours est classée à la date de référence, pas en tête du passé.
    expect(reference.items[0]?.id).toBe(ids[0]);

    const page1 = await listEventsFromDb('db', query('?limit=2'), now);
    const twoHoursLater = '2026-10-10T10:00:00.000Z'; // l'événement de 9 h 30 est désormais passé
    const page2 = await listEventsFromDb('db', query(`?limit=2&cursor=${page1.nextCursor}`, twoHoursLater), twoHoursLater);
    const fourHoursLater = '2026-10-10T12:00:00.000Z';
    const page3 = await listEventsFromDb('db', query(`?limit=2&cursor=${page2.nextCursor}`, fourHoursLater), fourHoursLater);
    const union = [...page1.items, ...page2.items, ...page3.items].map((item) => item.id);
    expect(union).toEqual(reference.items.map((item) => item.id));
    expect(new Set(union).size).toBe(union.length);
    expect(decodeCursor(page2.nextCursor ?? '').a).toBe(now);
    expect(page3.nextCursor).toBeNull();
  });
});

describe('GET /api/v1/events/geo', () => {
  const env = { DATABASE_URL: 'db', ALLOWED_ORIGINS: '' };
  const geoRow = (id: string) => ({
    id, category: 'culture', title_i18n: { fr: `Titre ${id.slice(-1)}`, de: 'Falsch' }, description_i18n: { fr: '' },
    translation_status: { de: { status: 'rejected' } }, city: 'Le Blanc', latitude: '46.63', longitude: 1.08,
    starts_at: '2026-10-12T08:00:00.000Z', ends_at: null, timezone: 'Europe/Paris', all_day: true,
  });

  it('renvoie tous les points visibles avec les filtres de la liste, sans pagination', async () => {
    executeQuery.mockResolvedValueOnce(ids.map(geoRow));
    const response = await handleRequest(new Request('https://api.example.test/api/v1/events/geo?category=culture&q=concert&isFree=unknown&lang=de'), env);
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toContain('s-maxage=3600');
    const body = await response.json() as { items: { id: string; lat: number; title: string; allDay: boolean }[]; truncated: boolean };
    expect(body.truncated).toBe(false);
    expect(body.items).toHaveLength(6);
    expect(body.items[0]).toMatchObject({ id: ids[0], lat: 46.63, title: 'Titre 1', allDay: true });
    const [, sql, params] = executeQuery.mock.calls[0] as [string, string, unknown[]];
    expect(sql).toContain('AND e.category = ANY(');
    expect(sql).toContain('AND e.is_free IS NULL');
    expect(sql).toContain('COALESCE(o1.ends_at, o1.starts_at) >=');
    expect(sql).not.toContain('o.sort_at >');
    expect(params[params.length - 1]).toBe(1001);
  });

  it('signale la troncature au-delà de 1 000 points et laisse la fiche détail intacte', async () => {
    executeQuery.mockResolvedValueOnce(Array.from({ length: 1001 }, () => geoRow(ids[0] ?? '')));
    const geo = await handleRequest(new Request('https://api.example.test/api/v1/events/geo'), env);
    const body = await geo.json() as { items: unknown[]; truncated: boolean };
    expect(body.items).toHaveLength(1000);
    expect(body.truncated).toBe(true);
    const detail = await handleRequest(new Request('https://api.example.test/api/v1/events/not-a-uuid'), env);
    expect(detail.status).toBe(400);
  });
});
