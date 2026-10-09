import type { Env } from '../env.js';
import { errorResponse } from '../http/responses.js';

// Collecte des violations de la CSP du site (Content-Security-Policy, avec
// report-uri). Rien n'est stocké : une ligne épurée par violation
// dans les journaux Workers, sans IP ni paramètres d'URL.

export const CSP_REPORT_MAX_BYTES = 8 * 1024;
export const CSP_REPORTS_PER_MINUTE = 20;

const ACCEPTED_TYPES = ['application/csp-report', 'application/reports+json', 'application/json'];

// Limitation par IP, en mémoire de l'isolate (approximative, sans stockage).
const windows = new Map<string, { start: number; count: number }>();

export function isRateLimited(ip: string, now = Date.now()): boolean {
  const current = windows.get(ip);
  if (!current || now - current.start >= 60_000) {
    if (windows.size > 5000) windows.clear();
    windows.set(ip, { start: now, count: 1 });
    return false;
  }
  current.count += 1;
  return current.count > CSP_REPORTS_PER_MINUTE;
}

export function resetCspRateLimit(): void {
  windows.clear();
}

function withoutQuery(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.split(/[?#]/)[0]?.slice(0, 200) ?? '';
}

interface Violation {
  directive: string;
  blocked: string;
  document: string;
}

/** Formats acceptés : report-uri ({ "csp-report": … }) et Reporting API ([{ type, body }]). */
export function parseViolations(payload: unknown): Violation[] {
  const bodies: Record<string, unknown>[] = [];
  if (Array.isArray(payload)) {
    for (const report of payload) {
      if (report && typeof report === 'object' && (report as { type?: unknown }).type === 'csp-violation') {
        const body = (report as { body?: unknown }).body;
        if (body && typeof body === 'object') bodies.push(body as Record<string, unknown>);
      }
    }
  } else if (payload && typeof payload === 'object') {
    const legacy = (payload as Record<string, unknown>)['csp-report'];
    if (legacy && typeof legacy === 'object') bodies.push(legacy as Record<string, unknown>);
  }
  return bodies.slice(0, 10).map((body) => ({
    directive: String(body['effective-directive'] ?? body.effectiveDirective ?? body['violated-directive'] ?? '').slice(0, 60),
    blocked: withoutQuery(body['blocked-uri'] ?? body.blockedURL),
    document: withoutQuery(body['document-uri'] ?? body.documentURL),
  }));
}

export async function handleCspReport(request: Request, env: Env | undefined, requestId?: string): Promise<Response> {
  const contentType = (request.headers.get('Content-Type') ?? '').split(';')[0]?.trim().toLowerCase() ?? '';
  if (!ACCEPTED_TYPES.includes(contentType)) {
    return errorResponse(request, env, { status: 415, code: 'UNSUPPORTED_MEDIA_TYPE', message: 'Rapport CSP attendu', requestId });
  }
  const declared = Number(request.headers.get('Content-Length') ?? '0');
  if (declared > CSP_REPORT_MAX_BYTES) {
    return errorResponse(request, env, { status: 413, code: 'PAYLOAD_TOO_LARGE', message: 'Rapport trop volumineux', requestId });
  }
  const text = await request.text();
  if (new TextEncoder().encode(text).length > CSP_REPORT_MAX_BYTES) {
    return errorResponse(request, env, { status: 413, code: 'PAYLOAD_TOO_LARGE', message: 'Rapport trop volumineux', requestId });
  }
  const ip = request.headers.get('CF-Connecting-IP') ?? 'inconnue';
  if (!isRateLimited(ip)) {
    let payload: unknown = null;
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
    for (const violation of parseViolations(payload)) {
      console.log(JSON.stringify({ step: 'csp_violation', ...violation }));
    }
  }
  return new Response(null, { status: 204 });
}
