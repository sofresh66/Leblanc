import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { OpeningHoursRule, PlaceApi } from '@leblanc/shared';
import { useLocalizedDate } from '../../hooks/useLocalizedDate';
import { DEFAULT_LANGUAGE, isSupportedLanguage, LANGUAGES_META } from '../../i18n/languages';
import { groupOpeningHoursByDay } from './openingHours';

interface OpeningHoursTableProps {
  rules: OpeningHoursRule[];
  status: PlaceApi['openingHoursStatus'];
}

export function OpeningHoursTable({ rules, status }: OpeningHoursTableProps) {
  const { t, i18n } = useTranslation('places');
  const { formatDate } = useLocalizedDate();
  const lang = isSupportedLanguage(i18n.language) ? i18n.language : DEFAULT_LANGUAGE;
  const locale = LANGUAGES_META[lang].locale;
  const days = useMemo(() => groupOpeningHoursByDay(rules), [rules]);
  const timeFormatter = useMemo(() => new Intl.DateTimeFormat(locale, {
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'UTC',
  }), [locale]);
  const formatTime = (value: string) => timeFormatter.format(new Date(`2000-01-01T${value}Z`));

  if (rules.length === 0 || status === 'unknown') {
    return <p className="rounded-xl bg-sable-100 px-5 py-4 text-sm text-gray-700">{t('detail.hours.unknown')}</p>;
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600">{t('detail.hours.currentWeek')}</p>
      {status === 'partial' && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">{t('detail.hours.partialNotice')}</p>
      )}
      <div className="overflow-x-auto rounded-xl border border-brenne-900/10">
        <table className="w-full min-w-[290px] border-collapse text-left text-sm">
          <caption className="sr-only">{t('detail.sections.hours')}</caption>
          <thead className="bg-brenne-50 text-brenne-950">
            <tr><th scope="col" className="px-4 py-3 font-semibold">{t('detail.hours.day')}</th><th scope="col" className="px-4 py-3 font-semibold">{t('detail.hours.times')}</th></tr>
          </thead>
          <tbody>
            {days.map((day) => {
              const dayLabel = formatDate(new Date(`${day.date}T12:00:00Z`), { dateStyle: undefined, weekday: 'long', timeZone: 'UTC' });
              const unknown = day.indeterminate || (status === 'partial' && day.slots.length === 0);
              return (
                <tr key={day.date} data-testid={`hours-day-${day.dayOfWeek}`} className={`border-t border-brenne-900/10 ${day.isToday ? 'bg-brenne-50/70' : 'bg-white'}`}>
                  <th scope="row" className="px-4 py-3 font-semibold capitalize text-brenne-950">
                    {dayLabel}{day.isToday && <span className="ml-2 whitespace-nowrap text-xs font-medium text-brenne-700">({t('detail.hours.today')})</span>}
                  </th>
                  <td className="px-4 py-3 text-gray-700">
                    {day.slots.length ? (
                      <ul className="space-y-1">
                        {day.slots.map((slot) => (
                          <li key={`${slot.opens}-${slot.closes}`}>
                            {formatTime(slot.opens)}–{formatTime(slot.closes)}
                            {slot.overnight && <span className="ml-1 text-xs text-gray-500">{t('detail.hours.nextDay')}</span>}
                          </li>
                        ))}
                      </ul>
                    ) : unknown ? t('detail.hours.unknown') : day.isToday ? t('detail.hours.closedToday') : t('detail.hours.closed')}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
