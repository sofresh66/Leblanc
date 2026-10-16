// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HelmetProvider } from 'react-helmet-async';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EventDetail } from '@leblanc/shared';
import { MockEventsRepository } from '../../api/eventsRepository';
import { EventCard } from '../events/EventCard';
import { FavoriteButton } from './FavoriteButton';
import { FavoritesNavLink, FavoritesNotice } from './FavoritesNav';
import { FavoritesPage, isPastEvent } from '../../pages/FavoritesPage';
import { createLimiter, FAVORITES_CONCURRENCY } from '../../hooks/useFavoriteEvents';
import { favoritesStore, FAVORITES_STORAGE_KEY, MAX_FAVORITES } from '../../utils/favorites';

const { getEventById } = vi.hoisted(() => ({ getEventById: vi.fn() }));
vi.mock('../../api', () => ({ eventsRepository: { getEventById } }));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { title?: string; count?: number }) =>
      options?.title !== undefined ? `${key}|${options.title}` : options?.count !== undefined ? `${key}|${options.count}` : key,
    i18n: { language: 'fr' },
  }),
}));

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
let base: EventDetail;
const detail = (n: number, start: string, end: string, title = `Événement ${n}`): EventDetail => ({
  ...base, id: id(n), title, startDate: start, endDate: end, allDay: false,
  occurrences: [{ id: id(1000 + n), startDate: start, endDate: end, timezone: 'Europe/Paris', allDay: false }],
});

function renderWith(ui: React.ReactElement, client = new QueryClient({ defaultOptions: { queries: { retry: 0 } } })) {
  return render(
    <HelmetProvider><QueryClientProvider client={client}><MemoryRouter initialEntries={['/fr/favoris']}>{ui}</MemoryRouter></QueryClientProvider></HelmetProvider>,
  );
}

beforeEach(async () => {
  localStorage.clear();
  favoritesStore.clearNotice();
  getEventById.mockReset();
  const repository = new MockEventsRepository();
  const first = (await repository.listEvents({ lang: 'fr', limit: 1 })).items[0]!;
  base = (await repository.getEventById(first.id, 'fr'))!;
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('FavoriteButton', () => {
  it('bascule aria-pressed et son libellé contextuel, tous les cœurs ensemble', () => {
    renderWith(<><FavoriteButton eventId={id(1)} title="Concert" variant="overlay" /><FavoriteButton eventId={id(1)} title="Concert" variant="action" /></>);
    const [overlay, action] = screen.getAllByRole('button');
    expect(overlay!.getAttribute('aria-pressed')).toBe('false');
    expect(overlay!.getAttribute('aria-label')).toBe('favorites.add|Concert');
    expect(action!.textContent).toContain('favorites.addShort');
    fireEvent.click(overlay!);
    expect(overlay!.getAttribute('aria-pressed')).toBe('true');
    expect(action!.getAttribute('aria-pressed')).toBe('true');
    expect(overlay!.getAttribute('aria-label')).toBe('favorites.remove|Concert');
    expect(action!.textContent).toContain('favorites.saved');
    expect(JSON.parse(localStorage.getItem(FAVORITES_STORAGE_KEY)!).items[0].id).toBe(id(1));
    fireEvent.click(action!);
    expect(overlay!.getAttribute('aria-pressed')).toBe('false');
  });

  it('sur la carte : un bouton cœur hors de tout lien', () => {
    renderWith(<EventCard event={{ ...base, id: id(5) }} />);
    const heart = screen.getByRole('button', { name: /^favorites\.add\|/ });
    expect(heart.closest('a')).toBeNull();
    expect(document.querySelectorAll('a button, button a')).toHaveLength(0);
    expect(heart.className).toContain('h-11');
  });

  it('affiche le message du plafond de 100', () => {
    for (let n = 1; n <= MAX_FAVORITES; n++) favoritesStore.add('event', id(n));
    renderWith(<><FavoriteButton eventId={id(500)} title="De trop" variant="action" /><FavoritesNotice /></>);
    fireEvent.click(screen.getByRole('button', { name: 'favorites.add|De trop' }));
    expect(screen.getByRole('status').textContent).toContain('favorites.limit');
    fireEvent.click(screen.getByRole('button', { name: 'favorites.dismiss' }));
    expect(screen.getByRole('status').textContent).toBe('');
  });
});

describe('FavoritesNavLink', () => {
  it('compte les favoris dans une zone de largeur fixe (0, 1, 2 chiffres)', () => {
    renderWith(<FavoritesNavLink />);
    const link = screen.getByRole('link');
    const counter = screen.getByTestId('favorites-count');
    expect(link.getAttribute('href')).toBe('/fr/favoris');
    expect(counter.textContent).toBe('0');
    expect(counter.className).toContain('w-[3ch]');
    act(() => { favoritesStore.add('event', id(1)); });
    expect(counter.textContent).toBe('1');
    expect(link.getAttribute('aria-label')).toBe('favoritesCount|1');
    act(() => { for (let n = 2; n <= 12; n++) favoritesStore.add('event', id(n)); });
    expect(counter.textContent).toBe('12');
    expect(counter.className).toContain('w-[3ch]');
    // En-tête seulement à partir de la largeur tablette.
    expect(link.className).toContain('hidden md:inline-flex');
  });

  it('variante du menu mobile : libellé, compteur et fermeture du menu', () => {
    favoritesStore.add('event', id(1));
    const onNavigate = vi.fn();
    renderWith(<FavoritesNavLink variant="menu" onNavigate={onNavigate} />);
    const link = screen.getByRole('link', { name: 'favoritesCount|1' });
    expect(link.textContent).toContain('favorites');
    expect(screen.getByTestId('favorites-count-menu').textContent).toBe('1');
    fireEvent.click(link);
    expect(onNavigate).toHaveBeenCalled();
  });
});

describe('FavoritesPage', () => {
  it('page vide : texte d’aide et liens vers la liste et l’accueil, sans appel', () => {
    renderWith(<FavoritesPage />);
    const empty = screen.getByTestId('favorites-empty');
    expect(within(empty).getByText('favorites.emptyTitle')).toBeTruthy();
    expect(within(empty).getByRole('link', { name: 'favorites.browse' }).getAttribute('href')).toBe('/fr/liste');
    expect(within(empty).getByRole('link', { name: 'favorites.home' }).getAttribute('href')).toBe('/fr');
    expect(getEventById).not.toHaveBeenCalled();
  });

  it('trie par date, regroupe les passés en bas, signale les introuvables et garde les favoris en erreur', async () => {
    favoritesStore.add('event', id(3));
    favoritesStore.add('event', id(1));
    favoritesStore.add('event', id(2));
    favoritesStore.add('event', id(4));
    favoritesStore.add('event', id(5));
    getEventById.mockImplementation((eventId: string) => {
      if (eventId === id(1)) return Promise.resolve(detail(1, '2099-03-01T10:00:00Z', '2099-03-01T12:00:00Z', 'Mars'));
      if (eventId === id(2)) return Promise.resolve(detail(2, '2099-01-01T10:00:00Z', '2099-01-01T12:00:00Z', 'Janvier'));
      if (eventId === id(3)) return Promise.resolve(detail(3, '2020-01-01T10:00:00Z', '2020-01-01T12:00:00Z', 'Passé'));
      if (eventId === id(4)) return Promise.resolve(null);
      return Promise.reject(new Error('503'));
    });
    renderWith(<FavoritesPage />);

    await screen.findByText('Janvier');
    const upcoming = screen.getByRole('region', { name: 'favorites.upcoming' });
    expect(within(upcoming).getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual(['Janvier', 'Mars']);
    const past = screen.getByRole('region', { name: 'favorites.past' });
    expect(within(past).getByText('Passé')).toBeTruthy();
    const unavailable = await screen.findAllByTestId('favorite-unavailable');
    expect(unavailable).toHaveLength(2);
    expect(within(unavailable[0]!).getByText('favorites.missingItem')).toBeTruthy();
    expect(within(unavailable[1]!).getByText('favorites.errorItem')).toBeTruthy();
    // Une panne n'efface rien ; « Retirer » sur un introuvable le retire.
    expect(favoritesStore.has('event', id(5))).toBe(true);
    fireEvent.click(within(unavailable[0]!).getByRole('button', { name: 'favorites.remove' }));
    expect(favoritesStore.has('event', id(4))).toBe(false);
    await waitFor(() => expect(screen.getAllByTestId('favorite-unavailable')).toHaveLength(1));
  });

  it('« Tout retirer » demande une confirmation accessible, Annuler et Échap n’effacent rien', async () => {
    favoritesStore.add('event', id(1));
    favoritesStore.add('event', id(2));
    getEventById.mockImplementation((eventId: string) => Promise.resolve(detail(Number(eventId.slice(-3)), '2099-01-01T10:00:00Z', '2099-01-01T12:00:00Z')));
    renderWith(<FavoritesPage />);
    fireEvent.click(screen.getByRole('button', { name: 'favorites.clearAll' }));
    const dialog = screen.getByRole('group', { name: 'favorites.confirmClear|2' });
    const confirm = within(dialog).getByRole('button', { name: 'favorites.confirm' });
    expect(document.activeElement).toBe(confirm);
    fireEvent.click(within(dialog).getByRole('button', { name: 'favorites.cancel' }));
    expect(favoritesStore.getSnapshot()).toHaveLength(2);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'favorites.clearAll' }));

    fireEvent.click(screen.getByRole('button', { name: 'favorites.clearAll' }));
    fireEvent.keyDown(screen.getByRole('group', { name: 'favorites.confirmClear|2' }), { key: 'Escape' });
    expect(favoritesStore.getSnapshot()).toHaveLength(2);

    fireEvent.click(screen.getByRole('button', { name: 'favorites.clearAll' }));
    fireEvent.click(screen.getByRole('button', { name: 'favorites.confirm' }));
    expect(favoritesStore.getSnapshot()).toHaveLength(0);
    expect(screen.getByTestId('favorites-empty')).toBeTruthy();
    expect(screen.getAllByRole('status').some((node) => node.textContent === 'favorites.cleared')).toBe(true);
  });

  it('ne rappelle pas l’API pour un événement déjà en cache (même clé que la fiche)', async () => {
    favoritesStore.add('event', id(1));
    const client = new QueryClient({ defaultOptions: { queries: { retry: 0 } } });
    client.setQueryData(['events', 'detail', id(1), 'fr'], detail(1, '2099-01-01T10:00:00Z', '2099-01-01T12:00:00Z', 'En cache'));
    renderWith(<FavoritesPage />, client);
    expect(await screen.findByText('En cache')).toBeTruthy();
    expect(getEventById).not.toHaveBeenCalled();
  });

  it('isPastEvent : passé seulement quand toutes les séances sont terminées', () => {
    const now = new Date('2026-10-15T12:00:00Z');
    const event = detail(1, '2026-10-01T10:00:00Z', '2026-10-01T12:00:00Z');
    expect(isPastEvent(event, now)).toBe(true);
    expect(isPastEvent({ ...event, occurrences: [...event.occurrences,
      { id: id(9), startDate: '2026-11-01T10:00:00Z', endDate: '2026-11-01T12:00:00Z', timezone: 'Europe/Paris', allDay: false }] }, now)).toBe(false);
  });
});

describe('createLimiter', () => {
  it(`ne laisse jamais plus de ${FAVORITES_CONCURRENCY} appels en cours`, async () => {
    const run = createLimiter(FAVORITES_CONCURRENCY);
    let active = 0;
    let peak = 0;
    const task = () => run(async () => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active--;
      return 'ok';
    });
    const results = await Promise.all(Array.from({ length: 20 }, task));
    expect(results).toHaveLength(20);
    expect(peak).toBe(FAVORITES_CONCURRENCY);
  });

  it('libère la place d’une tâche en échec', async () => {
    const run = createLimiter(1);
    await expect(run(() => Promise.reject(new Error('x')))).rejects.toThrow('x');
    await expect(run(() => Promise.resolve(2))).resolves.toBe(2);
  });
});
