import type { Event } from '@leblanc/shared';
import { calendarDay } from './eventDates';
import { formatFullAddress } from './eventLocation';
import { officialWebsite } from './officialWebsite';

function formatDateToIcsUtc(isoString: string): string {
  const d = new Date(isoString);
  return d
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

/** Échappement des valeurs texte (RFC 5545 §3.3.11). */
export function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

/**
 * Replie une ligne à 75 octets UTF-8 (RFC 5545 §3.1) : CRLF suivi d'une espace.
 * Un caractère multi-octets n'est jamais coupé.
 */
export function foldIcsLine(line: string): string {
  const encoder = new TextEncoder();
  const parts: string[] = [];
  let current = '';
  let currentBytes = 0;
  for (const char of line) {
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

/**
 * Génère le contenu au format iCalendar (.ics) pour un événement.
 */
export function generateIcsContent(event: Event): string {
  const timeZone = event.timezone || 'Europe/Paris';
  const dtStamp = formatDateToIcsUtc(new Date().toISOString());

  // Journée entière : dates seules, fin exclusive au lendemain du dernier jour.
  const dates = event.allDay
    ? [
      `DTSTART;VALUE=DATE:${formatIcsDate(event.startDate, timeZone)}`,
      `DTEND;VALUE=DATE:${formatIcsDate(event.endDate ?? event.startDate, timeZone, 1)}`,
    ]
    : [
      `DTSTART:${formatDateToIcsUtc(event.startDate)}`,
      // Si pas de date de fin, prévoir 2 heures par défaut
      `DTEND:${event.endDate
        ? formatDateToIcsUtc(event.endDate)
        : formatDateToIcsUtc(new Date(new Date(event.startDate).getTime() + 2 * 3600 * 1000).toISOString())}`,
    ];

  // L'adresse peut être partiellement nulle : le champ LOCATION est alors réduit
  // (lieu seul) ou omis entièrement plutôt que rempli de valeurs inventées.
  const location = formatFullAddress(event);
  const website = officialWebsite(event.publicUrl);

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Le Blanc et Moi//FR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${event.id}@leblanc-et-moi.fr`,
    `DTSTAMP:${dtStamp}`,
    ...dates,
    `SUMMARY:${escapeIcsText(event.title.replace(/\n/g, ' ').trim())}`,
    `DESCRIPTION:${escapeIcsText(event.description.trim())}`,
    ...(location ? [`LOCATION:${escapeIcsText(location)}`] : []),
    ...(website ? [`URL:${website}`] : []),
    'END:VEVENT',
    'END:VCALENDAR',
  ].map(foldIcsLine).join('\r\n');
}

/**
 * Déclenche le téléchargement du fichier .ics dans le navigateur client.
 */
export function downloadIcsFile(event: Event): void {
  const icsContent = generateIcsContent(event);
  const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `evenement-${event.id.slice(0, 8)}.ics`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
