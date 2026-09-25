import { afterEach, describe, expect, it, vi } from 'vitest';
import { DatabaseServiceError, executeQuery } from '../db/client.js';

const { query } = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock('@neondatabase/serverless', () => ({ neon: () => ({ query }) }));
afterEach(() => { vi.useRealTimers(); query.mockReset(); });

describe('Client Neon PostgreSQL (worker/src/db/client.ts)', () => {
  it('lève DatabaseServiceError si DATABASE_URL est vide ou absente', async () => {
    await expect(executeQuery('', 'SELECT 1')).rejects.toThrowError(
      DatabaseServiceError
    );
    await expect(executeQuery('', 'SELECT 1')).rejects.toThrowError(
      /DATABASE_URL non configurée/
    );
  });

  it('lève DatabaseServiceError en cas de timeout dépassé (NB3)', async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    query.mockImplementation((_sql: string, _params: unknown[], options: { fetchOptions: { signal: AbortSignal } }) => {
      signal = options.fetchOptions.signal;
      return new Promise((_resolve, reject) => {
        signal?.addEventListener('abort', () => reject(new DOMException('Annulé', 'AbortError')));
      });
    });
    const result = executeQuery('postgresql://local/test', 'SELECT 1');
    const rejected = expect(result).rejects.toThrowError(DatabaseServiceError);
    await vi.advanceTimersByTimeAsync(4999);
    expect(signal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await rejected;
    expect(signal?.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('ne divulgue jamais les identifiants ou l’URL dans l’erreur levée (NB2)', async () => {
    const sensitiveUrl = 'postgresql://secret_user:super_secret_password@ep-sample.neon.tech/secret_db';
    query.mockRejectedValue(new Error(`fetch failed ${sensitiveUrl}`));
    try {
      await executeQuery(sensitiveUrl, 'SELECT 1', [], 1);
      expect.unreachable('Devrait avoir levé une erreur');
    } catch (err: unknown) {
      expect(err).toBeInstanceOf(DatabaseServiceError);
      const message = (err as Error).message;
      expect(message).not.toContain('secret_user');
      expect(message).not.toContain('super_secret_password');
      expect(message).not.toContain('secret_db');
    }
  });

  it('renvoie les lignes et libère le timer après succès', async () => {
    vi.useFakeTimers();
    query.mockResolvedValue([{ ok: 1 }]);
    expect(await executeQuery('postgresql://local/test', 'SELECT 1')).toEqual([{ ok: 1 }]);
    expect(vi.getTimerCount()).toBe(0);
  });
});
