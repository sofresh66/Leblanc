import { afterEach, describe, expect, it, vi } from 'vitest';
import { handleRequest } from '../index.js';
import { DatabaseServiceError } from '../db/client.js';

const { listEventsFromDb } = vi.hoisted(() => ({ listEventsFromDb: vi.fn() }));
vi.mock('../db/events.js', () => ({ listEventsFromDb, getEventByIdFromDb: vi.fn() }));
afterEach(() => { vi.restoreAllMocks(); listEventsFromDb.mockReset(); });

describe('Dispatcher et erreurs de service', () => {
  it.each([
    [new DatabaseServiceError(), 503, 'SERVICE_UNAVAILABLE'],
    [new Error('Détail SQL privé'), 500, 'INTERNAL_ERROR'],
  ])('convertit une erreur en réponse publique structurée', async (error, status, code) => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    listEventsFromDb.mockRejectedValue(error);
    const response = await handleRequest(new Request('https://example.test/api/v1/events?city=secret'));
    expect(response.status).toBe(status);
    expect(response.headers.get('Cache-Control')).toContain('no-store');
    expect(await response.json()).toMatchObject({ error: { code, requestId: expect.any(String) } });
    expect(JSON.stringify(log.mock.calls)).not.toContain('secret');
    expect(JSON.stringify(log.mock.calls)).not.toContain('https://');
  });

  it('répond 404 à OPTIONS sur une route inconnue', async () => {
    expect((await handleRequest(new Request('https://example.test/absent', { method: 'OPTIONS' }))).status).toBe(404);
  });

  it('rejette un curseur avec UUID invalide avant la base', async () => {
    const cursor = btoa(JSON.stringify({ d: '2026-10-03T00:00:00Z', i: 'invalide' }));
    const response = await handleRequest(new Request(`https://example.test/api/v1/events?cursor=${encodeURIComponent(cursor)}`));
    expect(response.status).toBe(400);
    expect(listEventsFromDb).not.toHaveBeenCalled();
  });
});
