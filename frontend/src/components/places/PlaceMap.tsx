import { Suspense, lazy } from 'react';
import { useTranslation } from 'react-i18next';

const PlaceMapLeaflet = lazy(() => import('./PlaceMapLeaflet'));

export function hasValidPlaceCoordinates(latitude: number | null, longitude: number | null): boolean {
  return latitude !== null && longitude !== null
    && Number.isFinite(latitude) && Number.isFinite(longitude)
    && latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180
    && !(latitude === 0 && longitude === 0);
}

export function googleMapsDirectionsUrl(latitude: number, longitude: number): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}`;
}

interface PlaceMapProps {
  latitude: number | null;
  longitude: number | null;
  title: string;
}

export function PlaceMap({ latitude, longitude, title }: PlaceMapProps) {
  const { t } = useTranslation('places');
  if (!hasValidPlaceCoordinates(latitude, longitude)) return null;
  if (latitude === null || longitude === null) return null;
  return (
    <div className="space-y-3">
      <Suspense fallback={<div role="status" aria-busy="true" className="h-64 w-full animate-pulse rounded-xl bg-brenne-100 sm:h-80">{t('detail.mapLoading')}</div>}>
        <PlaceMapLeaflet latitude={latitude} longitude={longitude} title={title} />
      </Suspense>
      <a href={googleMapsDirectionsUrl(latitude, longitude)} target="_blank" rel="noopener noreferrer" className="btn-secondary min-h-11 w-full sm:w-auto">
        {t('detail.actions.openInMaps')}
      </a>
    </div>
  );
}
