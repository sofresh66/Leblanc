import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getEventByIdFromDb, listEventsFromDb } from '../db/events.js';
import { parseEventListQuery } from '../validation/query.js';
import { decodeCursor } from '../validation/cursor.js';
import type { EventDbRow, OccurrenceDbRow } from '../mappers/event.js';

const { executeQuery } = vi.hoisted(() => ({ executeQuery: vi.fn() }));
vi.mock('../db/client.js', () => ({ executeQuery }));

const id = 'a1000000-0000-4000-8000-000000000001';
const now = '2026-09-25T00:00:00.000Z';
const row: EventDbRow = {
  id, category: 'culture', title_i18n: { fr: 'Séance' }, description_i18n: { fr: '' },
  source: 'openagenda', venue_name: null, address: null, postal_code: null, city: 'Le Blanc',
  latitude: 46.6339, longitude: 1.0622, public_url: null, image_url: null, is_free: true,
  price_min: null, starts_at: '2026-10-03T08:30:00.123456Z', ends_at: null,
  timezone: 'Europe/Paris', distance: 0, cursor_date: '2026-10-03T08:30:00.123456Z',
};

beforeEach(() => executeQuery.mockReset());

describe('Contrats des requêtes SQL Worker', () => {
  it.each([true, false])('filtre par égalité SQL stricte avec isFree=%s', async (isFree) => {
    executeQuery.mockResolvedValue([]);
    await listEventsFromDb('test', parseEventListQuery(new URL(`https://example.test/?isFree=${isFree}`)), now);
    expect(executeQuery.mock.calls[0]?.[1]).toMatch(/AND e\.is_free = \$\d+/);
    expect(executeQuery.mock.calls[0]?.[2]).toContain(isFree);
    expect(executeQuery.mock.calls[0]?.[1]).not.toMatch(/COALESCE\(e\.is_free/);
  });
  it('applique une borne exclusive aux dates seules et inclusive aux instants', async () => {
    executeQuery.mockResolvedValue([]);
    await listEventsFromDb('test', parseEventListQuery(new URL('https://example.test/?to=2026-10-24')), now);
    expect(executeQuery.mock.calls[0]?.[1]).toContain('o1.starts_at < $6::timestamptz');
    expect(executeQuery.mock.calls[0]?.[2]).toContain('2026-10-24T22:00:00.000Z');
    await listEventsFromDb('test', parseEventListQuery(new URL('https://example.test/?to=2026-10-24T22:00:00Z')), now);
    expect(executeQuery.mock.calls[1]?.[1]).toContain('o1.starts_at <= $6::timestamptz');
  });

  it('construit le curseur depuis la précision SQL, même après mapping en millisecondes', async () => {
    executeQuery.mockResolvedValue([row, { ...row, id: crypto.randomUUID() }]);
    const page = await listEventsFromDb('test', { lang: 'fr', limit: 1 }, now);
    expect(page.nextCursor).not.toBeNull();
    expect(decodeCursor(page.nextCursor ?? '').d).toBe(row.cursor_date);
    expect(page.items[0]?.startDate).toBe('2026-10-03T08:30:00.123Z');
  });

  it('renvoie les séances passées et futures en représentant la prochaine', async () => {
    const occurrences: OccurrenceDbRow[] = [
      { id: crypto.randomUUID(), starts_at: '2025-01-01T00:00:00Z', ends_at: null },
      { id: crypto.randomUUID(), starts_at: '2026-10-03T08:30:00Z', ends_at: null },
      { id: crypto.randomUUID(), starts_at: '2028-01-01T00:00:00Z', ends_at: null },
    ];
    executeQuery.mockResolvedValueOnce([row]).mockResolvedValueOnce(occurrences);
    const event = await getEventByIdFromDb('test', id, 'fr', now);
    expect(event?.occurrences).toHaveLength(3);
    expect(event?.startDate).toBe('2026-10-03T08:30:00.000Z');
    const sql = executeQuery.mock.calls[1]?.[1] as string;
    expect(sql).toContain("o.status = 'scheduled'");
    expect(sql).not.toContain('interval');
    expect(sql).not.toContain('LIMIT');
  });

  it('retourne null sans charger les séances si l’événement est absent ou hors rayon', async () => {
    executeQuery.mockResolvedValue([]);
    expect(await getEventByIdFromDb('test', id, 'fr', now)).toBeNull();
    expect(executeQuery).toHaveBeenCalledTimes(1);
    expect(executeQuery.mock.calls[0]?.[1]).toContain('ST_DWithin');
  });
});
