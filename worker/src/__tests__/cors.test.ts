import { describe, expect, it } from 'vitest';
import { getAllowedOrigins, getCorsHeaders, handleCorsPreflight } from '../http/cors.js';

describe('Gestion CORS (worker/src/http/cors.ts)', () => {
  it('utilise les origines par défaut quand la variable d’environnement est absente', () => {
    const origins = getAllowedOrigins(undefined);
    expect(origins).toEqual(['http://localhost:5173', 'https://leblanc-et-moi.pages.dev']);
  });

  it('lit les origines configurées via env.ALLOWED_ORIGINS', () => {
    const env = { DATABASE_URL: '', ALLOWED_ORIGINS: 'https://mon-site.com, https://autre-site.org' };
    const origins = getAllowedOrigins(env);
    expect(origins).toEqual(['https://mon-site.com', 'https://autre-site.org']);
  });

  it('renvoie les en-têtes CORS appropriés pour une origine autorisée', () => {
    const req = new Request('https://api.example.com/api/v1/events', {
      headers: { Origin: 'http://localhost:5173' },
    });
    const headers = getCorsHeaders(req);

    expect(headers['Access-Control-Allow-Origin']).toBe('http://localhost:5173');
    expect(headers['Vary']).toBe('Origin');
  });

  it('conserve Vary sans autoriser une origine refusée ou absente', () => {
    const reqUnauthorized = new Request('https://api.example.com/api/v1/events', {
      headers: { Origin: 'https://malicious-site.com' },
    });
    expect(getCorsHeaders(reqUnauthorized)).toEqual({ Vary: 'Origin' });

    const reqNoOrigin = new Request('https://api.example.com/api/v1/events');
    expect(getCorsHeaders(reqNoOrigin)).toEqual({ Vary: 'Origin' });
  });

  it('gère une requête prévol OPTIONS en renvoyant HTTP 204 avec les en-têtes requis', () => {
    const req = new Request('https://api.example.com/api/v1/events', {
      method: 'OPTIONS',
      headers: { Origin: 'https://leblanc-et-moi.pages.dev' },
    });
    const res = handleCorsPreflight(req);

    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://leblanc-et-moi.pages.dev');
    expect(res.headers.get('Access-Control-Allow-Methods')).toContain('GET');
    expect(res.headers.get('Access-Control-Allow-Methods')).toContain('OPTIONS');
    expect(res.headers.get('Access-Control-Allow-Headers')).toContain('Content-Type');
    expect(res.headers.get('Access-Control-Max-Age')).toBe('86400');
  });
});
