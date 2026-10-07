// Géocodage BAN via la Géoplateforme IGN (remplace api-adresse.data.gouv.fr,
// fermée fin janvier 2026). Limite publiée : 50 requêtes/s par IP.
export const BAN_SEARCH_URL = 'https://data.geopf.fr/geocodage/search';
export const BAN_MIN_SCORE = 0.6;
const MAX_DISTANCE_METERS = 20000;
// Une commune entière est trop imprécise pour placer un restaurant.
const ACCEPTED_TYPES = new Set(['housenumber', 'street', 'locality']);

const fold = (value) => value.normalize('NFD').replace(/\p{M}/gu, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, '');

function distanceMeters(a, b) {
  const radians = (degrees) => degrees * Math.PI / 180;
  const deltaPhi = radians(b.latitude - a.latitude);
  const deltaLambda = radians(b.longitude - a.longitude);
  const h = Math.sin(deltaPhi / 2) ** 2
    + Math.cos(radians(a.latitude)) * Math.cos(radians(b.latitude)) * Math.sin(deltaLambda / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export function buildBanUrl(item, baseUrl = BAN_SEARCH_URL) {
  const url = new URL(baseUrl);
  const params = new URLSearchParams({ q: `${item.adresse || item.nom} ${item.commune}`.trim(), limit: '1' });
  if (item.codePostal) params.set('postcode', item.codePostal);
  url.search = params.toString();
  return url;
}

/**
 * Valide la première réponse BAN : même commune, score suffisant, précision
 * au moins à la rue ou au lieu-dit, et moins de 20 km du centre.
 */
export function parseBanResponse(payload, item, center) {
  const feature = payload?.features?.[0];
  if (!feature) return { point: null, reason: 'no_result' };
  const { score, city, type } = feature.properties ?? {};
  const [longitude, latitude] = feature.geometry?.coordinates ?? [];
  if (typeof score !== 'number' || score < BAN_MIN_SCORE) return { point: null, reason: 'low_score', score };
  if (!ACCEPTED_TYPES.has(type)) return { point: null, reason: 'imprecise', score, type };
  if (typeof city !== 'string' || !fold(city).includes(fold(item.commune))) {
    return { point: null, reason: 'other_city', score, city };
  }
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return { point: null, reason: 'invalid_geometry' };
  const point = { latitude, longitude };
  if (distanceMeters(point, center) > MAX_DISTANCE_METERS) return { point: null, reason: 'too_far', score };
  return { point, reason: 'ok', score, type, label: feature.properties.label };
}

export async function geocodeWithBan(item, center, { fetchImpl = fetch, baseUrl = BAN_SEARCH_URL } = {}) {
  const response = await fetchImpl(buildBanUrl(item, baseUrl), {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`HTTP_${response.status}`);
  return parseBanResponse(await response.json(), item, center);
}
