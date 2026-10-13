import type { Event } from '@leblanc/shared';
import { calendarDay } from './eventDates';

// Sélection des cartes de l'accueil (Top du moment, Ce week-end, Derniers ajouts).
// Module pur : l'heure courante et la langue sont passées en paramètres.

/** Événements chargés pour composer le Top et les derniers ajouts. */
export const HOME_POOL_SIZE = 40;
/** Événements chargés pour la section « Ce week-end ». */
export const WEEKEND_POOL_SIZE = 30;
/** Cartes par section. */
export const HOME_SECTION_SIZE = 3;
/** Au-delà de cette durée, une occurrence est « au long cours » (marché annuel, exposition). */
export const LONG_RUNNING_DAYS = 14;
/** Fenêtre de priorité des événements ponctuels. */
export const PUNCTUAL_WINDOW_DAYS = 14;
/**
 * Un marché à moins de cette distance du Blanc passe avant les autres événements au long cours.
 * 20 km = tout le périmètre du site : les marchés de la zone tournent d'un jour à l'autre.
 */
export const NEARBY_MARKET_METERS = 20_000;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Titre comparable : français de la source, sans accents, casse, ponctuation ni espaces. */
export function normalizeTitle(event: Pick<Event, 'title' | 'title_i18n'>): string {
  return (event.title_i18n?.fr ?? event.title ?? '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '');
}

export function isLongRunning(event: Pick<Event, 'startDate' | 'endDate'>): boolean {
  if (!event.endDate) return false;
  return Date.parse(event.endDate) - Date.parse(event.startDate) > LONG_RUNNING_DAYS * DAY_MS;
}

/** Marché ou foire, d'après le titre français (« marché », pas « marche » nordique). */
export function isMarket(event: Pick<Event, 'title' | 'title_i18n'>): boolean {
  const title = (event.title_i18n?.fr ?? event.title ?? '').toLowerCase();
  return /(^|[^\p{L}])(marchés?|foires?)([^\p{L}]|$)/u.test(title);
}

/** Graine du jour : même ordre toute la journée (UTC) dans une langue, autre ordre le lendemain. */
export function dailySeed(now: Date, lang: string): string {
  return `${now.toISOString().slice(0, 10)}|${lang}`;
}

/** Hachage FNV-1a 32 bits : rang pseudo-aléatoire stable d'un événement pour une graine. */
function seededRank(seed: string, id: string): number {
  let hash = 0x811c9dc5;
  const text = `${seed}|${id}`;
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function shuffle<T extends Pick<Event, 'id'>>(events: T[], seed: string): T[] {
  return [...events].sort((a, b) => seededRank(seed, a.id) - seededRank(seed, b.id) || a.id.localeCompare(b.id));
}

interface PickOptions {
  count: number;
  /** Identifiants et titres déjà affichés ailleurs : évités tant qu'il reste d'autres choix. */
  avoid?: Event[];
  /** Interdits quoi qu'il arrive (pas de répétition). */
  exclude?: Event[];
  /** Plafond par catégorie (relâché en dernier recours). */
  perCategory?: number;
  /** Événements déjà affichés sur la page : un marché parmi eux épuise le quota d'un marché. */
  shown?: Event[];
}

/**
 * Prend `count` événements dans l'ordre de priorité donné, en respectant : un seul par titre
 * normalisé (jamais relâché), au plus un au long cours, un marché et un par catégorie. Si cela
 * ne suffit pas, les règles sont relâchées dans l'ordre : événements à éviter, catégorie, puis
 * long cours et marchés.
 */
function pickDiverse(ordered: Event[], { count, avoid = [], exclude = [], perCategory = 1, shown = [] }: PickOptions): Event[] {
  const excludedIds = new Set(exclude.map((event) => event.id));
  const excludedTitles = new Set(exclude.map(normalizeTitle));
  const avoidedIds = new Set(avoid.map((event) => event.id));
  const avoidedTitles = new Set(avoid.map(normalizeTitle));
  const pool = ordered.filter((event) => !excludedIds.has(event.id) && !excludedTitles.has(normalizeTitle(event)));

  // Un seul marché sur toute la page : celui déjà affiché ailleurs compte.
  const markets = Math.max(0, 1 - shown.filter(isMarket).length);
  const stages = [
    { avoid: true, perCategory, maxLong: 1, maxMarkets: markets },
    { avoid: false, perCategory, maxLong: 1, maxMarkets: markets },
    { avoid: false, perCategory: Infinity, maxLong: 1, maxMarkets: markets },
    { avoid: false, perCategory: Infinity, maxLong: Infinity, maxMarkets: Infinity },
  ];
  const picked: Event[] = [];
  for (const stage of stages) {
    for (const event of pool) {
      if (picked.length >= count) return picked;
      if (picked.some((other) => other.id === event.id)) continue;
      const title = normalizeTitle(event);
      if (picked.some((other) => normalizeTitle(other) === title)) continue;
      if (stage.avoid && (avoidedIds.has(event.id) || avoidedTitles.has(title))) continue;
      if (picked.filter((other) => other.category === event.category).length >= stage.perCategory) continue;
      if (isLongRunning(event) && picked.filter(isLongRunning).length >= stage.maxLong) continue;
      if (isMarket(event) && picked.filter(isMarket).length >= stage.maxMarkets) continue;
      picked.push(event);
    }
  }
  return picked;
}

/**
 * Ordre de priorité : le meilleur événement au long cours (marché proche d'abord, une seule
 * place), puis les ponctuels des 14 prochains jours (mélangés), les ponctuels suivants, et
 * enfin les autres événements au long cours (repli).
 */
function priorityOrder(events: Event[], now: Date, seed: string): Event[] {
  const horizon = now.getTime() + PUNCTUAL_WINDOW_DAYS * DAY_MS;
  const punctual = events.filter((event) => !isLongRunning(event));
  const soon = shuffle(punctual.filter((event) => Date.parse(event.startDate) <= horizon), seed);
  const later = punctual.filter((event) => Date.parse(event.startDate) > horizon);
  const long = events.filter(isLongRunning);
  const nearbyMarkets = shuffle(long.filter((event) => isMarket(event) && event.distance <= NEARBY_MARKET_METERS), seed);
  const otherMarkets = shuffle(long.filter((event) => isMarket(event) && event.distance > NEARBY_MARKET_METERS), seed);
  const otherLong = shuffle(long.filter((event) => !isMarket(event)), seed);
  const longOrdered = [...nearbyMarkets, ...otherMarkets, ...otherLong];
  // En tête, le plafond par catégorie ne l'écarte pas ; l'ordre affiché est mélangé ensuite.
  return [...longOrdered.slice(0, 1), ...soon, ...later, ...longOrdered.slice(1)];
}

export interface HomeSelection {
  top: Event[];
  recent: Event[];
}

/**
 * Top du moment (3 cartes diversifiées, ordre mélangé du jour) et Derniers ajouts
 * (3 cartes suivantes dans l'ordre chronologique, sans répéter le Top ni ajouter de
 * marché s'il y en a déjà un dans le Top, sauf en dernier recours).
 */
export function selectHomeEvents(events: Event[], now: Date, lang: string): HomeSelection {
  const seed = dailySeed(now, lang);
  const top = shuffle(pickDiverse(priorityOrder(events, now, seed), { count: HOME_SECTION_SIZE }), seed);
  const recent = pickDiverse(events, { count: HOME_SECTION_SIZE, exclude: top, perCategory: Infinity, shown: top });
  return { top, recent };
}

/**
 * Ce week-end : mêmes règles de diversité ; évite si possible les cartes du Top, et n'ajoute
 * pas de marché si la page (Top, Derniers ajouts) en montre déjà un, sauf en dernier recours.
 * `events` provient de l'API filtrée sur le week-end (voir `upcomingWeekend`).
 */
export function selectWeekendEvents(events: Event[], now: Date, lang: string, top: Event[] = [], recent: Event[] = []): Event[] {
  const seed = dailySeed(now, lang);
  return shuffle(pickDiverse(priorityOrder(events, now, seed), { count: HOME_SECTION_SIZE, avoid: top, shown: [...top, ...recent] }), seed);
}

/**
 * Week-end en cours ou à venir, en jours calendaires de Paris (AAAA-MM-JJ) :
 * samedi → samedi-dimanche, dimanche → dimanche seul, sinon le samedi et le dimanche suivants.
 */
export function upcomingWeekend(now: Date): { from: string; to: string } {
  const today = calendarDay(now);
  const weekday = new Date(`${today}T12:00:00Z`).getUTCDay();
  const addDays = (days: number) => new Date(Date.parse(`${today}T12:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
  if (weekday === 0) return { from: today, to: today };
  const toSaturday = (6 - weekday + 7) % 7;
  return { from: addDays(toSaturday), to: addDays(toSaturday + 1) };
}
