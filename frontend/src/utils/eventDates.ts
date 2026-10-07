import type { Event } from '@leblanc/shared';

const DEFAULT_TIMEZONE = 'Europe/Paris';

/** Jour calendaire (AAAA-MM-JJ) dans le fuseau de l'événement, pas celui du navigateur. */
export function calendarDay(date: Date, timeZone = DEFAULT_TIMEZONE): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

export interface EventDateLabels {
  /** « Toute la journée » */
  allDay: string;
  /** « Jusqu'au {{date}} » */
  until: (date: string) => string;
}

/**
 * Libellé de date d'un événement :
 * - en cours sur plusieurs jours (commencé, pas fini) : « Jusqu'au … » ;
 * - un seul jour : date et heure, ou « Toute la journée » sans heure source ;
 * - plusieurs jours : « début - fin ».
 */
export function formatEventDate(
  event: Pick<Event, 'startDate' | 'endDate' | 'timezone' | 'allDay'>,
  locale: string,
  style: 'short' | 'long',
  labels: EventDateLabels,
  now: Date = new Date(),
): string {
  const timeZone = event.timezone || DEFAULT_TIMEZONE;
  const start = new Date(event.startDate);
  const end = event.endDate ? new Date(event.endDate) : null;
  const dateFormatter = new Intl.DateTimeFormat(locale, style === 'short'
    ? { weekday: 'short', day: 'numeric', month: 'short', timeZone }
    : { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone });
  const timeFormatter = new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit', timeZone });
  const sameDay = !end || calendarDay(start, timeZone) === calendarDay(end, timeZone);

  if (!sameDay && end && start < now && end >= now) return labels.until(dateFormatter.format(end));
  if (sameDay) {
    return `${dateFormatter.format(start)} • ${event.allDay ? labels.allDay : timeFormatter.format(start)}`;
  }
  return `${dateFormatter.format(start)} - ${dateFormatter.format(end ?? start)}`;
}
