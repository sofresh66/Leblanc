// Favoris du visiteur, stockés uniquement dans son navigateur (localStorage) :
// des identifiants et une date d'ajout, aucune donnée personnelle, aucun envoi.

export type FavoriteType = 'event';

export interface FavoriteItem {
  type: FavoriteType;
  id: string;
  /** Date d'ajout (ISO 8601). */
  addedAt: string;
}

/** Échec d'un ajout, affiché au visiteur : plafond atteint ou écriture refusée. */
export type FavoriteNotice = 'limit' | 'error';

export const FAVORITES_STORAGE_KEY = 'lbm:favorites:v1';
export const FAVORITES_VERSION = 1;
export const MAX_FAVORITES = 100;

const TYPES: readonly FavoriteType[] = ['event'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMPTY: readonly FavoriteItem[] = Object.freeze([]);

function isFavoriteItem(value: unknown): value is FavoriteItem {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  return TYPES.includes(item.type as FavoriteType)
    && typeof item.id === 'string' && UUID.test(item.id)
    && typeof item.addedAt === 'string' && !Number.isNaN(Date.parse(item.addedAt));
}

/**
 * Lit le contenu stocké. JSON invalide, autre version ou entrées malformées :
 * ignorés sans erreur. Doublons retirés, plafond appliqué.
 */
export function parseFavorites(raw: string | null): FavoriteItem[] {
  if (!raw) return [];
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!data || typeof data !== 'object') return [];
  const { v, items } = data as { v?: unknown; items?: unknown };
  if (v !== FAVORITES_VERSION || !Array.isArray(items)) return [];
  const seen = new Set<string>();
  const result: FavoriteItem[] = [];
  for (const item of items) {
    if (!isFavoriteItem(item)) continue;
    const key = `${item.type}:${item.id.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({ type: item.type, id: item.id.toLowerCase(), addedAt: item.addedAt });
    if (result.length === MAX_FAVORITES) break;
  }
  return result;
}

export function serializeFavorites(items: readonly FavoriteItem[]): string {
  return JSON.stringify({ v: FAVORITES_VERSION, items });
}

export interface FavoritesStore {
  getSnapshot(): readonly FavoriteItem[];
  subscribe(listener: () => void): () => void;
  /** Faux quand le stockage du navigateur est inaccessible : favoris gardés en mémoire pour la session. */
  isPersistent(): boolean;
  getNotice(): FavoriteNotice | null;
  clearNotice(): void;
  has(type: FavoriteType, id: string): boolean;
  add(type: FavoriteType, id: string): boolean;
  remove(type: FavoriteType, id: string): boolean;
  toggle(type: FavoriteType, id: string): boolean;
  clear(): boolean;
}

function defaultStorage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    // Accès refusé (cookies bloqués, certains modes privés).
    return null;
  }
}

export function createFavoritesStore(
  getStorage: () => Storage | null = defaultStorage,
  now: () => Date = () => new Date(),
): FavoritesStore {
  const listeners = new Set<() => void>();
  let memory: readonly FavoriteItem[] = EMPTY;
  let lastRaw: string | null | undefined;
  let lastItems: readonly FavoriteItem[] = EMPTY;
  let notice: FavoriteNotice | null = null;

  const storage = (): Storage | null => {
    const candidate = getStorage();
    if (!candidate) return null;
    try {
      candidate.getItem(FAVORITES_STORAGE_KEY);
      return candidate;
    } catch {
      return null;
    }
  };

  const emit = () => listeners.forEach((listener) => listener());

  // Instantané stable tant que le contenu brut ne change pas (useSyncExternalStore).
  const getSnapshot = (): readonly FavoriteItem[] => {
    const target = storage();
    if (!target) return memory;
    const raw = target.getItem(FAVORITES_STORAGE_KEY);
    if (raw !== lastRaw) {
      lastRaw = raw;
      const parsed = parseFavorites(raw);
      lastItems = parsed.length === 0 ? EMPTY : parsed;
    }
    return lastItems;
  };

  const write = (next: readonly FavoriteItem[]): boolean => {
    const target = storage();
    if (!target) {
      memory = next.length === 0 ? EMPTY : next;
      emit();
      return true;
    }
    try {
      if (next.length === 0) target.removeItem(FAVORITES_STORAGE_KEY);
      else target.setItem(FAVORITES_STORAGE_KEY, serializeFavorites(next));
    } catch {
      // Stockage plein ou refusé : l'état précédent est conservé.
      notice = 'error';
      emit();
      return false;
    }
    emit();
    return true;
  };

  const sameItem = (type: FavoriteType, id: string) => (item: FavoriteItem) =>
    item.type === type && item.id === id.toLowerCase();

  const store: FavoritesStore = {
    getSnapshot,
    subscribe(listener) {
      listeners.add(listener);
      // Synchronisation entre onglets : l'événement storage ne vient que des autres onglets.
      const onStorage = (event: StorageEvent) => {
        if (event.key === FAVORITES_STORAGE_KEY || event.key === null) listener();
      };
      if (typeof window !== 'undefined') window.addEventListener('storage', onStorage);
      return () => {
        listeners.delete(listener);
        if (typeof window !== 'undefined') window.removeEventListener('storage', onStorage);
      };
    },
    isPersistent: () => storage() !== null,
    getNotice: () => notice,
    clearNotice() {
      if (notice === null) return;
      notice = null;
      emit();
    },
    has: (type, id) => getSnapshot().some(sameItem(type, id)),
    add(type, id) {
      if (!TYPES.includes(type) || !UUID.test(id)) return false;
      const current = getSnapshot();
      if (current.some(sameItem(type, id))) return true;
      if (current.length >= MAX_FAVORITES) {
        notice = 'limit';
        emit();
        return false;
      }
      notice = null;
      return write([...current, { type, id: id.toLowerCase(), addedAt: now().toISOString() }]);
    },
    remove(type, id) {
      const current = getSnapshot();
      if (!current.some(sameItem(type, id))) return true;
      notice = null;
      return write(current.filter((item) => !sameItem(type, id)(item)));
    },
    toggle(type, id) {
      return store.has(type, id) ? store.remove(type, id) : store.add(type, id);
    },
    clear() {
      notice = null;
      return write(EMPTY);
    },
  };
  return store;
}

/** Instance unique de l'application. */
export const favoritesStore = createFavoritesStore();
