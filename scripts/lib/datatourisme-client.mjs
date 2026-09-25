const BASE_URL = 'https://api.datatourisme.fr/v1/entertainmentAndEvent';
const FIELDS = [
  'uuid',
  'uri',
  'label',
  'type',
  'lastUpdate',
  'hasDescription',
  'isLocatedAt',
  'takesPlaceAt',
  'offers',
  'hasMainRepresentation',
  'hasContact',
  'hasBeenCreatedBy',
].join(',');

export class DatatourismePageError extends Error {
  constructor(page, status, cause) {
    super(`DATAtourisme page ${page}: ${status}`, { cause });
    this.name = 'DatatourismePageError';
    this.page = page;
    this.status = status;
  }
}

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function createDatatourismeClient({
  apiKey,
  fetchImpl = fetch,
  sleep = pause,
  timeoutMs = 30_000,
} = {}) {
  if (!apiKey) throw new Error('DATATOURISME_API_KEY manquante');

  async function fetchPage({
    page = 1,
    pageSize = 50,
    nextUrl = null,
    latitude = 46.6333,
    longitude = 1.0833,
    radiusKm = 20,
  }) {
    if (
      !Number.isInteger(page) ||
      page < 1 ||
      !Number.isInteger(pageSize) ||
      pageSize < 1 ||
      pageSize > 100
    ) {
      throw new Error('Pagination DATAtourisme invalide');
    }
    const url = nextUrl ? new URL(nextUrl) : new URL(BASE_URL);
    if (
      url.origin !== new URL(BASE_URL).origin ||
      url.pathname !== new URL(BASE_URL).pathname ||
      url.searchParams.has('api_key')
    ) {
      throw new Error('Lien de pagination DATAtourisme invalide');
    }
    if (!nextUrl) {
      url.searchParams.set('geo_distance', `${latitude},${longitude},${radiusKm}km`);
      url.searchParams.set('page_size', String(pageSize));
      url.searchParams.set('page', String(page));
      url.searchParams.set('lang', 'fr,en,es,de,it,nl');
      url.searchParams.set('fields', FIELDS);
    }

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const response = await fetchImpl(url, {
          headers: { 'X-API-Key': apiKey },
          signal: AbortSignal.timeout(timeoutMs),
        });
        if (response.ok) {
          const payload = await response.json();
          if (!Array.isArray(payload?.objects) || !Number.isInteger(payload?.meta?.total_pages)) {
            throw new DatatourismePageError(page, 'réponse JSON invalide');
          }
          return payload;
        }
        if (response.status !== 429 && response.status < 500) {
          throw new DatatourismePageError(page, `HTTP ${response.status}`);
        }
        if (attempt === 2) throw new DatatourismePageError(page, `HTTP ${response.status}`);
      } catch (error) {
        if (error instanceof DatatourismePageError) throw error;
        if (attempt === 2)
          throw new DatatourismePageError(page, 'échec réseau ou délai dépassé', error);
      }
      await sleep([1_000, 4_000, 16_000][attempt]);
    }
    throw new DatatourismePageError(page, 'tentatives épuisées');
  }

  return { fetchPage };
}
