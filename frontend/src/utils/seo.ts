import type { EventDetail } from '@leblanc/shared';

/** Empêche une description externe de terminer la balise script JSON-LD. */
export function serializeJsonLd(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

export function eventStructuredData(
  event: EventDetail,
  url: string,
  image: string,
): Record<string, unknown> {
  return {
    '@type': 'Event',
    name: event.title,
    description: event.description,
    startDate: event.startDate,
    ...(event.endDate ? { endDate: event.endDate } : {}),
    url,
    image,
    location: {
      '@type': 'Place',
      ...(event.venueName ? { name: event.venueName } : {}),
      ...(event.address || event.postalCode || event.city
        ? {
            address: {
              '@type': 'PostalAddress',
              ...(event.address ? { streetAddress: event.address } : {}),
              ...(event.postalCode ? { postalCode: event.postalCode } : {}),
              ...(event.city ? { addressLocality: event.city } : {}),
            },
          }
        : {}),
      geo: { '@type': 'GeoCoordinates', latitude: event.latitude, longitude: event.longitude },
    },
    ...(event.isFree || event.priceMin !== null
      ? {
          offers: {
            '@type': 'Offer',
            price: event.isFree ? 0 : event.priceMin,
            priceCurrency: event.currency,
            url: event.publicUrl || url,
          },
        }
      : {}),
    isAccessibleForFree: event.isFree,
    // Le contrat API ne fournit pas d'organisateur : ne pas confondre avec la source.
  };
}
