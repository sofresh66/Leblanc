import React from 'react';
import { useTranslation } from 'react-i18next';
import type { EventDetail, SupportedLanguage } from '@leblanc/shared';
import { calendarOccurrence, downloadIcsFile, generateIcsContent, icsFileName } from '../../utils/ics';

interface AddToCalendarButtonProps {
  event: EventDetail;
  lang: SupportedLanguage;
}

/**
 * Télécharge la prochaine séance au format .ics. Absent si toutes les séances
 * sont passées ou si la séance retenue dure plus de 14 jours (marchés annuels).
 */
export const AddToCalendarButton: React.FC<AddToCalendarButtonProps> = ({ event, lang }) => {
  const { t } = useTranslation('events');
  const occurrence = calendarOccurrence(event);
  if (!occurrence) return null;

  return (
    <button
      type="button"
      onClick={() => downloadIcsFile(generateIcsContent(event, occurrence, lang), icsFileName(event.title))}
      aria-label={t('details.addToCalendarLabel', { title: event.title })}
      className="btn-secondary min-h-12 px-5 py-3 text-sm inline-flex items-center gap-2 w-full sm:w-auto justify-center"
    >
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
      {t('details.addToCalendar')}
    </button>
  );
};
