// Complément de tracé OpenStreetMap (ODbL) pour les parcours DATAtourisme.
// Règle stricte, validée par le propriétaire : nom OSM concordant, même famille
// de mode, départ DATAtourisme à 500 m au plus du tracé. Les cas limites sont
// tranchés à la main dans data/route-osm-matches.json (force / reject).
import { mergeLines, nearestPointOnLines } from './geo.mjs';
import { normalizeTitle } from './datatourisme-routes-normalizer.mjs';

export const MAX_START_DISTANCE_M = 500;
// Le Blanc + PNR de la Brenne (emprise de la relation 4287018, arrondie).
export const OVERPASS_ROUTES_QUERY = `[out:json][timeout:180][bbox:46.35,0.68,46.95,1.62];
rel["type"="route"]["route"~"^(hiking|foot|walking|bicycle|mtb|horse)$"];
out geom;`;

const MAIN_ROLES = new Set(['', 'main', 'forward', 'backward']);
const MODE_FAMILIES = {
  hiking: ['foot'], foot: ['foot'], walking: ['foot'],
  bicycle: ['bike', 'mtb'], mtb: ['mtb', 'bike'],
  horse: ['horse'],
};
// « Itinéraire vélo n°8 - La Creuse… » côté OSM : seul le nom propre compte.
const OSM_NAME_PREFIX = /^(itineraire velo|balade a pied|circuit)( n)? \d+ /;
const MIN_NAME_LENGTH = 8;

/** Nom OSM normalisé, sans préfixe numéroté, ou null s'il est trop court pour conclure. */
export function comparableOsmName(name) {
  if (typeof name !== 'string') return null;
  const normalized = normalizeTitle(name).replace(OSM_NAME_PREFIX, '');
  return normalized.length >= MIN_NAME_LENGTH ? normalized : null;
}

export function namesMatch(datatourismeTitle, osmName) {
  const osm = comparableOsmName(osmName);
  return osm !== null && ` ${normalizeTitle(datatourismeTitle)} `.includes(` ${osm} `);
}

export function modesMatch(routeModes, osmRoute) {
  const family = MODE_FAMILIES[osmRoute] ?? [];
  return routeModes.some((mode) => family.includes(mode));
}

/** Lignes [lon, lat] d'une relation Overpass (`out geom`), voies principales seulement. */
export function relationLines(relation) {
  const ways = (relation.members ?? [])
    .filter((member) => member.type === 'way' && MAIN_ROLES.has(member.role ?? '') && Array.isArray(member.geometry))
    .map((member) => member.geometry
      .filter((point) => Number.isFinite(point?.lon) && Number.isFinite(point?.lat))
      .map((point) => [point.lon, point.lat]));
  return mergeLines(ways);
}

export function indexMatchDecisions(entries) {
  const decisions = new Map();
  for (const entry of entries) {
    if (typeof entry?.externalId !== 'string' || !Number.isSafeInteger(entry?.osmRelationId)
      || !['force', 'reject'].includes(entry?.decision) || typeof entry?.note !== 'string' || !entry.note.trim()) {
      throw new Error(`Décision de correspondance OSM invalide : ${JSON.stringify(entry)}`);
    }
    decisions.set(`${entry.externalId}|${entry.osmRelationId}`, entry.decision);
  }
  return decisions;
}

/** Prépare les relations utilisables : tracé non vide et tags utiles. */
export function prepareRelations(elements) {
  return elements
    .filter((element) => element?.type === 'relation' && Number.isSafeInteger(element.id))
    .map((element) => ({
      id: element.id,
      name: element.tags?.name ?? null,
      route: element.tags?.route ?? null,
      network: element.tags?.network ?? null,
      roundtrip: element.tags?.roundtrip ?? null,
      lines: relationLines(element),
    }))
    .filter((relation) => relation.lines.length > 0);
}

/**
 * Meilleure relation pour un parcours, ou null. `route` : sortie du normaliseur
 * (titre, modes, départ [lon, lat]).
 */
export function matchRoute({ externalId, route }, relations, decisions = new Map()) {
  let best = null;
  for (const relation of relations) {
    const decision = decisions.get(`${externalId}|${relation.id}`);
    if (decision === 'reject') continue;
    const nearest = nearestPointOnLines(route.start, relation.lines);
    if (!nearest) continue;
    const ruleOk = namesMatch(route.titleI18n.fr, relation.name) && modesMatch(route.modes, relation.route)
      && nearest.distanceM <= MAX_START_DISTANCE_M;
    if (!ruleOk && decision !== 'force') continue;
    const candidate = { relation, nearest, forced: decision === 'force' && !ruleOk };
    if (!best || candidate.forced > best.forced || (candidate.forced === best.forced && nearest.distanceM < best.nearest.distanceM)) {
      best = candidate;
    }
  }
  if (!best) return null;
  const { relation, nearest, forced } = best;
  return {
    relationId: relation.id,
    relationName: relation.name,
    network: relation.network,
    lines: relation.lines,
    startDistanceM: Math.round(nearest.distanceM),
    // Départ « Y aller » : point du tracé le plus proche du départ annoncé.
    start: nearest.point,
    isLoop: relation.roundtrip === 'yes' ? true : relation.roundtrip === 'no' ? false : null,
    forced,
  };
}
