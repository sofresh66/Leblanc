import type { Event } from '@leblanc/shared';
import { formatFullAddress } from './eventLocation';

function formatDateToIcsUtc(isoString: string): string {
  const d = new Date(isoString);
  return d
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');
}

/**
 * Génère le contenu au format iCalendar (.ics) pour un événement.
 */
export function generateIcsContent(event: Event): string {
  const dtStamp = formatDateToIcsUtc(new Date().toISOString());
  const dtStart = formatDateToIcsUtc(event.startDate);

  // Si pas de date de fin, prévoir 2 heures par défaut
  const dtEnd = event.endDate
    ? formatDateToIcsUtc(event.endDate)
    : formatDateToIcsUtc(new Date(new Date(event.startDate).getTime() + 2 * 3600 * 1000).toISOString());

  // L'adresse peut être partiellement nulle : le champ LOCATION est alors réduit
  // (lieu seul) ou omis entièrement plutôt que rempli de valeurs inventées.
  const location = formatFullAddress(event);
  const cleanSummary = event.title.replace(/\n/g, ' ').trim();
  const cleanDescription = event.description.replace(/\n/g, '\\n').trim();

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Le Blanc et Moi//FR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${event.id}@leblanc-et-moi.fr`,
    `DTSTAMP:${dtStamp}`,
    `DTSTART:${dtStart}`,
    `DTEND:${dtEnd}`,
    `SUMMARY:${cleanSummary}`,
    `DESCRIPTION:${cleanDescription}`,
    ...(location ? [`LOCATION:${location}`] : []),
    ...(event.publicUrl ? [`URL:${event.publicUrl}`] : []),
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
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
