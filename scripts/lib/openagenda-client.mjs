const BASE_URL = 'https://api.openagenda.com/v2';
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export class OpenAgendaError extends Error {
  constructor(code, cause) {
    super(`OpenAgenda: ${code}`, { cause });
    this.name = 'OpenAgendaError';
    this.code = code;
  }
}

export function createOpenAgendaClient({
  apiKey,
  fetchImpl = fetch,
  sleep = pause,
  now = Date.now,
  timeoutMs = 30_000,
  intervalMs = 250,
  maxRequests = 100,
} = {}) {
  if (!apiKey) throw new Error('OPENAGENDA_API_KEY manquante');
  let requests = 0;
  let lastRequestAt = null;

  async function get(path, params) {
    const url = new URL(`${BASE_URL}${path}`);
    for (const [key, value] of params) url.searchParams.append(key, String(value));
    for (let attempt = 0; attempt < 3; attempt++) {
      if (requests >= maxRequests) throw new OpenAgendaError('REQUEST_LIMIT');
      if (lastRequestAt !== null) await sleep(Math.max(0, intervalMs - (now() - lastRequestAt)));
      lastRequestAt = now();
      requests++;
      let response;
      try {
        response = await fetchImpl(url, {
          headers: { key: apiKey },
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (error) {
        if (attempt === 2) throw new OpenAgendaError('NETWORK_OR_TIMEOUT', error);
        await sleep([1_000, 4_000][attempt]);
        continue;
      }
      if (response.ok) {
        try {
          return await response.json();
        } catch (error) {
          throw new OpenAgendaError('INVALID_JSON', error);
        }
      }
      if (response.status !== 429 && response.status < 500)
        throw new OpenAgendaError(`HTTP_${response.status}`);
      if (attempt === 2) throw new OpenAgendaError(`HTTP_${response.status}`);
      const retryAfter = Number(response.headers?.get?.('retry-after'));
      await sleep(
        Number.isFinite(retryAfter) && retryAfter > 0
          ? Math.min(retryAfter * 1_000, 60_000)
          : [1_000, 4_000][attempt],
      );
    }
    throw new OpenAgendaError('RETRIES_EXHAUSTED');
  }

  async function fetchEventPage({
    agendaUid,
    after = null,
    size = 100,
    since = '2026-01-01T00:00:00Z',
  }) {
    if (!/^\d+$/.test(String(agendaUid)) || !Number.isInteger(size) || size < 1 || size > 300)
      throw new OpenAgendaError('INVALID_PAGINATION');
    if (after !== null && (!Array.isArray(after) || after.some((part) => typeof part !== 'string')))
      throw new OpenAgendaError('INVALID_CURSOR');
    const params = [
      ['size', size],
      ['detailed', 1],
      ['timings[gte]', since],
      ['geo[northEast][lat]', 46.82],
      ['geo[northEast][lng]', 1.35],
      ['geo[southWest][lat]', 46.45],
      ['geo[southWest][lng]', 0.82],
    ];
    for (const part of after ?? []) params.push(['after[]', part]);
    const data = await get(`/agendas/${agendaUid}/events`, params);
    if (
      !Array.isArray(data?.events) ||
      !Number.isInteger(data?.total) ||
      (data.after !== null && !Array.isArray(data.after))
    )
      throw new OpenAgendaError('INVALID_EVENTS_RESPONSE');
    return data;
  }

  return {
    fetchEventPage,
    get requestCount() {
      return requests;
    },
  };
}
