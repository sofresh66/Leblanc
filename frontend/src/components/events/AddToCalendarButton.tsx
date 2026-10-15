import React, { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { EventDetail, SupportedLanguage } from '@leblanc/shared';
import { googleCalendarUrl } from '../../utils/googleCalendar';
import { calendarOccurrence, downloadIcsFile, generateIcsContent, icsFileName } from '../../utils/ics';

interface AddToCalendarButtonProps {
  event: EventDetail;
  lang: SupportedLanguage;
}

const optionClass = 'btn-secondary min-h-12 px-5 py-3 text-sm inline-flex items-center gap-2 w-full sm:w-auto justify-center';

/**
 * Menu « Ajouter à mon calendrier » : Google Agenda (Android n'ouvre pas un
 * .ics téléchargé) ou fichier .ics (Apple, Outlook). Absent si toutes les
 * séances sont passées ou si la séance retenue dure plus de 14 jours.
 */
export const AddToCalendarButton: React.FC<AddToCalendarButtonProps> = ({ event, lang }) => {
  const { t } = useTranslation('events');
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const occurrence = calendarOccurrence(event);
  if (!occurrence) return null;

  const downloadIcs = () => {
    downloadIcsFile(generateIcsContent(event, occurrence, lang), icsFileName(event.title));
    setOpen(false);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label={t('details.addToCalendarLabel', { title: event.title })}
        aria-expanded={open}
        aria-controls={panelId}
        className={optionClass}
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        {t('details.addToCalendar')}
      </button>

      {open && (
        <div id={panelId} role="group" aria-label={t('details.calendarOptions')} className="order-last flex basis-full flex-wrap items-center gap-3">
          <a
            href={googleCalendarUrl(event, occurrence, lang)}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={t('details.calendarGoogleLabel')}
            onClick={() => setOpen(false)}
            className={optionClass}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
            Google Agenda
          </a>
          <button type="button" onClick={downloadIcs} className={optionClass}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            {t('details.calendarIcs')}
          </button>
        </div>
      )}
    </>
  );
};
