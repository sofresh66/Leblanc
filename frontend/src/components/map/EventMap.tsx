import { PriceBadge } from '../events/PriceBadge';
import React, { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Circle, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { Event } from '@leblanc/shared';
import { LE_BLANC_CENTER, SEARCH_RADIUS_METERS } from '@leblanc/shared';
import { DEFAULT_LANGUAGE, isSupportedLanguage, type SupportedLanguage } from '../../i18n/languages';
import { buildLocalizedPath } from '../../routes/routeMapping';
import { formatVenueCity } from '../../utils/eventLocation';

// NOTE : Pour un trafic important (>10k vues/jour), basculer vers un 
// fournisseur de tuiles dédié (Stadia Maps, MapTiler) ou auto-héberger 
// les tuiles. Les tuiles OSM publiques ne sont pas dimensionnées pour 
// un site à fort trafic.

// Icône Leaflet personnalisée élégante et robuste sans dépendance d'actifs externes
const createEventMarkerIcon = (category: string) => {
  const categoryColor: Record<string, string> = {
    culture: '#2d6a4f',
    sport: '#059669',
    fete: '#d97706',
    association: '#4f46e5',
    autre: '#4b5563',
  };
  const color = categoryColor[category] || '#2d6a4f';

  return L.divIcon({
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
};

interface MapControllerProps {
  events: Event[];
  selectedEventId?: string | undefined;
}

const MapController: React.FC<MapControllerProps> = ({ events, selectedEventId }) => {
  const map = useMap();

  useEffect(() => {
    if (selectedEventId) {
      const selected = events.find((e) => e.id === selectedEventId);
      if (selected) {
        map.setView([selected.latitude, selected.longitude], 14, { animate: !window.matchMedia('(prefers-reduced-motion: reduce)').matches });
      }
    }
  }, [selectedEventId, events, map]);

  return null;
};

export interface EventMapProps {
  events: Event[];
  selectedEventId?: string | undefined;
  onSelectEvent?: ((event: Event) => void) | undefined;
  className?: string | undefined;
}

export const EventMap: React.FC<EventMapProps> = ({
  events,
  selectedEventId,
  onSelectEvent,
  className = 'h-[500px] lg:h-[650px] w-full',
}) => {
  const { t, i18n } = useTranslation(['events', 'common']);
  const currentLang = (isSupportedLanguage(i18n.language) ? i18n.language : DEFAULT_LANGUAGE) as SupportedLanguage;

  return (
    <div className={`relative rounded-2xl overflow-hidden shadow-sm border border-gray-100 ${className}`}>
      <MapContainer
        center={[LE_BLANC_CENTER.lat, LE_BLANC_CENTER.lng]}
        zoom={11}
        scrollWheelZoom={true}
        className="h-full w-full z-0"
      >
        {/* Tuiles OpenStreetMap officielles avec attribution obligatoire */}
        <TileLayer
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          maxZoom={19}
        />

        {/* Cercle délimitant le rayon de recherche de 20 km autour du Blanc */}
        <Circle
          center={[LE_BLANC_CENTER.lat, LE_BLANC_CENTER.lng]}
          radius={SEARCH_RADIUS_METERS}
          pathOptions={{
            color: '#2d6a4f',
            fillColor: '#52b788',
            fillOpacity: 0.06,
            weight: 1.5,
            dashArray: '6, 6',
          }}
        />

        {/* Marqueurs d'événements */}
        {events.map((event) => {
          const detailUrl = buildLocalizedPath('events', currentLang, event.id);
          // Lieu et ville sont nullables : la ligne est masquée si les deux sont absents.
          const venueCity = formatVenueCity(event);

          return (
            <Marker
              key={event.id}
              alt={event.title}
              title={event.title}
              position={[event.latitude, event.longitude]}
              icon={createEventMarkerIcon(event.category)}
              eventHandlers={{
                click: () => {
                  if (onSelectEvent) {
                    onSelectEvent(event);
                  }
                },
              }}
            >
              <Popup className="custom-leaflet-popup">
                <div className="p-1 max-w-xs space-y-2">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-brenne-100 text-brenne-800 uppercase tracking-wide">
                      {t(`categories.${event.category}`, { ns: 'events' })}
                    </span>
                    {event.isFallback && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-gray-800 text-white">
                        {event.contentLanguage.toUpperCase()}
                      </span>
                    )}
                  </div>

                  <h4 lang={event.contentLanguage} className="font-bold text-sm text-gray-900 leading-snug line-clamp-2">
                    {event.title}
                  </h4>

                  {venueCity && <p className="text-xs text-gray-600 truncate">{venueCity}</p>}

                  <div className="pt-2 border-t border-gray-100 flex flex-wrap gap-2 items-center justify-between">
                    <PriceBadge event={event} />
                    <Link
                      to={detailUrl}
                      className="text-xs font-bold text-brenne-700 hover:text-brenne-900 underline"
                    >
                      {t('actions.view', { ns: 'common' })}
                    </Link>
                  </div>
                </div>
              </Popup>
            </Marker>
          );
        })}

        <MapController events={events} selectedEventId={selectedEventId} />
      </MapContainer>
    </div>
  );
};

export default EventMap;
