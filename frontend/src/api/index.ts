import { ApiEventsRepository } from './apiEventsRepository';
import { MockEventsRepository, type EventsRepository } from './eventsRepository';
import { ApiPlacesRepository } from './apiPlacesRepository';
import type { PlacesRepository } from './placesRepository';

/** `VITE_USE_MOCK=true` force l'usage des données locales (mock) au lieu de l'API réelle. */
const useMock = import.meta.env.VITE_USE_MOCK === 'true';

/**
 * Point de bascule unique entre le mock local et l'API Worker réelle.
 *
 * Le type `EventsRepository` est appliqué explicitement afin que les consommateurs
 * (hooks TanStack Query) conservent exactement les mêmes types qu'avec le mock.
 */
export const eventsRepository: EventsRepository = useMock
  ? new MockEventsRepository()
  : new ApiEventsRepository();

export type { EventsRepository };

/** Les lieux utilisent toujours l'API réelle : aucun mock n'est prévu dans ce sous-lot. */
export const placesRepository: PlacesRepository = new ApiPlacesRepository();

export type { PlacesRepository };
