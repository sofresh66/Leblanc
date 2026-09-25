import { describe, expect, it, vi } from 'vitest';
import { createDatatourismeClient, DatatourismePageError } from '../lib/datatourisme-client.mjs';

const success = () => ({
  ok: true,
  json: async () => ({ objects: [{ uuid: 'x' }], meta: { total_pages: 1 } }),
});

describe('client DATAtourisme', () => {
  it('demande les champs complets et six langues sans clé dans l’URL', async () => {
    const fetchImpl = vi.fn(async () => success());
    await createDatatourismeClient({ apiKey: 'secret', fetchImpl }).fetchPage({ pageSize: 3 });
    const [url, options] = fetchImpl.mock.calls[0];
    expect(url.searchParams.get('page_size')).toBe('3');
    expect(url.searchParams.get('lang')).toBe('fr,en,es,de,it,nl');
    expect(url.searchParams.get('fields')).toContain('takesPlaceAt');
    expect(url.searchParams.get('fields')).toContain('offers');
    expect(url.toString()).not.toContain('secret');
    expect(options.headers['X-API-Key']).toBe('secret');
    const nextUrl = `${url.toString()}&crs=opaque-cursor`;
    await createDatatourismeClient({ apiKey: 'secret', fetchImpl }).fetchPage({
      page: 2,
      pageSize: 3,
      nextUrl,
    });
    expect(fetchImpl.mock.calls[1][0].searchParams.get('crs')).toBe('opaque-cursor');
  });

  it('réessaie 429 avant de réussir', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 429 })
      .mockResolvedValueOnce(success());
    const sleep = vi.fn(async () => {});
    const result = await createDatatourismeClient({ apiKey: 'secret', fetchImpl, sleep }).fetchPage(
      {},
    );
    expect(result.objects).toHaveLength(1);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(1_000);
  });

  it('arrête après trois échecs 5xx', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 503 }));
    const client = createDatatourismeClient({ apiKey: 'secret', fetchImpl, sleep: async () => {} });
    await expect(client.fetchPage({})).rejects.toBeInstanceOf(DatatourismePageError);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it('ne réessaie pas les erreurs permanentes', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 401 }));
    const client = createDatatourismeClient({ apiKey: 'secret', fetchImpl });
    await expect(client.fetchPage({})).rejects.toThrow('HTTP 401');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('refuse une page hors limites', async () => {
    const client = createDatatourismeClient({ apiKey: 'secret', fetchImpl: vi.fn() });
    await expect(client.fetchPage({ pageSize: 101 })).rejects.toThrow('Pagination');
  });
});
