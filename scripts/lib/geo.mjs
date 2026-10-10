// Calculs géographiques des parcours. Les points sont des tableaux [lon, lat]
// (ordre GeoJSON et WKT).

export const LE_BLANC = [1.0833, 46.6333];
const EARTH_RADIUS_M = 6_371_008.8;
const rad = (degrees) => (degrees * Math.PI) / 180;

/** Distance orthodromique en mètres entre deux points [lon, lat]. */
export function haversineMeters([lon1, lat1], [lon2, lat2]) {
  const dLat = rad(lat2 - lat1);
  const dLon = rad(lon2 - lon1);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

// Projection locale équirectangulaire autour de `origin`, en mètres : exacte à
// mieux que 0,1 % à l'échelle d'un parcours (quelques dizaines de km).
function projector([lon0, lat0]) {
  const kx = rad(1) * EARTH_RADIUS_M * Math.cos(rad(lat0));
  const ky = rad(1) * EARTH_RADIUS_M;
  return {
    to: ([lon, lat]) => [(lon - lon0) * kx, (lat - lat0) * ky],
    from: ([x, y]) => [lon0 + x / kx, lat0 + y / ky],
  };
}

/**
 * Point des lignes le plus proche de `point`, et sa distance en mètres.
 * `lines` : tableau de lignes, chacune un tableau de points [lon, lat].
 */
export function nearestPointOnLines(point, lines) {
  const projection = projector(point);
  let best = null;
  for (const line of lines) {
    for (let i = 0; i < line.length; i++) {
      const a = projection.to(line[i]);
      const b = projection.to(line[Math.min(i + 1, line.length - 1)]);
      const dx = b[0] - a[0];
      const dy = b[1] - a[1];
      const length = dx * dx + dy * dy;
      const t = length ? Math.max(0, Math.min(1, -(a[0] * dx + a[1] * dy) / length)) : 0;
      const candidate = [a[0] + t * dx, a[1] + t * dy];
      const distance = Math.hypot(candidate[0], candidate[1]);
      if (!best || distance < best.distanceM) best = { distanceM: distance, projected: candidate };
    }
  }
  if (!best) return null;
  const [lon, lat] = projection.from(best.projected);
  return { point: [lon, lat], distanceM: best.distanceM };
}

function inRing([lon, lat], ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Point dans un Polygon ou MultiPolygon GeoJSON (trous compris). */
export function pointInGeometry(point, geometry) {
  const polygons = geometry?.type === 'Polygon' ? [geometry.coordinates]
    : geometry?.type === 'MultiPolygon' ? geometry.coordinates : null;
  if (!polygons) throw new Error('Géométrie attendue : Polygon ou MultiPolygon');
  return polygons.some(([outer, ...holes]) => inRing(point, outer) && !holes.some((hole) => inRing(point, hole)));
}

const pointKey = ([lon, lat]) => `${lon.toFixed(7)},${lat.toFixed(7)}`;

/**
 * Assemble des voies (lignes) en chaînes continues quand leurs extrémités se
 * touchent. Les morceaux disjoints restent séparés (MultiLineString).
 */
export function mergeLines(ways) {
  const pending = ways.filter((way) => way.length >= 2).map((way) => [...way]);
  const chains = [];
  while (pending.length) {
    let chain = pending.shift();
    let extended = true;
    while (extended) {
      extended = false;
      const head = pointKey(chain[0]);
      const tail = pointKey(chain.at(-1));
      const index = pending.findIndex((way) => [head, tail].includes(pointKey(way[0])) || [head, tail].includes(pointKey(way.at(-1))));
      if (index < 0) break;
      const [way] = pending.splice(index, 1);
      const start = pointKey(way[0]);
      const end = pointKey(way.at(-1));
      if (start === tail) chain = chain.concat(way.slice(1));
      else if (end === tail) chain = chain.concat([...way].reverse().slice(1));
      else if (end === head) chain = way.concat(chain.slice(1));
      else chain = [...way].reverse().concat(chain.slice(1));
      extended = true;
    }
    chains.push(chain);
  }
  return chains;
}

/** WKT MultiLineString, coordonnées arrondies à 7 décimales (1 cm). */
export function toMultiLineStringWkt(lines) {
  if (!lines.length || lines.some((line) => line.length < 2)) throw new Error('Tracé vide ou ligne de moins de deux points');
  const coordinates = (line) => line.map(([lon, lat]) => `${+lon.toFixed(7)} ${+lat.toFixed(7)}`).join(', ');
  return `MULTILINESTRING(${lines.map((line) => `(${coordinates(line)})`).join(', ')})`;
}
