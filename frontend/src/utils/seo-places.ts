import type { PlaceApi } from '@leblanc/shared';

const TYPES: Record<PlaceApi['type'], string> = {
  restaurant: 'Restaurant',
  bar: 'BarOrPub',
  cafe: 'CafeOrCoffeeShop',
  fast_food: 'FastFoodRestaurant',
  food_truck: 'FoodEstablishment',
  other_food: 'FoodEstablishment',
};
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export function getRestaurantJsonLd(place: PlaceApi): Record<string, unknown> {
  const address = {
    '@type': 'PostalAddress',
    ...(place.address ? { streetAddress: place.address } : {}),
    ...(place.postalCode ? { postalCode: place.postalCode } : {}),
    ...(place.city ? { addressLocality: place.city } : {}),
  };
  const hours = place.openingHours
    .filter((rule) => rule.weekOfMonth === null && rule.opens !== rule.closes)
    .map((rule) => ({
      '@type': 'OpeningHoursSpecification',
      dayOfWeek: rule.dayOfWeek.map((day) => `https://schema.org/${DAYS[day - 1]}`),
      opens: rule.opens,
      closes: rule.closes,
      ...(rule.validFrom ? { validFrom: rule.validFrom } : {}),
      ...(rule.validThrough ? { validThrough: rule.validThrough } : {}),
    }));
  const prices = [place.priceRangeMin, place.priceRangeMax].filter((price): price is number => price !== null);
  return {
    '@context': 'https://schema.org',
    '@type': TYPES[place.type],
    name: place.title,
    ...(place.description.trim() ? { description: place.description.trim() } : {}),
    ...(Object.keys(address).length > 1 ? { address } : {}),
    ...(place.latitude !== null && place.longitude !== null
      && Number.isFinite(place.latitude) && Number.isFinite(place.longitude)
      && !(place.latitude === 0 && place.longitude === 0)
      ? { geo: { '@type': 'GeoCoordinates', latitude: place.latitude, longitude: place.longitude } } : {}),
    ...(place.phone ? { telephone: place.phone } : {}),
    ...(place.website ? { url: place.website } : {}),
    ...(place.imageUrl ? { image: place.imageUrl } : {}),
    ...(prices.length ? { priceRange: `${prices.join('–')} ${place.currency}` } : {}),
    ...(place.cuisines.length ? { servesCuisine: place.cuisines } : {}),
    ...(hours.length ? { openingHoursSpecification: hours } : {}),
    ...(place.takeaway === true ? { takeaway: true } : {}),
  };
}
