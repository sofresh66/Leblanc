import {
  EventCategorySchema,
  SupportedLanguageSchema,
  type CursorPayload,
  type EventCategory,
  type SupportedLanguage,
} from '@leblanc/shared';
import { z } from 'zod';
import { decodeCursor } from './cursor.js';

export interface ParsedEventListQuery {
  lang: SupportedLanguage;
  categories?: EventCategory[] | undefined;
  city?: string | undefined;
  isFree?: boolean | undefined;
  from?: string | undefined;
  to?: string | undefined;
  toExclusive?: boolean | undefined;
  maxDistance?: number | undefined;
  limit: number;
  cursor?: string | undefined;
  decodedCursor?: CursorPayload | undefined;
}

/**
 * Calcule l'offset horaire Europe/Paris pour une date UTC donnée.
 */
function getParisOffsetMs(utcDate: Date): number {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Paris',
    timeZoneName: 'longOffset',
  });
  const formatted = formatter.formatToParts(utcDate);
  const tzPart = formatted.find((p) => p.type === 'timeZoneName')?.value;
  if (tzPart) {
    const match = tzPart.match(/^GMT([+-])(\d{2}):(\d{2})(?::(\d{2}))?$/);
    if (match) {
      const sign = match[1] === '-' ? -1 : 1;
      return sign * (Number(match[2]) * 3600 + Number(match[3]) * 60 + Number(match[4] ?? 0)) * 1000;
    }
  }
  throw new Error('Impossible de déterminer le décalage Europe/Paris');
}

function parseCalendarDate(dateStr: string): Date {
  const date = new Date(`${dateStr}T00:00:00.000Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr) || dateStr.startsWith('0000') ||
      !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== dateStr) {
    throw new Error('Date calendaire invalide : format YYYY-MM-DD attendu');
  }
  return date;
}

function parisMidnight(date: Date): string {
  const localMidnight = date.getTime();
  let instant = localMidnight;
  // Résoudre le décalage au minuit ciblé, y compris les jours de changement d'heure.
  for (let attempt = 0; attempt < 3; attempt++) {
    const corrected = localMidnight - getParisOffsetMs(new Date(instant));
    if (corrected === instant) break;
    instant = corrected;
  }
  return new Date(instant).toISOString();
}

const IsoDateSchema = z.string().datetime({ offset: true }).refine(
  (value) => !value.startsWith('0000') && Number.isFinite(Date.parse(value)),
);

/**
 * Convertit une date "YYYY-MM-DD" en ISO UTC correspondant à 00:00:00 local Paris.
 */
export function toParisStartOfDay(dateStr: string): string {
  return parisMidnight(parseCalendarDate(dateStr));
}

/**
 * Convertit une date "YYYY-MM-DD" en ISO UTC correspondant à minuit (00:00:00)
 * le jour suivant en heure locale d'Europe/Paris.
 */
export function toParisMidnightNextDay(dateStr: string): string {
  const date = parseCalendarDate(dateStr);
  date.setUTCDate(date.getUTCDate() + 1);
  return parisMidnight(date);
}

/**
 * Valide et extrait les paramètres de requête de GET /api/v1/events.
 *
 * @param url URL de la requête entrante
 * @returns Paramètres validés et typés
 * @throws {Error} En cas de paramètre invalide
 */
export function parseEventListQuery(url: URL): ParsedEventListQuery {
  const params = url.searchParams;

  // 1. Langue
  const rawLang = params.get('lang') || 'fr';
  const langResult = SupportedLanguageSchema.safeParse(rawLang);
  if (!langResult.success) {
    throw new Error(
      `Paramètre "lang" invalide : "${rawLang}". Langues acceptées : fr, en, de, nl, es, it`
    );
  }
  const lang = langResult.data;

  // 2. Catégories (CB4d : gestion multi-paramètres et virgules)
  const rawCategories = params.getAll('category');
  let categories: EventCategory[] | undefined = undefined;
  if (rawCategories.length > 0) {
    const catList = rawCategories
      .flatMap((c) => c.split(','))
      .map((c) => c.trim())
      .filter(Boolean);

    for (const cat of catList) {
      const parsedCat = EventCategorySchema.safeParse(cat);
      if (!parsedCat.success) {
        throw new Error(`Catégorie invalide : "${cat}".`);
      }
    }
    categories = catList as EventCategory[];
  }

  // 3. Ville
  const rawCity = params.get('city');
  const city: string | undefined = rawCity ? rawCity.trim() : undefined;

  // 4. isFree (CB4a : strict 'true'/'false')
  const rawIsFree = params.get('isFree');
  let isFree: boolean | undefined = undefined;
  if (rawIsFree !== null) {
    if (rawIsFree === 'true') {
      isFree = true;
    } else if (rawIsFree === 'false') {
      isFree = false;
    } else {
      throw new Error('Paramètre "isFree" invalide : doit être "true" ou "false"');
    }
  }

  // 5. from
  const rawFrom = params.get('from');
  let from: string | undefined = undefined;
  if (rawFrom) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(rawFrom)) {
      from = toParisStartOfDay(rawFrom);
    } else {
      if (!IsoDateSchema.safeParse(rawFrom).success) {
        throw new Error(
          `Paramètre "from" invalide : "${rawFrom}". Format attendu : YYYY-MM-DD ou ISO 8601`
        );
      }
      from = rawFrom;
    }
  }

  // 6. to (CB4c : YYYY-MM-DD -> Paris minuit jour suivant)
  const rawTo = params.get('to');
  let to: string | undefined = undefined;
  let toExclusive = false;
  if (rawTo) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(rawTo)) {
      to = toParisMidnightNextDay(rawTo);
      toExclusive = true;
    } else {
      if (!IsoDateSchema.safeParse(rawTo).success) {
        throw new Error(
          `Paramètre "to" invalide : "${rawTo}". Format attendu : YYYY-MM-DD ou ISO 8601`
        );
      }
      to = rawTo;
    }
  }

  if (from && to && (Date.parse(from) > Date.parse(to) ||
      (toExclusive && Date.parse(from) === Date.parse(to)))) {
    throw new Error('La date "from" doit précéder la borne "to"');
  }

  // 7. maxDistance / distance (CB4b : 1 à 20000 m)
  const rawDistance = params.get('maxDistance') ?? params.get('distance');
  let maxDistance: number | undefined = undefined;
  if (rawDistance !== null) {
    const num = Number(rawDistance);
    if (!Number.isFinite(num) || num < 1 || num > 20000) {
      throw new Error('maxDistance doit être entre 1 et 20000 mètres');
    }
    maxDistance = num;
  }

  // 8. limit (1 à 50, défaut 20)
  const rawLimit = params.get('limit');
  let limit = 20;
  if (rawLimit !== null) {
    const num = Number(rawLimit);
    if (!Number.isInteger(num) || num < 1 || num > 50) {
      throw new Error('Paramètre "limit" invalide : doit être un entier entre 1 et 50');
    }
    limit = num;
  }

  // 9. cursor (décodage et validation CB6 / Correction 3b)
  const rawCursor = params.get('cursor');
  let cursor: string | undefined = undefined;
  let decodedCursor: CursorPayload | undefined = undefined;
  if (rawCursor !== null) {
    decodedCursor = decodeCursor(rawCursor);
    cursor = rawCursor;
  }

  return {
    lang,
    categories,
    city,
    isFree,
    from,
    to,
    toExclusive,
    maxDistance,
    limit,
    cursor,
    decodedCursor,
  };
}
