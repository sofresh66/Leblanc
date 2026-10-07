/**
 * Réutilise aussi les échecs de géocodage (null) tant que l'adresse reste
 * identique, sauf avec retryMissing (relance manuelle ponctuelle).
 */
export function planManualGeocoding(items, storedPlaces, { retryMissing = false } = {}) {
  const existing = new Map(storedPlaces.map((place) => [place.external_id, place]));
  const points = new Map();
  const pending = [];
  for (const item of items) {
    const place = existing.get(item.externalId);
    const unchanged = place
      && (place.address ?? null) === (item.adresse || null)
      && (place.postal_code ?? null) === (item.codePostal || null)
      && place.city === item.commune;
    if (!unchanged) {
      pending.push(item);
      continue;
    }
    if (place.latitude === null && place.longitude === null) {
      if (retryMissing) pending.push(item);
      else points.set(item.externalId, null);
      continue;
    }
    const latitude = Number(place.latitude);
    const longitude = Number(place.longitude);
    if (place.latitude == null || place.longitude == null
      || !Number.isFinite(latitude) || !Number.isFinite(longitude)
      || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
      pending.push(item);
      continue;
    }
    points.set(item.externalId, { latitude, longitude });
  }
  return { points, pending };
}
