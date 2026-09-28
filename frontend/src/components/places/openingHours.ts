import type { OpeningHoursRule } from '@leblanc/shared';

export interface DaySchedule {
  dayOfWeek: number;
  date: string;
  isToday: boolean;
  slots: Array<{ opens: string; closes: string; overnight: boolean }>;
  indeterminate: boolean;
}

const parisDateFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit',
});

function parisDate(now: Date): string {
  const parts = Object.fromEntries(parisDateFormatter.formatToParts(now).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function appliesOnDate(rule: OpeningHoursRule, date: string, dayOfWeek: number): boolean {
  if (!rule.dayOfWeek.includes(dayOfWeek)) return false;
  if (rule.validFrom && date < rule.validFrom) return false;
  if (rule.validThrough && date > rule.validThrough) return false;
  const parsed = new Date(`${date}T00:00:00Z`);
  const dayOfMonth = parsed.getUTCDate();
  if (rule.weekOfMonth === 0) {
    return new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), dayOfMonth + 7)).getUTCMonth() !== parsed.getUTCMonth();
  }
  return rule.weekOfMonth === null || Math.ceil(dayOfMonth / 7) === rule.weekOfMonth;
}

/** Regroupe les créneaux applicables à chacun des sept jours de la semaine courante à Paris. */
export function groupOpeningHoursByDay(rules: OpeningHoursRule[], now = new Date()): DaySchedule[] {
  const today = parisDate(now);
  const todayDate = new Date(`${today}T00:00:00Z`);
  const currentDay = todayDate.getUTCDay() || 7;
  const monday = new Date(todayDate);
  monday.setUTCDate(monday.getUTCDate() - currentDay + 1);

  return Array.from({ length: 7 }, (_, index) => {
    const dateValue = new Date(monday);
    dateValue.setUTCDate(dateValue.getUTCDate() + index);
    const date = dateValue.toISOString().slice(0, 10);
    const dayOfWeek = index + 1;
    const applicable = rules.filter((rule) => appliesOnDate(rule, date, dayOfWeek));
    const uniqueSlots = new Map<string, DaySchedule['slots'][number]>();
    for (const rule of applicable) {
      if (rule.opens === rule.closes) continue;
      const slot = {
        opens: rule.opens,
        closes: rule.closes,
        overnight: rule.closes < rule.opens,
      };
      uniqueSlots.set(`${rule.opens}-${rule.closes}`, slot);
    }
    return {
      dayOfWeek,
      date,
      isToday: date === today,
      slots: [...uniqueSlots.values()].sort((a, b) => a.opens.localeCompare(b.opens)),
      indeterminate: applicable.some((rule) => rule.opens === rule.closes),
    };
  });
}
