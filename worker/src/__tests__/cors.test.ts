import { describe, expect, it } from 'vitest';
import { getAllowedOrigins, getCorsHeaders, handleCorsPreflight } from '../http/cors.js';

describe('Gestion CORS (worker/src/http/cors.ts)', () => {
  it('utilise les origines par défaut quand la variable d’environnement est absente', () => {
    const origins = getAllowedOrigins(undefined);
    expect(origins).toEqual([
      'http://localhost:5173',
      'https://leblanc-et-moi.pages.dev',
      'https://leblanc-et-moi.fr',
      'https://www.leblanc-et-moi.fr',
    ]);
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

  describe('domaine leblanc-et-moi.fr', () => {
    const allowed = (origin: string) =>
      getCorsHeaders(new Request('https://api.example.com/api/v1/events', { headers: { Origin: origin } }))['Access-Control-Allow-Origin'];

    it.each([
      'https://leblanc-et-moi.fr',
      'https://www.leblanc-et-moi.fr',
      'https://leblanc-et-moi.pages.dev', // conservé pendant la transition
    ])('autorise %s', (origin) => {
      expect(allowed(origin)).toBe(origin);
    });

    it.each([
      'http://leblanc-et-moi.fr', // pas de HTTP
      'http://www.leblanc-et-moi.fr',
      'https://leblanc-et-moi.fr:8443', // pas de port
      'https://leblanc-et-moi.fr/', // origine exacte, sans chemin
      'https://evil.leblanc-et-moi.fr', // aucun autre sous-domaine
      'https://a.www.leblanc-et-moi.fr',
      'https://evil-leblanc-et-moi.fr',
      'https://leblanc-et-moi.fr.evil.com', // suffixe ajouté
      'https://leblanc-et-moi.france',
      'https://Leblanc-et-moi.fr', // les navigateurs envoient des minuscules
    ])('refuse %s', (origin) => {
      expect(allowed(origin)).toBeUndefined();
    });

    it('autorise le domaine avec la liste de production (wrangler.jsonc)', () => {
      const env = {
        DATABASE_URL: '',
        ALLOWED_ORIGINS: 'http://localhost:5173,https://leblanc-et-moi.pages.dev,https://leblanc-et-moi.fr,https://www.leblanc-et-moi.fr',
      };
      for (const origin of ['https://leblanc-et-moi.fr', 'https://www.leblanc-et-moi.fr']) {
        const req = new Request('https://api.example.com/api/v1/routes', { method: 'OPTIONS', headers: { Origin: origin } });
        const res = handleCorsPreflight(req, env);
        expect(res.status).toBe(204);
        expect(res.headers.get('Access-Control-Allow-Origin')).toBe(origin);
      }
    });
  });

  describe('previews Cloudflare Pages du projet', () => {
    const allowed = (origin: string) =>
      getCorsHeaders(new Request('https://api.example.com/api/v1/routes', { headers: { Origin: origin } }))['Access-Control-Allow-Origin'];

    it.each([
      'https://routes-preview.leblanc-et-moi.pages.dev',
      'https://audit-preview.leblanc-et-moi.pages.dev',
      'https://d7830937.leblanc-et-moi.pages.dev',
      'https://a.leblanc-et-moi.pages.dev',
    ])('autorise %s', (origin) => {
      expect(allowed(origin)).toBe(origin);
    });

    it.each([
      'http://routes-preview.leblanc-et-moi.pages.dev', // pas de HTTP
      'https://routes-preview.leblanc-et-moi.pages.dev:8443', // pas de port
      'https://a.b.leblanc-et-moi.pages.dev', // un seul niveau de sous-domaine
      'https://evil-leblanc-et-moi.pages.dev', // autre projet Pages
      'https://routes-preview.leblanc-et-moi.pages.dev.evil.com', // suffixe ajouté
      'https://routes-previewXleblanc-et-moi.pages.dev', // le point est littéral
      'https://-preview.leblanc-et-moi.pages.dev', // tiret initial
      'https://preview-.leblanc-et-moi.pages.dev', // tiret final
      'https://Routes-Preview.leblanc-et-moi.pages.dev', // les navigateurs envoient des minuscules
      `https://${'a'.repeat(64)}.leblanc-et-moi.pages.dev`, // libellé DNS de plus de 63 caractères
      'https://.leblanc-et-moi.pages.dev',
      'https://leblanc-et-moi.pages.dev.evil.com',
      'null',
    ])('refuse %s', (origin) => {
      expect(allowed(origin)).toBeUndefined();
    });

    it('reste actif quand ALLOWED_ORIGINS est configuré, sans élargir la liste explicite', () => {
      const env = { DATABASE_URL: '', ALLOWED_ORIGINS: 'https://leblanc-et-moi.pages.dev' };
      const request = (origin: string) => new Request('https://api.example.com/api/v1/routes', { headers: { Origin: origin } });
      expect(getCorsHeaders(request('https://routes-preview.leblanc-et-moi.pages.dev'), env)['Access-Control-Allow-Origin'])
        .toBe('https://routes-preview.leblanc-et-moi.pages.dev');
      expect(getCorsHeaders(request('http://localhost:5173'), env)['Access-Control-Allow-Origin']).toBeUndefined();
    });
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
