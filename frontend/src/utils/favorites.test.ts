// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createFavoritesStore, FAVORITES_STORAGE_KEY, MAX_FAVORITES, parseFavorites, serializeFavorites, type FavoriteItem,
} from './favorites';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const A = id(1);
const B = id(2);
const NOW = new Date('2026-10-15T20:00:00.000Z');

/** Stockage en mémoire conforme à l'interface Storage. */
function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() { return data.size; },
    clear: () => data.clear(),
    getItem: (key) => data.get(key) ?? null,
    key: (index) => [...data.keys()][index] ?? null,
    removeItem: (key) => { data.delete(key); },
    setItem: (key, value) => { data.set(key, String(value)); },
  };
}

let storage: Storage;
const store = () => createFavoritesStore(() => storage, () => NOW);

beforeEach(() => { storage = memoryStorage(); });
afterEach(() => vi.restoreAllMocks());

describe('parseFavorites', () => {
  it('ignore un JSON corrompu, une autre version ou une forme inattendue', () => {
    expect(parseFavorites(null)).toEqual([]);
    expect(parseFavorites('{pas du json')).toEqual([]);
    expect(parseFavorites('[]')).toEqual([]);
    expect(parseFavorites('null')).toEqual([]);
    expect(parseFavorites(JSON.stringify({ v: 2, items: [{ type: 'event', id: A, addedAt: NOW.toISOString() }] }))).toEqual([]);
    expect(parseFavorites(JSON.stringify({ v: 1, items: 'x' }))).toEqual([]);
  });

  it('écarte les entrées invalides, dédoublonne et plafonne à 100', () => {
    const valid = (n: number): FavoriteItem => ({ type: 'event', id: id(n), addedAt: NOW.toISOString() });
    const raw = JSON.stringify({ v: 1, items: [
      valid(1), valid(1), { ...valid(2), id: A.toUpperCase() }, { type: 'place', id: id(3), addedAt: NOW.toISOString() },
      { type: 'event', id: 'pas-un-uuid', addedAt: NOW.toISOString() }, { type: 'event', id: id(4), addedAt: 'hier' },
      ...Array.from({ length: 150 }, (_, n) => valid(100 + n)),
    ] });
    const items = parseFavorites(raw);
    expect(items).toHaveLength(MAX_FAVORITES);
    expect(items[0]).toEqual(valid(1));
    expect(new Set(items.map((item) => item.id)).size).toBe(MAX_FAVORITES);
    expect(items.some((item) => item.id === id(3) || item.id === id(4))).toBe(false);
  });

  it('écrit un format versionné qui ne contient que type, identifiant et date d’ajout', () => {
    const raw = serializeFavorites([{ type: 'event', id: A, addedAt: NOW.toISOString() }]);
    expect(JSON.parse(raw)).toEqual({ v: 1, items: [{ type: 'event', id: A, addedAt: '2026-10-15T20:00:00.000Z' }] });
  });
});

describe('createFavoritesStore', () => {
  it('ajoute et retire de façon idempotente sous la clé versionnée', () => {
    const favorites = store();
    expect(favorites.add('event', A)).toBe(true);
    expect(favorites.add('event', A.toUpperCase())).toBe(true);
    expect(favorites.getSnapshot()).toEqual([{ type: 'event', id: A, addedAt: NOW.toISOString() }]);
    expect(JSON.parse(storage.getItem(FAVORITES_STORAGE_KEY)!).v).toBe(1);
    expect(favorites.remove('event', A)).toBe(true);
    expect(favorites.remove('event', A)).toBe(true);
    expect(favorites.getSnapshot()).toEqual([]);
    expect(storage.getItem(FAVORITES_STORAGE_KEY)).toBeNull();
  });

  it('bascule, refuse un identifiant invalide et vide tout', () => {
    const favorites = store();
    favorites.toggle('event', A);
    favorites.toggle('event', B);
    favorites.toggle('event', A);
    expect(favorites.getSnapshot().map((item) => item.id)).toEqual([B]);
    expect(favorites.add('event', 'abc')).toBe(false);
    expect(favorites.clear()).toBe(true);
    expect(favorites.getSnapshot()).toEqual([]);
  });

  it('refuse le 101e favori et le signale', () => {
    const favorites = store();
    for (let n = 1; n <= MAX_FAVORITES; n++) expect(favorites.add('event', id(n))).toBe(true);
    expect(favorites.add('event', id(999))).toBe(false);
    expect(favorites.getSnapshot()).toHaveLength(MAX_FAVORITES);
    expect(favorites.getNotice()).toBe('limit');
    favorites.remove('event', id(1));
    expect(favorites.getNotice()).toBeNull();
    expect(favorites.add('event', id(999))).toBe(true);
  });

  it('garde l’état précédent quand setItem lève une exception (stockage plein)', () => {
    const favorites = store();
    favorites.add('event', A);
    vi.spyOn(storage, 'setItem').mockImplementation(() => { throw new DOMException('plein', 'QuotaExceededError'); });
    expect(favorites.add('event', B)).toBe(false);
    expect(favorites.getSnapshot().map((item) => item.id)).toEqual([A]);
    expect(favorites.getNotice()).toBe('error');
  });

  it('fonctionne en mémoire quand le stockage est absent ou lève à la lecture', () => {
    const absent = createFavoritesStore(() => null, () => NOW);
    expect(absent.isPersistent()).toBe(false);
    absent.add('event', A);
    expect(absent.has('event', A)).toBe(true);

    const throwing = createFavoritesStore(() => ({ ...memoryStorage(), getItem: () => { throw new Error('SecurityError'); } }), () => NOW);
    expect(throwing.isPersistent()).toBe(false);
    expect(throwing.getSnapshot()).toEqual([]);
    expect(throwing.add('event', B)).toBe(true);
    expect(throwing.getSnapshot().map((item) => item.id)).toEqual([B]);
  });

  it('ignore un contenu corrompu sans planter, puis l’écrase proprement', () => {
    storage.setItem(FAVORITES_STORAGE_KEY, '{"v":1,"items":[oups');
    const favorites = store();
    expect(favorites.getSnapshot()).toEqual([]);
    favorites.add('event', A);
    expect(parseFavorites(storage.getItem(FAVORITES_STORAGE_KEY))).toHaveLength(1);
  });

  it('renvoie le même instantané tant que le contenu ne change pas', () => {
    const favorites = store();
    favorites.add('event', A);
    expect(favorites.getSnapshot()).toBe(favorites.getSnapshot());
  });

  it('prévient les abonnés après une écriture et à l’événement storage d’un autre onglet', () => {
    const favorites = store();
    const listener = vi.fn();
    const unsubscribe = favorites.subscribe(listener);
    favorites.add('event', A);
    expect(listener).toHaveBeenCalledTimes(1);

    // Autre onglet : il écrit directement dans le stockage puis le navigateur émet « storage ».
    storage.setItem(FAVORITES_STORAGE_KEY, serializeFavorites([{ type: 'event', id: B, addedAt: NOW.toISOString() }]));
    window.dispatchEvent(new StorageEvent('storage', { key: FAVORITES_STORAGE_KEY }));
    expect(listener).toHaveBeenCalledTimes(2);
    expect(favorites.getSnapshot().map((item) => item.id)).toEqual([B]);
    window.dispatchEvent(new StorageEvent('storage', { key: 'autre-cle' }));
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
    window.dispatchEvent(new StorageEvent('storage', { key: FAVORITES_STORAGE_KEY }));
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
