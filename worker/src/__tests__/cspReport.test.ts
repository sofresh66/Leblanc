import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { handleRequest } from '../index.js';
import { CSP_REPORTS_PER_MINUTE, isRateLimited, parseViolations, resetCspRateLimit } from '../routes/cspReport.js';

const env = { DATABASE_URL: 'db', ALLOWED_ORIGINS: 'https://leblanc-et-moi.pages.dev' };
const legacy = {
  'csp-report': {
    'document-uri': 'https://leblanc-et-moi.pages.dev/fr/carte?q=secret',
    'violated-directive': 'img-src',
    'effective-directive': 'img-src',
    'blocked-uri': 'https://tiles.example.org/1/2/3.png?token=abc',
  },
};
const post = (body: string, type = 'application/csp-report', ip = '203.0.113.7') =>
  new Request('https://api.example.test/api/v1/csp-report', {
    method: 'POST', body, headers: { 'Content-Type': type, 'CF-Connecting-IP': ip },
  });

let log: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  resetCspRateLimit();
  log = vi.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => {
  log.mockRestore();
});

const violationLogs = () => log.mock.calls.map(([line]) => String(line)).filter((line) => line.includes('csp_violation'));

describe('POST /api/v1/csp-report', () => {
  it('répond 204 et journalise une violation épurée, sans paramètres d’URL ni IP', async () => {
    const response = await handleRequest(post(JSON.stringify(legacy)), env);
    expect(response.status).toBe(204);
    expect(violationLogs()).toEqual([JSON.stringify({
      step: 'csp_violation', directive: 'img-src', blocked: 'https://tiles.example.org/1/2/3.png',
      document: 'https://leblanc-et-moi.pages.dev/fr/carte',
    })]);
    expect(JSON.stringify(log.mock.calls)).not.toMatch(/secret|token|203\.0\.113\.7/);
  });

  it('accepte aussi le format Reporting API (application/reports+json)', async () => {
    const body = JSON.stringify([{ type: 'csp-violation', body: { effectiveDirective: 'script-src-elem', blockedURL: 'inline', documentURL: 'https://leblanc-et-moi.pages.dev/fr' } }]);
    expect((await handleRequest(post(body, 'application/reports+json'), env)).status).toBe(204);
    expect(violationLogs()[0]).toContain('"directive":"script-src-elem"');
  });

  it('refuse un rapport de plus de 8 Ko et un type de contenu inattendu', async () => {
    const huge = JSON.stringify({ 'csp-report': { 'document-uri': 'x'.repeat(9000) } });
    expect((await handleRequest(post(huge), env)).status).toBe(413);
    expect((await handleRequest(post('{}', 'text/plain'), env)).status).toBe(415);
    expect(violationLogs()).toEqual([]);
  });

  it('limite la journalisation par IP et par minute, en répondant toujours 204', async () => {
    for (let index = 0; index < CSP_REPORTS_PER_MINUTE + 5; index++) {
      expect((await handleRequest(post(JSON.stringify(legacy)), env)).status).toBe(204);
    }
    expect(violationLogs()).toHaveLength(CSP_REPORTS_PER_MINUTE);
    expect(isRateLimited('198.51.100.1')).toBe(false);
    expect(isRateLimited('203.0.113.7', Date.now() + 61_000)).toBe(false);
  });

  it('n’accepte que POST et annonce POST au préflight', async () => {
    const get = await handleRequest(new Request('https://api.example.test/api/v1/csp-report'), env);
    expect(get.status).toBe(405);
    expect(get.headers.get('Allow')).toBe('POST, OPTIONS');
    const preflight = await handleRequest(new Request('https://api.example.test/api/v1/csp-report', {
      method: 'OPTIONS', headers: { Origin: 'https://leblanc-et-moi.pages.dev' },
    }), env);
    expect(preflight.headers.get('Access-Control-Allow-Methods')).toBe('POST, OPTIONS');
  });

  it('ignore les formats inconnus sans erreur', () => {
    expect(parseViolations(null)).toEqual([]);
    expect(parseViolations({ autre: 1 })).toEqual([]);
    expect(parseViolations([{ type: 'deprecation', body: {} }])).toEqual([]);
  });
});
