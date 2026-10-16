import { useQueries } from '@tanstack/react-query';
import type { EventDetail } from '@leblanc/shared';
import { eventsRepository } from '../api';
import type { FavoriteItem } from '../utils/favorites';

/** Appels simultanés au plus vers l'API pour la page des favoris. */
export const FAVORITES_CONCURRENCY = 4;
/** Aligné sur le cache du Worker (fiche événement : max-age=60). */
export const FAVORITES_STALE_TIME = 60_000;

/** File d'attente minimale : au plus `max` promesses en cours. */
export function createLimiter(max: number) {
  let active = 0;
  const queue: Array<() => void> = [];
  const next = () => {
    if (active >= max) return;
    const start = queue.shift();
    if (!start) return;
    active++;
    start();
  };
  return function run<T>(task: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      queue.push(() => {
        task().then(resolve, reject).finally(() => {
          active--;
          next();
        });
      });
      next();
    });
  };
}

const limit = createLimiter(FAVORITES_CONCURRENCY);

export type FavoriteEventState =
  | { status: 'loading'; id: string }
  /** 404 : événement dépublié, supprimé ou hors rayon. */
  | { status: 'missing'; id: string }
  /** Panne réseau ou 5xx : le favori est conservé. */
  | { status: 'error'; id: string; retry: () => void }
  | { status: 'ready'; id: string; event: EventDetail };

/**
 * Détail de chaque favori, avec la même clé de cache que la fiche événement :
 * un identifiant déjà en cache et récent n'entraîne aucun appel.
 */
export function useFavoriteEvents(items: readonly FavoriteItem[], lang: string): FavoriteEventState[] {
  const results = useQueries({
    queries: items.map((item) => ({
      queryKey: ['events', 'detail', item.id, lang],
      queryFn: () => limit(() => eventsRepository.getEventById(item.id, lang)),
      staleTime: FAVORITES_STALE_TIME,
    })),
  });
  return results.map((result, index): FavoriteEventState => {
    const id = items[index]!.id;
    if (result.isError) return { status: 'error', id, retry: () => void result.refetch() };
    if (result.data === null) return { status: 'missing', id };
    if (result.data) return { status: 'ready', id, event: result.data };
    return { status: 'loading', id };
  });
}
