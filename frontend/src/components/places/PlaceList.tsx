import { useTranslation } from 'react-i18next';
import type { PlaceApi } from '@leblanc/shared';
import type { PlaceListParamsInput } from '../../api/placesRepository';
import { useInfinitePlaces } from '../../hooks/usePlaces';
import { ErrorState } from '../common/ErrorState';
import { PlaceCard } from './PlaceCard';

export interface PlaceListProps {
  filters: Omit<PlaceListParamsInput, 'cursor'>;
  onResetFilters: () => void;
}

export function PlaceList({ filters, onResetFilters }: PlaceListProps) {
  const { t } = useTranslation(['places', 'common']);
  const query = useInfinitePlaces(filters);
  const places: PlaceApi[] = query.data?.pages.flatMap((page) => page.items) ?? [];

  if (query.isLoading && places.length === 0) {
    return (
      <div role="status" aria-busy="true" aria-label={t('common:actions.loading')} className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }, (_, index) => (
          <div key={index} className="animate-pulse overflow-hidden rounded-xl bg-white shadow-md">
            <div className="aspect-[4/3] bg-brenne-100" />
            <div className="space-y-4 p-5"><div className="h-4 w-1/2 rounded bg-gray-200" /><div className="h-6 w-4/5 rounded bg-gray-200" /><div className="h-4 w-3/5 rounded bg-gray-200" /></div>
          </div>
        ))}
      </div>
    );
  }

  if (query.isError && places.length === 0) {
    return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  }

  if (places.length === 0) {
    return (
      <div className="mx-auto max-w-xl rounded-2xl border border-brenne-900/5 bg-white px-6 py-16 text-center shadow-md">
        <div aria-hidden="true" className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-brenne-50 text-3xl text-brenne-800">⌕</div>
        <h2 className="font-display text-[28px] font-bold text-brenne-950">{t('places:list.empty')}</h2>
        <p className="mb-7 mt-3 text-gray-600">{t('places:list.emptyDescription')}</p>
        <button type="button" onClick={onResetFilters} className="btn-secondary min-h-11">{t('places:filters.reset')}</button>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-3">
        {places.map((place) => <PlaceCard key={place.id} place={place} />)}
      </div>
      {query.isFetchNextPageError ? (
        <ErrorState error={query.error} onRetry={() => void query.fetchNextPage()} />
      ) : query.hasNextPage ? (
        <div className="flex justify-center pt-2">
          <button type="button" onClick={() => void query.fetchNextPage()} disabled={query.isFetchingNextPage} className="btn-primary min-h-12 px-8" aria-busy={query.isFetchingNextPage}>
            {query.isFetchingNextPage ? t('common:actions.loading') : t('places:list.loadMore')}
          </button>
        </div>
      ) : (
        <p className="text-center text-sm text-gray-500">{t('places:list.end')}</p>
      )}
    </div>
  );
}
