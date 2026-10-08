import { Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { PlaceApi } from '@leblanc/shared';
import { BaseMap, MarkerClusterGroup } from '../map/BaseMap';
import { buildLocalizedPath } from '../../routes/routeMapping';
import type { SupportedLanguage } from '../../i18n/languages';
import { hasValidPlaceCoordinates } from './PlaceMap';

const placeIcon = L.divIcon({
  className: 'leaflet-marker-icon custom-place-marker',
  html: `
    <div style="background-color: #9a3412; width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; border: 2px solid white; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.2);">
      <div style="width: 9px; height: 9px; background-color: white; border-radius: 50%;"></div>
    </div>
  `,
  iconSize: [28, 28],
  iconAnchor: [14, 14],
  popupAnchor: [0, -14],
});

export interface PlacesMapViewProps {
  places: PlaceApi[];
  lang: SupportedLanguage;
}

/** Vue carte de « Où manger » ; les lieux sans coordonnées sont listés sous la carte. */
export default function PlacesMapView({ places, lang }: PlacesMapViewProps) {
  const { t } = useTranslation('places');
  const located = places.filter((place) => hasValidPlaceCoordinates(place.latitude, place.longitude));
  const unlocated = places.filter((place) => !hasValidPlaceCoordinates(place.latitude, place.longitude));

  return (
    <div className="space-y-6">
      <BaseMap className="h-[70vh] min-h-[360px] lg:h-[640px] w-full shadow-md">
        <MarkerClusterGroup>
          {located.map((place) => (
            <Marker key={place.id} position={[place.latitude ?? 0, place.longitude ?? 0]} icon={placeIcon} title={place.title} alt={place.title}>
              <Popup className="custom-leaflet-popup">
                <div className="p-1 max-w-xs space-y-2">
                  <span className="inline-block text-[11px] font-bold px-2 py-0.5 rounded-full bg-sable-100 text-brenne-900 uppercase tracking-wide">
                    {t(`types.${place.type}`)}
                  </span>
                  <h4 className="font-bold text-sm text-gray-900 leading-snug">{place.title}</h4>
                  {place.city && <p className="text-xs text-gray-600">{place.city}</p>}
                  <div className="pt-2 border-t border-gray-100 text-right">
                    <Link to={buildLocalizedPath('places', lang, place.id)} className="text-xs font-bold text-brenne-700 hover:text-brenne-900 underline">
                      {t('common:actions.view')}
                    </Link>
                  </div>
                </div>
              </Popup>
            </Marker>
          ))}
        </MarkerClusterGroup>
      </BaseMap>
      {unlocated.length > 0 && (
        <section className="rounded-2xl bg-white p-6 shadow-md space-y-3">
          <h2 className="text-sm font-semibold text-gray-700">{t('map.noLocation', { count: unlocated.length })}</h2>
          <ul className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
            {unlocated.map((place) => (
              <li key={place.id}>
                <Link to={buildLocalizedPath('places', lang, place.id)} className="font-semibold text-creuse-800 underline-offset-2 hover:underline">
                  {place.title}{place.city ? ` (${place.city})` : ''}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
