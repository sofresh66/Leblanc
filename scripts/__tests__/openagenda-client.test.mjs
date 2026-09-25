import { describe, expect, it, vi } from 'vitest';
import { createOpenAgendaClient, OpenAgendaError } from '../lib/openagenda-client.mjs';

const page = { total: 1, events: [{ uid: 123 }], after: null };
const ok = () => ({ ok: true, json: async () => page });

describe('client OpenAgenda', () => {
  it('utilise v2, le header key, la boîte géographique et after[]', async () => {
    const fetchImpl = vi.fn(async () => ok());
    const client = createOpenAgendaClient({ apiKey: 'secret', fetchImpl, sleep: async () => {} });
    await client.fetchEventPage({ agendaUid: 54621, size: 2, after: ['0', '123'] });
    const [url, options] = fetchImpl.mock.calls[0];
    expect(url.pathname).toBe('/v2/agendas/54621/events');
    expect(url.searchParams.getAll('after[]')).toEqual(['0', '123']);
    expect(url.searchParams.get('detailed')).toBe('1');
    expect(url.searchParams.get('geo[northEast][lat]')).toBe('46.82');
    expect(url.href).not.toContain('secret');
    expect(options.headers.key).toBe('secret');
  });

  it('réessaie 429 avec Retry-After', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 429, headers: { get: () => '2' } })
      .mockResolvedValueOnce(ok());
    const sleep = vi.fn(async () => {});
    const client = createOpenAgendaClient({ apiKey: 'secret', fetchImpl, sleep });
    expect((await client.fetchEventPage({ agendaUid: 54621 })).events).toHaveLength(1);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(2_000);
  });

  it('ne réessaie pas 403 et masque la clé dans l’erreur', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 403 }));
    const client = createOpenAgendaClient({ apiKey: 'secret', fetchImpl });
    await expect(client.fetchEventPage({ agendaUid: 54621 })).rejects.toThrow('HTTP_403');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(OpenAgendaError.name).toBe('OpenAgendaError');
  });

  it('bloque avant la 101e requête', async () => {
    const fetchImpl = vi.fn(async () => ok());
    const client = createOpenAgendaClient({
      apiKey: 'secret',
      fetchImpl,
      sleep: async () => {},
      maxRequests: 1,
    });
    await client.fetchEventPage({ agendaUid: 54621 });
    await expect(client.fetchEventPage({ agendaUid: 54621 })).rejects.toThrow('REQUEST_LIMIT');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
