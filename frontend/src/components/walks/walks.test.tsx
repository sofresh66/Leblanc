// @vitest-environment jsdom
import fs from 'node:fs';
import path from 'node:path';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { createInstance } from 'i18next';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ROUTE_SEGMENTS, buildLocalizedPath, resolveRoute, type TrailSummary } from '@leblanc/shared';
import { ApiError } from '../../api/apiEventsRepository';
import frWalks from '../../../public/locales/fr/walks.json';
import enWalks from '../../../public/locales/en/walks.json';
import frCommon from '../../../public/locales/fr/common.json';
import frErrors from '../../../public/locales/fr/errors.json';
import { TrailCard } from './TrailCard';
import { TrailList } from './TrailList';
import { formatTrailDuration, loopLabel } from './trailFormat';
import {
  DEFAULT_WALK_FILTERS,
  countActiveWalkFilters,
  readWalkFilterParams,
  toTrailFilters,
  writeWalkFilterParams,
} from './walkFilterParams';

const { mockInfiniteTrails } = vi.hoisted(() => ({ mockInfiniteTrails: vi.fn() }));
vi.mock('../../hooks/useTrails', () => ({ useInfiniteTrails: mockInfiniteTrails }));

const i18n = createInstance();
void i18n.use(initReactI18next).init({
  lng: 'fr', fallbackLng: 'fr', defaultNS: 'walks', ns: ['walks', 'common', 'errors'],
  resources: { fr: { walks: frWalks, common: frCommon, errors: frErrors }, en: { walks: enWalks } },
  initImmediate: false, interpolation: { escapeValue: false },
});
const t = i18n.getFixedT('fr', 'walks');

const trail = (overrides: Partial<TrailSummary> = {}): TrailSummary => ({
  id: 'c1000000-0000-4000-8000-000000000001',
  title: 'Balade à pied n°14 - Rive gauche, rive droite',
  contentLanguage: 'fr',
  modes: ['foot'],
  isLoop: true,
  distanceM: 11500,
  durationMin: 180,
  durationDays: null,
  start: { lat: 46.63, lng: 1.17 },
  startCity: 'Fontgombault',
  distanceFromLeBlancM: 8758,
  hasTrack: true,
  imageUrl: 'https://centre.media.tourinsoft.eu/upload/photo.jpg',
  imageCredit: '© Hellio et Van Ingen',
  imageLicense: null,
  officialUrl: 'http://www.parc-naturel-brenne.fr/',
  producer: 'Destination Brenne',
  updatedAt: '2026-01-04T00:00:00.000Z',
  ...overrides,
});

function renderWithProviders(node: React.ReactNode) {
  return render(<I18nextProvider i18n={i18n}><MemoryRouter>{node}</MemoryRouter></I18nextProvider>);
}

afterEach(() => { cleanup(); mockInfiniteTrails.mockReset(); });

describe('Routes localisées de « Se balader »', () => {
  it('utilise les segments validés et les résout dans les six langues', () => {
    const expected = { fr: 'se-balader', en: 'trails', es: 'rutas', de: 'touren', it: 'percorsi', nl: 'routes' } as const;
    for (const [lang, segment] of Object.entries(expected)) {
      expect(ROUTE_SEGMENTS[lang as keyof typeof expected].walks).toBe(segment);
      expect(buildLocalizedPath('walks', lang as keyof typeof expected)).toBe(`/${lang}/${segment}`);
      expect(resolveRoute(`/${lang}/${segment}`)).toEqual({ lang, section: 'walks' });
    }
    // La fiche arrive au lot 5 : pas de page d'identifiant d'ici là.
    expect(resolveRoute('/fr/se-balader/abc').section).toBe('notFound');
  });
});

describe('Traductions de « Se balader »', () => {
  const locales = path.resolve(__dirname, '../../../public/locales');
  const keys = (value: unknown, prefix = ''): string[] => Object.entries(value as Record<string, unknown>)
    .flatMap(([key, child]) => (typeof child === 'object' && child !== null ? keys(child, `${prefix}${key}.`) : [`${prefix}${key}`]));
  const read = (lang: string, ns: string) => JSON.parse(fs.readFileSync(path.join(locales, lang, `${ns}.json`), 'utf8')) as Record<string, unknown>;

  it('a les mêmes clés, non vides, dans les six langues (walks, nav, seo)', () => {
    const reference = keys(read('fr', 'walks')).sort();
    for (const lang of ['fr', 'en', 'es', 'de', 'it', 'nl']) {
      const walks = read(lang, 'walks');
      expect(keys(walks).sort(), lang).toEqual(reference);
      for (const key of reference) {
        const value = key.split('.').reduce<unknown>((node, part) => (node as Record<string, unknown>)[part], walks);
        expect(typeof value === 'string' && value.trim().length > 0, `${lang}:${key}`).toBe(true);
      }
      expect(read(lang, 'nav').walks, lang).toBeTruthy();
      expect(read(lang, 'seo').walks, lang).toMatchObject({ title: expect.any(String), description: expect.any(String) });
    }
  });
});

describe('Paramètres d’URL des filtres', () => {
  it('à pied, vélo et VTT par défaut ; rien d’écrit pour le défaut', () => {
    expect(readWalkFilterParams(new URLSearchParams())).toEqual(DEFAULT_WALK_FILTERS);
    expect(writeWalkFilterParams(new URLSearchParams('q=anglin&view=map'), DEFAULT_WALK_FILTERS).toString()).toBe('q=anglin&view=map');
    expect(countActiveWalkFilters(DEFAULT_WALK_FILTERS)).toBe(0);
  });

  it('écrit et relit les filtres, et ignore les valeurs inconnues', () => {
    const values = { ...DEFAULT_WALK_FILTERS, modes: ['horse' as const, 'foot' as const], withTrack: true, loop: true, distance: '5-10' as const, duration: 240 as const };
    const params = writeWalkFilterParams(new URLSearchParams(), values);
    expect(params.toString()).toBe('modes=foot%2Chorse&withTrack=true&loop=true&distance=5-10&duration=240');
    expect(readWalkFilterParams(params)).toEqual({ ...values, modes: ['foot', 'horse'] });
    expect(readWalkFilterParams(new URLSearchParams('modes=car&distance=99&duration=7&withTrack=1')))
      .toEqual(DEFAULT_WALK_FILTERS);
  });

  it('convertit vers les unités de l’API', () => {
    expect(toTrailFilters({ ...DEFAULT_WALK_FILTERS, distance: '10-20', duration: 120, withTrack: true }, 'en', 'anglin'))
      .toEqual({ lang: 'en', modes: ['foot', 'bike', 'mtb'], withTrack: true, minKm: 10, maxKm: 20, maxDurationMin: 120, q: 'anglin' });
    expect(toTrailFilters({ ...DEFAULT_WALK_FILTERS, distance: '0-5' }, 'fr')).toMatchObject({ maxKm: 5 });
    expect(toTrailFilters({ ...DEFAULT_WALK_FILTERS, distance: '20+' }, 'fr')).toMatchObject({ minKm: 20 });
  });
});

describe('Formats', () => {
  it('durée en heures, minutes ou jours, sans estimation', () => {
    expect(formatTrailDuration({ durationMin: 150, durationDays: 0.5 }, t, 'fr')).toBe('2 h 30');
    expect(formatTrailDuration({ durationMin: 120, durationDays: null }, t, 'fr')).toBe('2 h');
    expect(formatTrailDuration({ durationMin: 45, durationDays: null }, t, 'fr')).toBe('45 min');
    expect(formatTrailDuration({ durationMin: null, durationDays: 0.5 }, t, 'fr')).toBe('Une demi-journée');
    expect(formatTrailDuration({ durationMin: null, durationDays: 3 }, t, 'fr')).toBe('3 jours');
    expect(formatTrailDuration({ durationMin: null, durationDays: 1.5 }, t, 'fr')).toBe('1,5 jour');
    expect(formatTrailDuration({ durationMin: null, durationDays: null }, t, 'fr')).toBeNull();
  });

  it('boucle inconnue : rien', () => {
    expect(loopLabel(null, t)).toBeNull();
    expect(loopLabel(true, t)).toBe('Boucle');
    expect(loopLabel(false, t)).toBe('Aller simple');
  });
});

describe('TrailCard', () => {
  it('affiche crédit, modes, boucle, distance, durée, tracé et source', () => {
    renderWithProviders(<TrailCard trail={trail()} />);
    expect(screen.getByText('Photo : © Hellio et Van Ingen')).toBeTruthy();
    const badges = within(screen.getByRole('list', { name: 'Modes' }));
    expect(badges.getByText('À pied')).toBeTruthy();
    expect(badges.getByText('Boucle')).toBeTruthy();
    expect(screen.getByText('11,5 km')).toBeTruthy();
    expect(screen.getByText('3 h')).toBeTruthy();
    expect(screen.getByText('Fontgombault · Départ à 8,8 km du Blanc')).toBeTruthy();
    expect(screen.getByText('Tracé disponible')).toBeTruthy();
    expect(screen.getByText('Source : DATAtourisme, Destination Brenne')).toBeTruthy();
  });

  it('sans tracé : « Tracé non disponible » et lien vers la fiche officielle (nouvel onglet)', () => {
    renderWithProviders(<TrailCard trail={trail({ hasTrack: false, isLoop: null })} />);
    expect(screen.getByText('Tracé non disponible')).toBeTruthy();
    const link = screen.getByRole('link', { name: `${trail().title} : fiche officielle (nouvel onglet)` });
    expect(link.getAttribute('href')).toBe('http://www.parc-naturel-brenne.fr/');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
    expect(screen.queryByText('Boucle')).toBeNull();
    expect(screen.queryByText('Aller simple')).toBeNull();
  });

  it('cite la licence seulement si elle est fournie, et n’invente pas de crédit', () => {
    renderWithProviders(<TrailCard trail={trail({ imageLicense: 'By-NC-ND 4.0' })} />);
    expect(screen.getByText('Photo : © Hellio et Van Ingen (By-NC-ND 4.0)')).toBeTruthy();
    cleanup();
    renderWithProviders(<TrailCard trail={trail({ imageCredit: null, imageLicense: 'By-NC-ND 4.0' })} />);
    expect(screen.queryByText(/Photo/)).toBeNull();
    cleanup();
    renderWithProviders(<TrailCard trail={trail({ officialUrl: null, producer: null })} />);
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.getByText('Source : DATAtourisme')).toBeTruthy();
  });
});

describe('TrailList', () => {
  const page = (items: TrailSummary[], nextCursor: string | null = null) => ({ items, nextCursor, attributions: [], generatedAt: '2026-10-10T12:00:00.000Z' });

  it('garde l’ordre de l’API, sans tri côté client', () => {
    mockInfiniteTrails.mockReturnValue({
      isLoading: false, isError: false, cursorExpired: false, hasNextPage: false,
      data: { pages: [page([trail({ id: 'c1000000-0000-4000-8000-00000000000b', title: 'Z avec tracé', distanceFromLeBlancM: 9000 }),
        trail({ id: 'c1000000-0000-4000-8000-00000000000a', title: 'A sans tracé', hasTrack: false, distanceFromLeBlancM: 100 })])] },
    });
    renderWithProviders(<TrailList filters={{ lang: 'fr', modes: ['foot'] }} onResetFilters={vi.fn()} />);
    expect(screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent)).toEqual(['Z avec tracé', 'A sans tracé']);
  });

  it('curseur expiré : chargement silencieux, jamais d’erreur affichée', () => {
    const error = new ApiError(400, 'CURSOR_EXPIRED', 'Curseur expiré');
    mockInfiniteTrails.mockReturnValue({ isLoading: false, isError: true, error, cursorExpired: true, data: undefined });
    renderWithProviders(<TrailList filters={{ lang: 'fr', modes: ['foot'] }} onResetFilters={vi.fn()} />);
    expect(screen.getByRole('status').getAttribute('aria-busy')).toBe('true');
    expect(screen.queryByTestId('error-state')).toBeNull();
    cleanup();
    mockInfiniteTrails.mockReturnValue({ isLoading: false, isError: true, error, cursorExpired: true, isFetchNextPageError: true, hasNextPage: true, data: { pages: [page([trail()], 'next')] } });
    renderWithProviders(<TrailList filters={{ lang: 'fr', modes: ['foot'] }} onResetFilters={vi.fn()} />);
    expect(screen.queryByTestId('error-state')).toBeNull();
  });

  it('état vide avec réinitialisation', () => {
    mockInfiniteTrails.mockReturnValue({ isLoading: false, isError: false, cursorExpired: false, data: { pages: [page([])] } });
    const reset = vi.fn();
    renderWithProviders(<TrailList filters={{ lang: 'fr', modes: ['foot'] }} onResetFilters={reset} />);
    fireEvent.click(screen.getByRole('button', { name: 'Réinitialiser' }));
    expect(reset).toHaveBeenCalledOnce();
  });
});
