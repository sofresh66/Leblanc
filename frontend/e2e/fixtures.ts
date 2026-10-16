import type { APIRequestContext } from '@playwright/test';
import { EventListResponseSchema, type Event } from '@leblanc/shared';

/** Découvre les événements réels en lecture seule, après un éventuel réveil Neon. */
export async function discoverEvents(request: APIRequestContext): Promise<Event[]> {
  for (let attempt = 0; attempt < 8; attempt++) {
    const response = await request.get('http://localhost:8787/api/v1/events?lang=fr&limit=50', {
      timeout: 35000,
    });
    if (response.ok()) {
      const parsed = EventListResponseSchema.parse(await response.json());
      if (parsed.items.length === 0) {
        throw new Error('Les tests E2E nécessitent au moins un événement actif');
      }
      return parsed.items;
    }
    if (response.status() !== 503) {
      throw new Error(`Découverte des événements impossible : HTTP ${response.status()}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error('Neon ne répond toujours pas après huit essais de lecture');
}

const DAY_MS = 24 * 3600 * 1000;

/**
 * Une séance courte à venir : le bouton calendrier est absent au-delà de 14 jours,
 * et le premier événement réel peut être un marché de plusieurs mois.
 */
export function shortUpcomingEvent(events: Event[]): Event | undefined {
  return events.find((candidate) => {
    const start = Date.parse(candidate.startDate);
    const end = Date.parse(candidate.endDate ?? candidate.startDate);
    return start > Date.now() && end - start < 7 * DAY_MS;
  });
}
