import { describe, expect, it, vi } from 'vitest';
import { BAN_SEARCH_URL, buildBanUrl, geocodeWithBan, parseBanResponse } from '../lib/ban-geocoder.mjs';

const center = { latitude: 46.6333, longitude: 1.0833 };
const item = { nom: 'Auberge de la Gabrière', adresse: '2 La Gabrière', codePostal: '36220', commune: 'Lingé' };
const feature = (properties, coordinates = [1.162095, 46.761302]) => ({
  type: 'FeatureCollection',
  features: [{ type: 'Feature', geometry: { type: 'Point', coordinates },
    properties: { label: '2 La Gabriere 36220 Lingé', score: 0.94, city: 'Lingé', type: 'housenumber', ...properties } }],
});

describe('Géocodage BAN (Géoplateforme)', () => {
  it('interroge le point d’accès Géoplateforme avec adresse, commune et code postal', () => {
    const url = buildBanUrl(item);
    expect(url.origin + url.pathname).toBe(BAN_SEARCH_URL);
    expect(url.searchParams.get('q')).toBe('2 La Gabrière Lingé');
    expect(url.searchParams.get('postcode')).toBe('36220');
    expect(url.searchParams.get('limit')).toBe('1');
    expect(buildBanUrl({ nom: 'Le Commerce', adresse: '', commune: 'Angles-sur-l’Anglin' }).searchParams.get('q'))
      .toBe('Le Commerce Angles-sur-l’Anglin');
  });

  it('accepte une adresse précise de la bonne commune (coordonnées lon/lat inversées)', () => {
    expect(parseBanResponse(feature({}), item, center)).toMatchObject({
      reason: 'ok', point: { latitude: 46.761302, longitude: 1.162095 }, score: 0.94,
    });
    expect(parseBanResponse(feature({ city: 'LINGE', type: 'locality' }), item, center).reason).toBe('ok');
  });

  it.each([
    [{ score: 0.42 }, 'low_score'],
    [{ type: 'municipality' }, 'imprecise'],
    [{ city: 'Mézières-en-Brenne' }, 'other_city'],
  ])('rejette %j (%s)', (properties, reason) => {
    expect(parseBanResponse(feature(properties), item, center)).toMatchObject({ point: null, reason });
  });

  it('rejette un résultat absent, invalide ou à plus de 20 km', () => {
    expect(parseBanResponse({ features: [] }, item, center).reason).toBe('no_result');
    expect(parseBanResponse(feature({}, ['x', 'y']), item, center).reason).toBe('invalid_geometry');
    expect(parseBanResponse(feature({}, [2.35, 48.85]), item, center).reason).toBe('too_far');
  });

  it('remonte une erreur HTTP sans résultat inventé', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 503 });
    await expect(geocodeWithBan(item, center, { fetchImpl })).rejects.toThrow('HTTP_503');
    const ok = vi.fn().mockResolvedValue({ ok: true, json: async () => feature({}) });
    await expect(geocodeWithBan(item, center, { fetchImpl: ok })).resolves.toMatchObject({ reason: 'ok' });
    expect(String(ok.mock.calls[0][0])).toContain('data.geopf.fr/geocodage/search');
  });
});
