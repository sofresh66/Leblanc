const AMENITIES = '^(restaurant|bar|cafe|fast_food|pub)$';

export const OVERPASS_QUERY = `[out:json][timeout:90];
(
  node["amenity"~"${AMENITIES}"](around:20000,46.6333,1.0833);
  way["amenity"~"${AMENITIES}"](around:20000,46.6333,1.0833);
);
out center tags;`;

export const OVERPASS_SERVERS = [
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass-api.de/api/interpreter',
  'https://overpass.osm.ch/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];

const USER_AGENT = 'LeblancEtMoi/1.0 (contact: elharchdenis@gmail.com)';
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export class OverpassError extends Error {
  constructor(code) {
    super(`Overpass indisponible : ${code}`);
    this.name = 'OverpassError';
    this.code = code;
  }
}

export function createOverpassClient({
  fetchImpl = fetch,
  sleep = pause,
  servers = OVERPASS_SERVERS,
  timeoutMs = 90_000,
} = {}) {
  if (!Array.isArray(servers) || !servers.length || !servers.every((server) => {
    try { return new URL(server).protocol === 'https:'; } catch { return false; }
  })) throw new Error('Serveurs Overpass invalides');

  async function fetchPlaces() {
    let lastCode = 'NO_SERVER';
    for (const [index, server] of servers.entries()) {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const response = await fetchImpl(server, {
            method: 'POST',
            headers: {
              Accept: 'application/json',
              'Content-Type': 'application/x-www-form-urlencoded',
              'User-Agent': USER_AGENT,
            },
            body: new URLSearchParams({ data: OVERPASS_QUERY }),
            signal: AbortSignal.timeout(timeoutMs),
            redirect: 'error',
          });
          if (response.status === 429 || response.status === 504) {
            lastCode = `HTTP_${response.status}`;
            if (attempt === 0) {
              const retryAfter = Number(response.headers.get('Retry-After'));
              await sleep(Number.isFinite(retryAfter) && retryAfter > 0
                ? Math.min(retryAfter * 1000, 20_000) : 2_000);
              continue;
            }
            break;
          }
          if (!response.ok) {
            lastCode = `HTTP_${response.status}`;
            // Une erreur de requête est identique sur tous les serveurs.
            if (response.status >= 400 && response.status < 500) throw new OverpassError(lastCode);
            break;
          }
          const payload = await response.json();
          if (!Array.isArray(payload?.elements) || payload.remark) {
            lastCode = 'INVALID_PAYLOAD';
            break;
          }
          // Cette zone contient déjà des dizaines de lieux connus. Une réponse vide
          // d'un miroir n'est pas une collecte réussie : essayer le suivant.
          if (payload.elements.length === 0) {
            lastCode = 'EMPTY_PAYLOAD';
            break;
          }
          return { elements: payload.elements, serverIndex: index + 1 };
        } catch (error) {
          if (error instanceof OverpassError) throw error;
          lastCode = 'NETWORK_OR_TIMEOUT';
          break;
        }
      }
    }
    throw new OverpassError(lastCode);
  }

  return { fetchPlaces };
}
