import {
  CATEGORIES,
  calculateHaversineDistance,
  CursorPayloadSchema,
  EventListParamsSchema,
  LE_BLANC_CENTER,
  resolveEventContent,
  SEARCH_RADIUS_METERS,
  type CategoryCount,
  type CursorPayload,
  type Event,
  type EventDetail,
  type EventListParamsInput,
  type EventListResponse,
  type RawEvent,
} from '@leblanc/shared';
import rawEventsData from './__mocks__/events.json';

export interface EventsRepository {
  listEvents(params: EventListParamsInput): Promise<EventListResponse>;
  getEventById(id: string, lang: string): Promise<EventDetail | null>;
  listCategories(): Promise<CategoryCount[]>;
  listCities(): Promise<string[]>;
}

export { CursorPayloadSchema, type CursorPayload };

function foldText(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

function encodeCursor(startDate: string, id: string, asOf: string): string {
  const payload = JSON.stringify({ d: startDate, i: id, a: asOf });
  return typeof btoa === 'function' ? btoa(payload) : Buffer.from(payload).toString('base64');
}

/**
 * Décode et valide rigoureusement la structure d'un curseur de pagination.
 *
 * @param cursor Chaîne base64 opaque représentant le curseur
 * @returns Objet validé { d: string, i: string }
 * @throws {Error} Si le curseur n'est pas une base64 valide, n'est pas du JSON valide ou échoue à la validation du schéma
 */
export function decodeCursor(cursor: string): CursorPayload {
  let raw: string;
  try {
    raw = typeof atob === 'function' ? atob(cursor) : Buffer.from(cursor, 'base64').toString('utf8');
  } catch {
    throw new Error('Invalid cursor: malformed base64');
  }

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new Error('Invalid cursor: malformed JSON');
  }

  const result = CursorPayloadSchema.safeParse(json);
  if (!result.success) {
    throw new Error(`Invalid cursor: ${result.error.message}`);
  }

  return result.data;
}

/**
 * Interprète une date de fin pour le filtrage :
 * - Si le format est "YYYY-MM-DD" (10 caractères), interprète comme la fin de journée
 *   en fuseau Europe/Paris (23:59:59.999 avec décalage dynamique +02:00 été / +01:00 hiver).
 * - Si une heure explicite est fournie, la respecte telle quelle.
 */
export function parseDateToEndOfDay(dateStr: string): number {
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    const tempDate = new Date(`${dateStr}T12:00:00Z`);
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Europe/Paris',
      timeZoneName: 'longOffset',
    }).formatToParts(tempDate);
    const offsetPart = parts.find((p) => p.type === 'timeZoneName')?.value;
    const match = offsetPart?.match(/GMT([+-]\d{2}:\d{2})/);
    const offset = match ? match[1] : '+02:00';
    return new Date(`${dateStr}T23:59:59.999${offset}`).getTime();
  }
  return new Date(dateStr).getTime();
}

export class MockEventsRepository implements EventsRepository {
  private readonly rawEvents: RawEvent[];

  constructor(initialData?: RawEvent[]) {
    this.rawEvents = (initialData ?? (rawEventsData as unknown as RawEvent[]));
  }

  /**
   * Liste les événements selon les critères fournis.
   *
   * @param params Paramètres de filtrage et pagination.
   * @returns Liste paginée d'événements avec curseur pour la page suivante.
   * @throws {Error} Si le curseur fourni est malformé ou invalide ('Invalid cursor...').
   */
  async listEvents(params: EventListParamsInput): Promise<EventListResponse> {
    const parsed = EventListParamsSchema.parse(params);
    // Simuler latence réseau réaliste (200ms)
    await new Promise((resolve) => setTimeout(resolve, 200));

    const lang = parsed.lang;
    const limit = parsed.limit;

    // 1. Résolution des champs multilingues et calcul de la distance
    let resolvedEvents: Event[] = this.rawEvents.map((raw) => {
      const content = resolveEventContent(raw, lang);
      const distance = calculateHaversineDistance(
        LE_BLANC_CENTER.lat,
        LE_BLANC_CENTER.lng,
        raw.latitude,
        raw.longitude,
      );

      return {
        ...raw,
        ...content,
        distance,
      };
    });

    // 2. Filtrage

    // Rayon 20 km appliqué par défaut (SEARCH_RADIUS_METERS), restreint si spécifié par l'utilisateur
    const userDistance = parsed.maxDistance ?? parsed.distance;
    let requestedDist: number = SEARCH_RADIUS_METERS;
    if (userDistance !== undefined) {
      requestedDist = userDistance <= 50 ? userDistance * 1000 : userDistance;
    }
    const maxDist = Math.min(requestedDist, SEARCH_RADIUS_METERS);
    resolvedEvents = resolvedEvents.filter((e) => e.distance <= maxDist);

    if (parsed.categories && parsed.categories.length > 0) {
      const allowed = new Set(parsed.categories);
      resolvedEvents = resolvedEvents.filter((e) => allowed.has(e.category));
    }

    if (parsed.isFree !== undefined) {
      resolvedEvents = resolvedEvents.filter((e) => e.isFree === parsed.isFree);
    }

    const search = parsed.q ? foldText(parsed.q.trim()) : '';
    if (search.length >= 2) {
      resolvedEvents = resolvedEvents.filter((e) => [...Object.values(e.title_i18n), e.city ?? '', e.venueName ?? '']
        .some((text) => typeof text === 'string' && foldText(text).includes(search)));
    }

    if (parsed.from) {
      const fromTime = new Date(parsed.from).getTime();
      resolvedEvents = resolvedEvents.filter((e) => {
        const endTime = e.endDate ? new Date(e.endDate).getTime() : new Date(e.startDate).getTime();
        return endTime >= fromTime;
      });
    }

    if (parsed.to) {
      const toTime = parseDateToEndOfDay(parsed.to);
      resolvedEvents = resolvedEvents.filter((e) => {
        const startTime = new Date(e.startDate).getTime();
        return startTime <= toTime;
      });
    }

    // 3. Tri stable et déterministe : startDate croissante puis id
    resolvedEvents.sort((a, b) => {
      const diff = new Date(a.startDate).getTime() - new Date(b.startDate).getTime();
      if (diff !== 0) return diff;
      return a.id.localeCompare(b.id);
    });

    const total = resolvedEvents.length;

    // 4. Pagination par curseur { d: startDate, i: id }
    if (parsed.cursor) {
      const cursorObj = decodeCursor(parsed.cursor);
      const cursorTime = new Date(cursorObj.d).getTime();
      resolvedEvents = resolvedEvents.filter((e) => {
        const eTime = new Date(e.startDate).getTime();
        if (eTime > cursorTime) return true;
        if (eTime === cursorTime) return e.id > cursorObj.i;
        return false;
      });
    }

    const items = resolvedEvents.slice(0, limit);
    let nextCursor: string | null = null;

    if (resolvedEvents.length > limit) {
      const lastItem = items[items.length - 1];
      if (lastItem) {
        nextCursor = encodeCursor(lastItem.startDate, lastItem.id, new Date().toISOString());
      }
    }

    return {
      items,
      nextCursor,
      total,
      generatedAt: new Date().toISOString(),
    };
  }

  async getEventById(id: string, lang: string): Promise<EventDetail | null> {
    await new Promise((resolve) => setTimeout(resolve, 150));

    const raw = this.rawEvents.find((e) => e.id === id);
    if (!raw) return null;

    const content = resolveEventContent(raw, lang);
    const distance = calculateHaversineDistance(
      LE_BLANC_CENTER.lat,
      LE_BLANC_CENTER.lng,
      raw.latitude,
      raw.longitude,
    );

    return {
      ...raw,
      ...content,
      distance,
      // Le mock ne stocke qu'une programmation par événement : elle reprend ses propres dates.
      occurrences: [
        {
          id: raw.id,
          startDate: raw.startDate,
          endDate: raw.endDate,
          timezone: raw.timezone,
        },
      ],
    };
  }

  async listCategories(): Promise<CategoryCount[]> {
    return Promise.resolve(CATEGORIES.map((key) => ({
      key, count: this.rawEvents.filter((event) => event.category === key).length,
    })));
  }

  async listCities(): Promise<string[]> {
    const cities = new Set<string>();
    for (const e of this.rawEvents) {
      if (e.city) cities.add(e.city);
    }
    return Promise.resolve([...cities].sort());
  }
}

/**
 * Normalise les paramètres pour garantir des clés TanStack Query stables.
 */
export function normalizeEventListParams(params: EventListParamsInput): Record<string, unknown> {
  const normalized: Record<string, unknown> = {
    lang: params.lang,
    limit: params.limit ?? 20,
  };
  if (params.from) normalized.from = params.from;
  if (params.to) normalized.to = params.to;
  if (params.isFree !== undefined) normalized.isFree = params.isFree;
  if (params.q?.trim()) normalized.q = params.q.trim();
  if (params.maxDistance !== undefined) normalized.maxDistance = params.maxDistance;
  if (params.distance !== undefined) normalized.distance = params.distance;
  if (params.cursor) normalized.cursor = params.cursor;
  if (params.categories && params.categories.length > 0) {
    normalized.categories = [...params.categories].sort();
  }
  return normalized;
}
