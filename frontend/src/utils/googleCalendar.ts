import type { SupportedLanguage } from '@leblanc/shared';
import { canonicalEventUrl } from './canonicalUrl';
import { formatFullAddress } from './eventLocation';
import { calendarDates, calendarExcerpt, type CalendarEvent, type CalendarOccurrence } from './ics';

const GOOGLE_CALENDAR_RENDER = 'https://calendar.google.com/calendar/render';
/** Longueur maximale du lien : au-delà, certains navigateurs mobiles et Google le tronquent. */
export const GOOGLE_URL_MAX_LENGTH = 1800;
const DESCRIPTION_EXCERPT = 200;
const TITLE_MAX = 150;

function buildUrl(params: Array<[string, string]>): string {
  return `${GOOGLE_CALENDAR_RENDER}?${params.map(([key, value]) => `${key}=${encodeURIComponent(value)}`).join('&')}`;
}

/**
 * Lien « ajouter à Google Agenda » pour la même séance et les mêmes dates que
 * le fichier .ics. La description, puis le titre, sont raccourcis tant que le
 * lien dépasse GOOGLE_URL_MAX_LENGTH ; l'URL canonique est toujours conservée.
 */
export function googleCalendarUrl(
  event: CalendarEvent,
  occurrence: CalendarOccurrence,
  lang: SupportedLanguage,
): string {
  const { start, end } = calendarDates(occurrence);
  const pageUrl = canonicalEventUrl(event.id, lang);
  const location = formatFullAddress(event);
  const build = (descriptionLength: number, titleLength: number) => {
    const summary = descriptionLength > 0 ? calendarExcerpt(event.description, descriptionLength) : '';
    return buildUrl([
      ['action', 'TEMPLATE'],
      ['text', calendarExcerpt(event.title, titleLength)],
      ['dates', `${start}/${end}`],
      ['details', summary ? `${summary}\n\n${pageUrl}` : pageUrl],
      ...(location ? [['location', calendarExcerpt(location, TITLE_MAX)] as [string, string]] : []),
    ]);
  };

  let descriptionLength = DESCRIPTION_EXCERPT;
  let titleLength = TITLE_MAX;
  let url = build(descriptionLength, titleLength);
  while (url.length > GOOGLE_URL_MAX_LENGTH && (descriptionLength > 0 || titleLength > 20)) {
    if (descriptionLength > 0) descriptionLength = Math.max(0, descriptionLength - 20);
    else titleLength -= 10;
    url = build(descriptionLength, titleLength);
  }
  return url;
}
