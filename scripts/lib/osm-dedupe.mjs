const ARTICLES = new Set(['le', 'la', 'les', 'l', 'de', 'du', 'des']);

export function comparableName(name) {
  return name.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
    .split(/\s+/).filter((word) => word && !ARTICLES.has(word)).join('');
}

export function nameSimilarity(left, right) {
  const a = comparableName(left);
  const b = comparableName(right);
  if (!a || !b) return 0;
  if (a === b) return 1;
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      current[j] = Math.min(current[j - 1] + 1, previous[j] + 1,
        previous[j - 1] + Number(a[i - 1] !== b[j - 1]));
    }
    previous = current;
  }
  return 1 - previous[b.length] / Math.max(a.length, b.length);
}

const comparableCity = (value) => value?.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '') || null;

export function classifyDedupe(dt, osm) {
  if (dt.source !== 'datatourisme_places' || osm.source !== 'openstreetmap')
    throw new Error('Ordre des place_id invalide');
  if (dt.id === osm.id) throw new Error('Ordre des place_id invalide');
  if (dt.type !== osm.type) return null;
  if (dt.postalCode && osm.postalCode && dt.postalCode !== osm.postalCode) return null;
  if (dt.city && osm.city && comparableCity(dt.city) !== comparableCity(osm.city)) return null;
  const distance = Number(dt.distanceMeters);
  if (!Number.isFinite(distance) || distance < 0 || distance >= 300) return null;
  const similarity = nameSimilarity(dt.name, osm.name);
  let level;
  if (similarity === 1 && distance < 50) level = 1;
  else if (similarity > 0.85 && distance < 150 && dt.postalCode &&
    dt.postalCode === osm.postalCode) level = 2;
  else if (similarity >= 0.6 && similarity <= 0.85) level = 3;
  else return null;
  const score = Math.min(1, Math.max(0, similarity * 0.9 + (1 - distance / 300) * 0.1));
  return {
    leftPlaceId: dt.id,
    rightPlaceId: osm.id,
    score: Number(score.toFixed(3)),
    level,
    distanceMeters: distance,
    decision: level === 3 ? 'pending' : 'merge',
    reason: {
      datatourismeName: dt.name,
      osmName: osm.name,
      normalizedDatatourismeName: comparableName(dt.name),
      normalizedOsmName: comparableName(osm.name),
      nameSimilarity: Number(similarity.toFixed(3)),
      distanceMeters: distance,
      datatourismeCity: dt.city,
      osmCity: osm.city,
      datatourismePostalCode: dt.postalCode,
      osmPostalCode: osm.postalCode,
      type: osm.type,
    },
  };
}

export function bestDedupeCandidate(candidates) {
  return candidates.sort((a, b) => a.level - b.level || b.score - a.score ||
    a.distanceMeters - b.distanceMeters)[0] ?? null;
}
