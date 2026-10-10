import { useEffect } from 'react';
import { Marker, Polyline, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import { useTranslation } from 'react-i18next';
import type { SupportedLanguage, TrailGeoItem } from '@leblanc/shared';
import { BaseMap, MarkerClusterGroup } from '../map/BaseMap';
import { formatKm } from './trailFormat';

const OSM_COPYRIGHT_URL = 'https://www.openstreetmap.org/copyright';
// Vue d'ensemble : Le Blanc à l'ouest, le cœur de la Brenne à l'est.
const WALKS_MAP_CENTER: [number, number] = [46.69, 1.17];
const TRACK_COLOR = '#9a3412';

const startIcon = L.divIcon({
  className: 'leaflet-marker-icon custom-trail-marker',
  html: `
    <div style="background-color: #1b4332; width: 26px; height: 26px; border-radius: 50%; display: flex; align-items: center; justify-content: center; border: 2px solid white; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.25);">
      <div style="width: 0; height: 0; border-left: 8px solid white; border-top: 5px solid transparent; border-bottom: 5px solid transparent; margin-left: 2px;"></div>
    </div>
  `,
  iconSize: [26, 26],
  iconAnchor: [13, 13],
  popupAnchor: [0, -13],
});

/** Ajoute l'attribution ODbL des tracés dans le contrôle Leaflet tant que des tracés sont affichés. */
function TrackAttribution({ text }: { text: string }) {
  const map = useMap();
  useEffect(() => {
    const html = `<a href="${OSM_COPYRIGHT_URL}" target="_blank" rel="noopener noreferrer">${text.replace(/[<>&"]/g, '')}</a>`;
    map.attributionControl?.addAttribution(html);
    return () => {
      map.attributionControl?.removeAttribution(html);
    };
  }, [map, text]);
  return null;
}

export interface TrailsMapViewProps {
  items: TrailGeoItem[];
  truncated: boolean;
  lang: SupportedLanguage;
}

/** Carte de « Se balader » : départs regroupés, tracés allégés issus d'OpenStreetMap. */
export default function TrailsMapView({ items, truncated, lang }: TrailsMapViewProps) {
  const { t } = useTranslation('walks');
  const tracked = items.filter((item) => item.track !== null);
  const startsOnly = items.length - tracked.length;

  return (
    <div className="space-y-4">
      {truncated && <p role="status" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{t('map.truncated')}</p>}
      <BaseMap className="h-[70vh] min-h-[360px] lg:h-[640px] w-full shadow-md" center={WALKS_MAP_CENTER} zoom={10} showSearchRadius={false}>
        {tracked.length > 0 && <TrackAttribution text={t('map.osmAttribution')} />}
        {tracked.map((item) => (
          <Polyline
            key={`track-${item.id}`}
            positions={item.track?.coordinates.map((line) => line.map(([lng, lat]) => [lat, lng] as [number, number])) ?? []}
            pathOptions={{ color: TRACK_COLOR, weight: 3, opacity: 0.85 }}
          />
        ))}
        <MarkerClusterGroup>
          {items.map((item) => (
            <Marker key={item.id} position={[item.start.lat, item.start.lng]} icon={startIcon} title={item.title} alt={item.title}>
              <Popup className="custom-leaflet-popup">
                <div className="max-w-xs space-y-2 p-1">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-brenne-900">{item.modes.map((mode) => t(`modes.${mode}`)).join(' · ')}</p>
                  <h3 className="text-sm font-bold leading-snug text-gray-900">{item.title}</h3>
                  {item.distanceM !== null && <p className="text-xs text-gray-700">{t('card.distanceKm', { distance: formatKm(item.distanceM, lang) })}</p>}
                  <p className="text-xs font-semibold text-gray-700">{item.hasTrack ? t('card.trackAvailable') : t('card.trackUnavailable')}</p>
                </div>
              </Popup>
            </Marker>
          ))}
        </MarkerClusterGroup>
      </BaseMap>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-gray-700">
        <span className="inline-flex items-center gap-2"><span aria-hidden="true" className="inline-block h-1 w-6 rounded" style={{ backgroundColor: TRACK_COLOR }} />{t('map.legendTrack')}</span>
        <span className="inline-flex items-center gap-2"><span aria-hidden="true" className="inline-block h-3 w-3 rounded-full bg-brenne-900" />{t('map.legendStart')}</span>
      </div>
      {startsOnly > 0 && <p className="text-sm text-gray-700">{t('map.startsOnly', { count: startsOnly })}</p>}
      {tracked.length > 0 && (
        <p className="text-sm text-gray-700">
          <a href={OSM_COPYRIGHT_URL} target="_blank" rel="noopener noreferrer" className="font-semibold text-creuse-800 underline underline-offset-2 hover:text-creuse-900">
            {t('map.osmAttribution')}
          </a>
        </p>
      )}
    </div>
  );
}
