import { useTranslation } from 'react-i18next';
import type { TrailSummary } from '@leblanc/shared';
import type { TrailFilters } from '../../api/trailsRepository';
import { useInfiniteTrails } from '../../hooks/useTrails';
import { ErrorState } from '../common/ErrorState';
import { TrailCard } from './TrailCard';

export interface TrailListProps {
  filters: TrailFilters;
  onResetFilters: () => void;
}

/** Liste dans l'ordre de l'API (tracés d'abord), sans tri côté client. */
export function TrailList({ filters, onResetFilters }: TrailListProps) {
  const { t } = useTranslation(['walks', 'common']);
  const query = useInfiniteTrails(filters);
  const trails: TrailSummary[] = query.data?.pages.flatMap((page) => page.items) ?? [];

  // Curseur expiré : la première page se recharge d'elle-même, sans message d'erreur.
  if ((query.isLoading || query.cursorExpired) && trails.length === 0) {
    return (
      <div role="status" aria-busy="true" aria-label={t('common:actions.loading')} className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }, (_, index) => (
          <div key={index} className="animate-pulse overflow-hidden rounded-xl bg-white shadow-md">
            <div className="aspect-[16/10] bg-brenne-100" />
            <div className="space-y-4 p-5"><div className="h-4 w-1/2 rounded bg-gray-200" /><div className="h-6 w-4/5 rounded bg-gray-200" /></div>
          </div>
        ))}
      </div>
    );
  }

  if (query.isError && !query.cursorExpired && trails.length === 0) {
    return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  }

  if (trails.length === 0) {
    return (
      <div className="mx-auto max-w-xl rounded-2xl border border-brenne-900/5 bg-white px-6 py-16 text-center shadow-md">
        <h2 className="font-display text-[28px] font-bold text-brenne-950">{t('walks:list.empty')}</h2>
        <p className="mb-7 mt-3 text-gray-700">{t('walks:list.emptyDescription')}</p>
        <button type="button" onClick={onResetFilters} className="btn-secondary min-h-11">{t('walks:filters.reset')}</button>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <ul className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-3" aria-label={t('walks:list.results')}>
        {trails.map((trail, index) => (
          <li key={trail.id} className="min-w-0">
            <TrailCard trail={trail} priority={index === 0 ? 'high' : index < 3 ? 'eager' : 'lazy'} />
          </li>
        ))}
      </ul>
      {query.isFetchNextPageError && !query.cursorExpired ? (
        <ErrorState error={query.error} onRetry={() => void query.fetchNextPage()} />
      ) : query.hasNextPage ? (
        <div className="flex justify-center pt-2">
          <button type="button" onClick={() => void query.fetchNextPage()} disabled={query.isFetchingNextPage} className="btn-primary min-h-12 px-8" aria-busy={query.isFetchingNextPage}>
            {query.isFetchingNextPage ? t('common:actions.loading') : t('walks:list.loadMore')}
          </button>
        </div>
      ) : (
        <p className="text-center text-sm text-gray-600">{t('walks:list.end')}</p>
      )}
    </div>
  );
}
