import { useSyncExternalStore } from 'react';
import { favoritesStore, type FavoriteItem, type FavoriteNotice, type FavoritesStore } from '../utils/favorites';

const EMPTY: readonly FavoriteItem[] = [];

/** Favoris du visiteur : tous les composants abonnés se mettent à jour ensemble. */
export function useFavorites(store: FavoritesStore = favoritesStore) {
  const items = useSyncExternalStore(store.subscribe, store.getSnapshot, () => EMPTY);
  const notice: FavoriteNotice | null = useSyncExternalStore(store.subscribe, store.getNotice, () => null);
  return {
    items,
    count: items.length,
    notice,
    persistent: store.isPersistent(),
    isFavorite: (id: string) => items.some((item) => item.type === 'event' && item.id === id.toLowerCase()),
    toggleEvent: (id: string) => store.toggle('event', id),
    removeEvent: (id: string) => store.remove('event', id),
    clear: () => store.clear(),
    clearNotice: () => store.clearNotice(),
  };
}
