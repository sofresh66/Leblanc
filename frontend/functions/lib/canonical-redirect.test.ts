import { describe, expect, it, vi } from 'vitest';
import { canonicalRedirect, CANONICAL_ORIGIN } from './canonical-redirect';
import { onRequest } from '../_middleware';

const API_ORIGIN = 'https://leblanc-api.elharchdenis.workers.dev';

function redirect(url: string, method = 'GET') {
  return canonicalRedirect(new Request(url, { method }), API_ORIGIN);
}

describe('canonicalRedirect', () => {
  it('redirige www et l’hôte pages.dev de production en 301 vers le domaine canonique', () => {
    for (const host of ['www.leblanc-et-moi.fr', 'leblanc-et-moi.pages.dev']) {
      const response = redirect(`https://${host}/fr/se-balader?test=1`)!;
      expect(response.status).toBe(301);
      expect(response.headers.get('Location')).toBe('https://leblanc-et-moi.fr/fr/se-balader?test=1');
    }
  });

  it('conserve chemin et query tels que reçus, slash final compris', () => {
    const cases: Array<[string, string]> = [
      ['/', '/'],
      ['/robots.txt', '/robots.txt'],
      ['/sitemap.xml', '/sitemap.xml'],
      ['/fr/se-balader/', '/fr/se-balader/'],
      ['/fr/se-balader', '/fr/se-balader'],
      ['/fr/liste?category=culture&isFree=true', '/fr/liste?category=culture&isFree=true'],
      ['/fr/liste?q=march%C3%A9', '/fr/liste?q=march%C3%A9'],
    ];
    for (const [path, expected] of cases) {
      expect(redirect(`https://leblanc-et-moi.pages.dev${path}`)!.headers.get('Location')).toBe(`${CANONICAL_ORIGIN}${expected}`);
    }
    expect(redirect('https://leblanc-et-moi.pages.dev')!.headers.get('Location')).toBe(`${CANONICAL_ORIGIN}/`);
  });

  it('301 pour HEAD, 308 pour les autres méthodes', () => {
    expect(redirect('https://leblanc-et-moi.pages.dev/fr', 'HEAD')!.status).toBe(301);
    for (const method of ['POST', 'PUT', 'DELETE', 'OPTIONS']) {
      const response = redirect('https://www.leblanc-et-moi.fr/fr?x=1', method)!;
      expect(response.status).toBe(308);
      expect(response.headers.get('Location')).toBe('https://leblanc-et-moi.fr/fr?x=1');
    }
  });

  it('ignore la casse et le port de l’hôte', () => {
    expect(redirect('https://WWW.Leblanc-et-Moi.FR/fr')!.headers.get('Location')).toBe('https://leblanc-et-moi.fr/fr');
    expect(redirect('https://leblanc-et-moi.pages.dev:8443/fr?a=1')!.headers.get('Location')).toBe('https://leblanc-et-moi.fr/fr?a=1');
    expect(redirect('http://www.leblanc-et-moi.fr:80/')!.headers.get('Location')).toBe('https://leblanc-et-moi.fr/');
  });

  it('ne redirige ni le canonique, ni les aperçus, ni un hôte voisin, ni localhost', () => {
    for (const url of [
      'https://leblanc-et-moi.fr/fr',
      'https://LEBLANC-ET-MOI.FR/fr',
      'https://abc123.leblanc-et-moi.pages.dev/fr',
      'https://foo-preview.leblanc-et-moi.pages.dev/fr',
      'https://evil-leblanc-et-moi.pages.dev/fr',
      'https://leblanc-et-moi.pages.dev.evil.com/fr',
      'https://www.leblanc-et-moi.fr.evil.com/fr',
      'http://localhost:8788/fr',
      'http://127.0.0.1:8788/fr',
      'http://[::1]:8788/fr',
      'https://leblanc-api.elharchdenis.workers.dev/api/v1/events',
    ]) {
      expect(redirect(url), url).toBeNull();
    }
  });

  it('ne tire jamais la cible des en-têtes du client', () => {
    const request = new Request('https://leblanc-et-moi.pages.dev/fr', {
      headers: { Host: 'evil.example', 'X-Forwarded-Host': 'evil.example' },
    });
    expect(canonicalRedirect(request, API_ORIGIN)!.headers.get('Location')).toBe('https://leblanc-et-moi.fr/fr');
    const canonical = new Request('https://leblanc-et-moi.fr/fr', { headers: { 'X-Forwarded-Host': 'leblanc-et-moi.pages.dev' } });
    expect(canonicalRedirect(canonical, API_ORIGIN)).toBeNull();
  });

  it('porte les en-têtes de sécurité et un cache court, sans immutable', () => {
    const response = redirect('https://leblanc-et-moi.pages.dev/fr')!;
    expect(response.headers.get('Cache-Control')).toBe('public, max-age=3600');
    expect(response.headers.get('Strict-Transport-Security')).toBe('max-age=31536000; includeSubDomains');
    expect(response.headers.get('X-Frame-Options')).toBe('DENY');
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(response.headers.get('Content-Security-Policy')).toContain(`connect-src 'self' ${API_ORIGIN}`);
  });
});

describe('middleware', () => {
  function context(url: string, next = vi.fn(async () => new Response('User-agent: *', { headers: { 'Content-Type': 'text/plain' } }))) {
    return { request: new Request(url), env: {}, next, waitUntil: vi.fn() } as unknown as Parameters<typeof onRequest>[0];
  }

  it('redirige avant tout autre traitement, sans servir le fichier', async () => {
    const ctx = context('https://leblanc-et-moi.pages.dev/robots.txt');
    const response = await onRequest(ctx);
    expect(response.status).toBe(301);
    expect(response.headers.get('Location')).toBe('https://leblanc-et-moi.fr/robots.txt');
    expect(ctx.next).not.toHaveBeenCalled();
  });

  it('sert robots.txt inchangé sur le domaine canonique et sur un aperçu', async () => {
    for (const url of ['https://leblanc-et-moi.fr/robots.txt', 'https://abc123.leblanc-et-moi.pages.dev/robots.txt']) {
      const ctx = context(url);
      const response = await onRequest(ctx);
      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toBe('text/plain');
      expect(await response.text()).toBe('User-agent: *');
      expect(ctx.next).toHaveBeenCalledOnce();
    }
  });
});
