import type { TFunction } from 'i18next';
import type { TrailSummary } from '@leblanc/shared';

type WalksT = TFunction<'walks'>;

export function formatKm(meters: number, lang: string): string {
  return new Intl.NumberFormat(lang, { maximumFractionDigits: 1 }).format(meters / 1000);
}

/**
 * Durée annoncée par la source : minutes si connues, sinon jours (itinérances).
 * Rien n'est estimé à partir de la distance.
 */
export function formatTrailDuration(
  trail: Pick<TrailSummary, 'durationMin' | 'durationDays'>,
  t: WalksT,
  lang: string,
): string | null {
  if (trail.durationMin !== null) {
    const hours = Math.floor(trail.durationMin / 60);
    const minutes = trail.durationMin % 60;
    if (hours === 0) return t('card.minutes', { minutes });
    return minutes === 0
      ? t('card.hours', { hours })
      : t('card.hoursMinutes', { hours, minutes: String(minutes).padStart(2, '0') });
  }
  if (trail.durationDays !== null) {
    if (trail.durationDays === 0.5) return t('card.halfDay');
    // Pluriel selon le nombre, affichage localisé (1,5 jour en français).
    return t('card.days', {
      count: trail.durationDays,
      days: new Intl.NumberFormat(lang, { maximumFractionDigits: 1 }).format(trail.durationDays),
    });
  }
  return null;
}

/** Boucle : « Boucle », aller simple : « Aller simple », inconnu : rien. */
export function loopLabel(isLoop: boolean | null, t: WalksT): string | null {
  if (isLoop === null) return null;
  return isLoop ? t('card.loop') : t('card.oneWay');
}
