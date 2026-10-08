import React, { useEffect } from 'react';
import { Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { EventGeoPoint } from '@leblanc/shared';
import { DEFAULT_LANGUAGE, isSupportedLanguage, type SupportedLanguage } from '../../i18n/languages';
import { buildLocalizedPath } from '../../routes/routeMapping';
import { formatEventDate } from '../../utils/eventDates';
import { BaseMap, DECLUSTER_ZOOM, MarkerClusterGroup } from './BaseMap';

const CATEGORY_COLORS: Record<string, string> = {
  culture: '#2d6a4f',
  sport: '#059669',
  fete: '#d97706',
  association: '#4f46e5',
  autre: '#4b5563',
};

// Une icône par catégorie, créée une seule fois (pas à chaque rendu).
const iconCache = new Map<string, L.DivIcon>();
export function eventMarkerIcon(category: string): L.DivIcon {
  const cached = iconCache.get(category);
  if (cached) return cached;
  const color = CATEGORY_COLORS[category] ?? '#2d6a4f';
  const icon = L.divIcon({
    className: 'leaflet-marker-icon custom-event-marker',
    html: `
      <div style="background-color: ${color}; width: 30px; height: 30px; border-radius: 50% 50% 50% 0; transform: rotate(-45deg); display: flex; align-items: center; justify-content: center; border: 2px solid white; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.2);">
        <div style="transform: rotate(45deg); width: 10px; height: 10px; background-color: white; border-radius: 50%;"></div>
      </div>
    `,
    iconSize: [30, 30],
    iconAnchor: [15, 30],
    popupAnchor: [0, -30],
  });
  iconCache.set(category, icon);
  return icon;
}

const MapController: React.FC<{ points: EventGeoPoint[]; selectedEventId?: string | undefined }> = ({ points, selectedEventId }) => {
  const map = useMap();
  useEffect(() => {
    const selected = selectedEventId ? points.find((point) => point.id === selectedEventId) : undefined;
    if (selected) {
      // Au zoom de dégroupement, le marqueur sélectionné est visible hors de son groupe.
      map.setView([selected.lat, selected.lng], DECLUSTER_ZOOM, { animate: !window.matchMedia('(prefers-reduced-motion: reduce)').matches });
    }
  }, [selectedEventId, points, map]);
  return null;
};

export interface EventMapProps {
  points: EventGeoPoint[];
  selectedEventId?: string | undefined;
  onSelectEvent?: ((id: string) => void) | undefined;
  className?: string | undefined;
}

export const EventMap: React.FC<EventMapProps> = ({ points, selectedEventId, onSelectEvent, className }) => {
  const { t, i18n } = useTranslation(['events', 'common']);
  const currentLang = (isSupportedLanguage(i18n.language) ? i18n.language : DEFAULT_LANGUAGE) as SupportedLanguage;
  const dateLabels = {
    allDay: t('dates.allDay', { ns: 'events' }),
    until: (date: string) => t('dates.until', { ns: 'events', date }),
  };

  return (
    <BaseMap {...(className ? { className } : {})}>
      <MarkerClusterGroup>
        {points.map((point) => (
          <Marker
            key={point.id}
            alt={point.title}
            title={point.title}
            position={[point.lat, point.lng]}
            icon={eventMarkerIcon(point.category)}
            eventHandlers={{ click: () => onSelectEvent?.(point.id) }}
          >
            <Popup className="custom-leaflet-popup">
              <div className="p-1 max-w-xs space-y-2">
                <span className="inline-block text-[11px] font-bold px-2 py-0.5 rounded-full bg-brenne-100 text-brenne-800 uppercase tracking-wide">
                  {t(`categories.${point.category}`, { ns: 'events' })}
                </span>
                <h4 className="font-bold text-sm text-gray-900 leading-snug line-clamp-2">{point.title}</h4>
                <p className="text-xs font-semibold text-brenne-800">{formatEventDate(point, currentLang, 'short', dateLabels)}</p>
                {point.city && <p className="text-xs text-gray-600 truncate">{point.city}</p>}
                <div className="pt-2 border-t border-gray-100 text-right">
                  <Link to={buildLocalizedPath('events', currentLang, point.id)} className="text-xs font-bold text-brenne-700 hover:text-brenne-900 underline">
                    {t('actions.view', { ns: 'common' })}
                  </Link>
                </div>
              </div>
            </Popup>
          </Marker>
        ))}
      </MarkerClusterGroup>
      <MapController points={points} selectedEventId={selectedEventId} />
    </BaseMap>
  );
};

export default EventMap;
