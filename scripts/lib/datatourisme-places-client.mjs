const BASE_URL = 'https://api.datatourisme.fr/v1/placeOfInterest';
// Le probe réel confirme que type=A,B ne réalise pas une union.
export const PLACE_TYPES = [
  'FoodEstablishment',
  'Restaurant',
  'BarOrPub',
  'CafeOrTeahouse',
  'FastFoodRestaurant',
  'StreetFood',
];
const FIELDS = [
  'uuid',
  'uri',
  'label',
  'type',
  'lastUpdate',
  'hasDescription',
  'isLocatedAt',
  'isLocatedAt.openingHoursSpecification',
  'openingHoursSpecification',
  'hasContact',
  'providesCuisineOfType',
  'offers',
  'hasMainRepresentation',
  'hasRepresentation',
  'hasFeature',
  'hasBeenCreatedBy',
].join(',');
const FILTER = `type[in]=${PLACE_TYPES.join(',')}`;
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export class DatatourismePlacesPageError extends Error {
  constructor(page, status) {
    super(`DATAtourisme places page ${page}: ${status}`);
    this.name = 'DatatourismePlacesPageError';
    this.status = status;
  }
}

export function createDatatourismePlacesClient({
  apiKey,
  fetchImpl = fetch,
  sleep = pause,
  timeoutMs = 30_000,
} = {}) {
  if (!apiKey?.trim()) throw new Error('DATATOURISME_API_KEY manquante');

  async function fetchPage({ page = 1, pageSize = 50, nextUrl = null } = {}) {
    if (
      !Number.isSafeInteger(page) ||
      page < 1 ||
      !Number.isInteger(pageSize) ||
      pageSize < 1 ||
      pageSize > 100
    ) {
      throw new Error('Pagination DATAtourisme places invalide');
    }
    const url = nextUrl ? new URL(nextUrl, BASE_URL) : new URL(BASE_URL);
    if (
      url.origin !== new URL(BASE_URL).origin ||
      url.pathname !== new URL(BASE_URL).pathname ||
      url.username ||
      url.password ||
      url.searchParams.has('api_key')
    ) {
      throw new Error('Lien de pagination DATAtourisme places invalide');
    }
    // Conserve le curseur opaque tout en imposant le périmètre de cette ingestion.
    url.searchParams.set('geo_distance', '46.6333,1.0833,20km');
    url.searchParams.set('filters', FILTER);
    url.searchParams.set('lang', 'fr,en,es,de,it,nl');
    url.searchParams.set('fields', FIELDS);
    url.searchParams.set('page_size', String(pageSize));
    if (!nextUrl) url.searchParams.set('page', String(page));

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const response = await fetchImpl(url, {
          headers: { 'X-API-Key': apiKey },
          signal: AbortSignal.timeout(timeoutMs),
          redirect: 'error',
        });
        if (response.ok) {
          const payload = await response.json();
          if (
            !Array.isArray(payload?.objects) ||
            !Number.isSafeInteger(payload?.meta?.total_pages) ||
            payload.meta.total_pages < 0 ||
            !Number.isSafeInteger(payload?.meta?.total) ||
            payload.meta.total < 0 ||
            (payload.meta.next != null && typeof payload.meta.next !== 'string')
          ) {
            throw new DatatourismePlacesPageError(page, 'INVALID_PAYLOAD');
          }
          return payload;
        }
        if ((response.status !== 429 && response.status < 500) || attempt === 2) {
          throw new DatatourismePlacesPageError(page, `HTTP_${response.status}`);
        }
      } catch (error) {
        if (error instanceof DatatourismePlacesPageError) throw error;
        if (attempt === 2) throw new DatatourismePlacesPageError(page, 'NETWORK_OR_TIMEOUT');
      }
      await sleep([1_000, 4_000][attempt]);
    }
    throw new DatatourismePlacesPageError(page, 'RETRIES_EXHAUSTED');
  }
  return { fetchPage };
}
