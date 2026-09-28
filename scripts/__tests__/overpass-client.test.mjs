import { describe, expect, it, vi } from 'vitest';
import { createOverpassClient, OVERPASS_QUERY, OverpassError } from '../lib/overpass-client.mjs';

describe('client Overpass', () => {
  const servers = ['https://one.example/api/interpreter', 'https://two.example/api/interpreter'];

  it('envoie une requête bornée et exclut public_bookcase par un motif ancré', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(Response.json({ elements: [{ type: 'node', id: 1 }] }));
    const result = await createOverpassClient({ fetchImpl, servers }).fetchPlaces();
    expect(result).toEqual({ elements: [{ type: 'node', id: 1 }], serverIndex: 1 });
    const [url, options] = fetchImpl.mock.calls[0];
    expect(url).toBe(servers[0]);
    expect(options.method).toBe('POST');
    expect(options.headers['User-Agent']).toContain('LeblancEtMoi/1.0');
    expect(String(options.body)).toContain('data=');
    expect(new URLSearchParams(options.body).get('data')).toBe(OVERPASS_QUERY);
    expect(OVERPASS_QUERY).toContain('^(restaurant|bar|cafe|fast_food|pub)$');
  });

  it('réessaie un 429 avec attente puis passe au serveur suivant', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response('', { status: 429, headers: { 'Retry-After': '1' } }))
      .mockResolvedValueOnce(new Response('', { status: 504 }))
      .mockResolvedValueOnce(Response.json({ elements: [{ type: 'node', id: 2 }] }));
    const sleep = vi.fn().mockResolvedValue(undefined);
    const result = await createOverpassClient({ fetchImpl, sleep, servers }).fetchPlaces();
    expect(result.serverIndex).toBe(2);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledWith(1000);
  });

  it('ne retourne jamais un résultat partiel avec remark', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(Response.json({ elements: [{ id: 1 }], remark: 'runtime error' }))
      .mockResolvedValueOnce(Response.json({ elements: [{ type: 'node', id: 2 }] }));
    expect((await createOverpassClient({ fetchImpl, servers }).fetchPlaces()).serverIndex).toBe(2);
  });

  it('écarte une réponse vide et essaie le miroir suivant', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(Response.json({ elements: [] }))
      .mockResolvedValueOnce(Response.json({ elements: [{ type: 'node', id: 3 }] }));
    const result = await createOverpassClient({ fetchImpl, servers }).fetchPlaces();
    expect(result.serverIndex).toBe(2);
    expect(result.elements).toHaveLength(1);
  });

  it('rejette tous les serveurs indisponibles sans exposer leurs URLs', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('offline'));
    const request = createOverpassClient({ fetchImpl, servers }).fetchPlaces();
    await expect(request).rejects.toBeInstanceOf(OverpassError);
    await expect(request).rejects.not.toThrow('one.example');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});
