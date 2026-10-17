import type { Event, EventOccurrence, SupportedLanguage } from '@leblanc/shared';
import { canonicalEventUrl, CANONICAL_SITE_URL } from './canonicalUrl';
import { calendarDay, occurrenceStatus } from './eventDates';
import { formatFullAddress } from './eventLocation';

const DEFAULT_TIMEZONE = 'Europe/Paris';
const DAY_MS = 24 * 3600 * 1000;
/** Au-delà, l'événement est une période (marché annuel, exposition) : pas d'export. */
export const MAX_CALENDAR_DAYS = 14;
/** Durée retenue quand la source ne donne pas d'heure de fin. */
const DEFAULT_DURATION_MS = 2 * 3600 * 1000;
const DESCRIPTION_EXCERPT = 200;
const FILE_NAME_MAX = 60;
/** Délai avant libération du Blob : Safari iOS lit l'URL après la confirmation du téléchargement. */
const REVOKE_DELAY_MS = 60_000;

export type CalendarOccurrence = Pick<EventOccurrence, 'startDate' | 'endDate' | 'timezone' | 'allDay'>;
export type CalendarEvent = Pick<Event, 'id' | 'title' | 'description' | 'venueName' | 'address' | 'postalCode' | 'city' | 'latitude' | 'longitude'>;

function formatDateToIcsUtc(date: Date): string {
  return date
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');
}

/** Date seule AAAAMMJJ dans le fuseau de l'événement (DTSTART;VALUE=DATE). */
function formatIcsDate(isoString: string, timeZone: string, addDays = 0): string {
  const [year, month, day] = calendarDay(new Date(isoString), timeZone).split('-').map(Number);
  const date = new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, (day ?? 1) + addDays));
  return date.toISOString().slice(0, 10).replace(/-/g, '');
}

function timeOfDay(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone, hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).format(date);
}

/**
 * Séance à exporter : la première en cours ou à venir. `null` (bouton masqué)
 * si toutes sont passées ou si elle dure plus de MAX_CALENDAR_DAYS jours.
 */
export function calendarOccurrence(
  event: CalendarOccurrence & { occurrences?: CalendarOccurrence[] },
  now: Date = new Date(),
): CalendarOccurrence | null {
  const occurrences = event.occurrences && event.occurrences.length > 0 ? event.occurrences : [event];
  const next = [...occurrences]
    .sort((a, b) => Date.parse(a.startDate) - Date.parse(b.startDate))
    .find((occurrence) => occurrenceStatus(occurrence, now) !== 'past');
  if (!next) return null;
  return occurrenceDays(next) > MAX_CALENDAR_DAYS ? null : next;
}

/**
 * Durée en jours : jours calendaires inclus pour une journée entière (le passage
 * à l'heure d'hiver ne compte pas), durée réelle sinon.
 */
function occurrenceDays(occurrence: CalendarOccurrence): number {
  const end = occurrence.endDate ?? occurrence.startDate;
  if (occurrence.allDay) {
    const timeZone = occurrence.timezone || DEFAULT_TIMEZONE;
    const day = (iso: string) => Date.parse(calendarDay(new Date(iso), timeZone));
    return (day(end) - day(occurrence.startDate)) / DAY_MS + 1;
  }
  return (Date.parse(end) - Date.parse(occurrence.startDate)) / DAY_MS;
}

/**
 * Fin connue de la séance horodatée. L'ingestion enregistre 23:59:59 (heure de
 * l'événement) le jour même quand la source ne donne pas d'heure de fin : ce
 * marqueur vaut « pas d'heure de fin », comme une fin absente.
 */
function knownEnd(occurrence: CalendarOccurrence, timeZone: string): Date | null {
  if (!occurrence.endDate) return null;
  const start = new Date(occurrence.startDate);
  const end = new Date(occurrence.endDate);
  const sameDay = calendarDay(start, timeZone) === calendarDay(end, timeZone);
  return sameDay && timeOfDay(end, timeZone) === '23:59:59' ? null : end;
}

/** Échappement des valeurs texte (RFC 5545 §3.3.11). */
export function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n');
}

/**
 * Replie une ligne à 75 octets UTF-8 (RFC 5545 §3.1) : CRLF suivi d'une espace.
 * Ni un caractère multi-octets ni une séquence d'échappement (« \n », « \, »)
 * ne sont coupés : certains lecteurs d'agenda gèrent mal ce cas.
 */
export function foldIcsLine(line: string): string {
  const encoder = new TextEncoder();
  const parts: string[] = [];
  let current = '';
  let currentBytes = 0;
  for (const char of line.match(/\\.|[\s\S]/gu) ?? []) {
    const bytes = encoder.encode(char).length;
    // Les lignes de continuation commencent par une espace, qui compte dans les 75 octets.
    const limit = parts.length === 0 ? 75 : 74;
    if (currentBytes + bytes > limit) {
      parts.push(current);
      current = '';
      currentBytes = 0;
    }
    current += char;
    currentBytes += bytes;
  }
  parts.push(current);
  return parts.join('\r\n ');
}

/** Début du texte (sur une ligne), coupé sur un mot, suivi de « … ». */
export function calendarExcerpt(text: string, maxLength: number = DESCRIPTION_EXCERPT): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  if (flat.length <= maxLength) return flat;
  const cut = flat.slice(0, maxLength);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > maxLength / 2 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

export interface CalendarDates {
  allDay: boolean;
  /** AAAAMMJJ (journée entière) ou AAAAMMJJTHHMMSSZ (UTC). */
  start: string;
  /** Fin exclusive : lendemain du dernier jour, ou heure de fin (début + 2 h si inconnue). */
  end: string;
}

/** Dates d'une séance, communes au fichier .ics et au lien Google Agenda. */
export function calendarDates(occurrence: CalendarOccurrence): CalendarDates {
  const timeZone = occurrence.timezone || DEFAULT_TIMEZONE;
  // Journée entière : dates seules, fin exclusive au lendemain du dernier jour.
  if (occurrence.allDay) {
    return {
      allDay: true,
      start: formatIcsDate(occurrence.startDate, timeZone),
      end: formatIcsDate(occurrence.endDate ?? occurrence.startDate, timeZone, 1),
    };
  }
  const start = new Date(occurrence.startDate);
  return {
    allDay: false,
    start: formatDateToIcsUtc(start),
    end: formatDateToIcsUtc(knownEnd(occurrence, timeZone) ?? new Date(start.getTime() + DEFAULT_DURATION_MS)),
  };
}

function hasCoordinates(event: CalendarEvent): boolean {
  return Number.isFinite(event.latitude) && Number.isFinite(event.longitude)
    && !(event.latitude === 0 && event.longitude === 0);
}

/**
 * Génère le contenu iCalendar (.ics) d'une séance. Heures en UTC (« Z ») :
 * les dates de l'API sont des instants exacts, sans règle de répétition.
 */
export function generateIcsContent(
  event: CalendarEvent,
  occurrence: CalendarOccurrence,
  lang: SupportedLanguage,
  now: Date = new Date(),
): string {
  const timeZone = occurrence.timezone || DEFAULT_TIMEZONE;
  const { allDay, start, end } = calendarDates(occurrence);
  const dates = allDay
    ? [`DTSTART;VALUE=DATE:${start}`, `DTEND;VALUE=DATE:${end}`]
    : [`DTSTART:${start}`, `DTEND:${end}`];

  const url = canonicalEventUrl(event.id, lang);
  const summary = calendarExcerpt(event.description);
  const location = formatFullAddress(event);
  const uidDomain = new URL(CANONICAL_SITE_URL).host;

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Le Blanc et Moi//leblanc-et-moi.fr//FR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    // Stable d'un téléchargement à l'autre : un nouvel import met à jour la séance.
    `UID:${event.id}-${formatIcsDate(occurrence.startDate, timeZone)}@${uidDomain}`,
    `DTSTAMP:${formatDateToIcsUtc(now)}`,
    ...dates,
    `SUMMARY:${escapeIcsText(event.title.replace(/\s*[\r\n]\s*/g, ' ').trim())}`,
    `DESCRIPTION:${escapeIcsText(summary ? `${summary}\n\n${url}` : url)}`,
    ...(location ? [`LOCATION:${escapeIcsText(location)}`] : []),
    ...(hasCoordinates(event) ? [`GEO:${event.latitude};${event.longitude}`] : []),
    `URL:${url}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return `${lines.map(foldIcsLine).join('\r\n')}\r\n`;
}

/** Nom de fichier ASCII tiré du titre : « Ciné-débat Alimenterre » → « cine-debat-alimenterre.ics ». */
export function icsFileName(title: string): string {
  const slug = title
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/œ/gi, 'oe')
    .replace(/æ/gi, 'ae')
    .replace(/ß/g, 'ss')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .slice(0, FILE_NAME_MAX)
    .replace(/^-+|-+$/g, '');
  return `${slug || 'evenement'}.ics`;
}

/**
 * Déclenche le téléchargement dans le navigateur : Blob + lien `download`,
 * sans appel réseau (aucun fetch, la CSP connect-src n'est pas sollicitée).
 */
export function downloadIcsFile(content: string, fileName: string): void {
  const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), REVOKE_DELAY_MS);
}
