import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { handleRequest } from '../index.js';
import { CSP_REPORT_MAX_BYTES, CSP_REPORTS_PER_MINUTE, isRateLimited, parseViolations, resetCspRateLimit } from '../routes/cspReport.js';

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

  it('répond au corps vide, absent ou au JSON invalide par 204 sans journaliser', async () => {
    const noBody = new Request('https://api.example.test/api/v1/csp-report', {
      method: 'POST', headers: { 'Content-Type': 'application/csp-report' },
    });
    for (const request of [noBody, post(''), post('{pas du json')]) {
      const response = await handleRequest(request, env);
      expect(response.status).toBe(204);
      expect(await response.text()).toBe('');
    }
    expect(violationLogs()).toEqual([]);
  });

  it('ignore les formats inconnus sans erreur', () => {
    expect(parseViolations(null)).toEqual([]);
    expect(parseViolations({ autre: 1 })).toEqual([]);
    expect(parseViolations([{ type: 'deprecation', body: {} }])).toEqual([]);
  });
});

// Rapport valide dont le corps fait exactement `size` octets.
const reportOfSize = (size: number) => {
  const base = JSON.stringify({ 'csp-report': { 'document-uri': 'https://leblanc-et-moi.pages.dev/fr', 'effective-directive': 'img-src', 'blocked-uri': '' } });
  const body = base.replace('"blocked-uri":""', `"blocked-uri":"${'x'.repeat(size - base.length)}"`);
  expect(new TextEncoder().encode(body).length).toBe(size);
  return body;
};

// Flux qui compte les morceaux lus et les annulations ; ne produit un morceau que sur demande.
const countingStream = (chunks: number, chunkSize: number) => {
  const stats = { pulled: 0, cancelled: 0 };
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (stats.pulled >= chunks) return controller.close();
      stats.pulled += 1;
      controller.enqueue(new Uint8Array(chunkSize).fill(0x20));
    },
    cancel() {
      stats.cancelled += 1;
    },
  }, { highWaterMark: 0 });
  return { stream, stats };
};

const streamed = (body: ReadableStream<Uint8Array>, headers: Record<string, string> = {}) =>
  new Request('https://api.example.test/api/v1/csp-report', {
    method: 'POST', body, duplex: 'half',
    headers: { 'Content-Type': 'application/csp-report', 'CF-Connecting-IP': '203.0.113.7', ...headers },
  } as RequestInit);

const chunksOf = (text: string, size: number) => {
  const bytes = new TextEncoder().encode(text);
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (let offset = 0; offset < bytes.length; offset += size) controller.enqueue(bytes.slice(offset, offset + size));
      controller.close();
    },
  });
};

describe('POST /api/v1/csp-report — limite de 8 Kio lue en flux', () => {
  it('accepte un corps de 8192 octets et refuse 8193 octets', async () => {
    expect((await handleRequest(post(reportOfSize(CSP_REPORT_MAX_BYTES)), env)).status).toBe(204);
    expect(violationLogs()).toHaveLength(1);
    expect((await handleRequest(post(reportOfSize(CSP_REPORT_MAX_BYTES + 1)), env)).status).toBe(413);
    expect(violationLogs()).toHaveLength(1);
  });

  it('refuse un Content-Length annoncé trop grand sans lire le corps', async () => {
    const { stream, stats } = countingStream(100, 1024);
    const response = await handleRequest(streamed(stream, { 'Content-Length': String(CSP_REPORT_MAX_BYTES + 1) }), env);
    expect(response.status).toBe(413);
    expect(stats.pulled).toBe(0);
  });

  it('ne se fie pas à un Content-Length mensonger : arrête la lecture peu après la limite et annule le flux', async () => {
    const { stream, stats } = countingStream(10_000, 1024);
    const response = await handleRequest(streamed(stream, { 'Content-Length': '100' }), env);
    expect(response.status).toBe(413);
    expect(stats.pulled).toBe(CSP_REPORT_MAX_BYTES / 1024 + 1);
    expect(stats.cancelled).toBe(1);
    expect(violationLogs()).toEqual([]);
  });

  it('arrête aussi la lecture sans Content-Length', async () => {
    const { stream, stats } = countingStream(10_000, 1000);
    expect((await handleRequest(streamed(stream), env)).status).toBe(413);
    expect(stats.pulled).toBe(9);
    expect(stats.cancelled).toBe(1);
  });

  it('assemble un corps découpé en morceaux sous la limite et refuse au-dessus', async () => {
    expect((await handleRequest(streamed(chunksOf(JSON.stringify(legacy), 7)), env)).status).toBe(204);
    expect(violationLogs()).toHaveLength(1);
    expect((await handleRequest(streamed(chunksOf(reportOfSize(CSP_REPORT_MAX_BYTES), 1000)), env)).status).toBe(204);
    expect(violationLogs()).toHaveLength(2);
    expect((await handleRequest(streamed(chunksOf(reportOfSize(CSP_REPORT_MAX_BYTES + 1), 1000)), env)).status).toBe(413);
    expect(violationLogs()).toHaveLength(2);
  });

  it('décode l’UTF-8 découpé au milieu d’un caractère', async () => {
    const body = JSON.stringify({ 'csp-report': { 'document-uri': 'https://leblanc-et-moi.pages.dev/fr/événements', 'effective-directive': 'img-src' } });
    expect((await handleRequest(streamed(chunksOf(body, 3)), env)).status).toBe(204);
    expect(violationLogs()[0]).toContain('/fr/événements');
  });
});
