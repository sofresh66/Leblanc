import type { ReactNode } from 'react';
import { createLayerComponent, type LayerProps } from '@react-leaflet/core';
import L from 'leaflet';
import 'leaflet.markercluster';
import { Circle, MapContainer, TileLayer } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import { LE_BLANC_CENTER, SEARCH_RADIUS_METERS } from '@leblanc/shared';

// NOTE : Pour un trafic important (>10k vues/jour), basculer vers un
// fournisseur de tuiles dédié (Stadia Maps, MapTiler) ou auto-héberger
// les tuiles. Les tuiles OSM publiques ne sont pas dimensionnées pour
// un site à fort trafic.
export const OSM_TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

/** Zoom à partir duquel les marqueurs ne sont plus regroupés. */
export const DECLUSTER_ZOOM = 15;

interface MarkerClusterProps extends LayerProps {
  children?: ReactNode;
}

/** Regroupe les marqueurs proches (leaflet.markercluster) ; enfants : des <Marker>. */
export const MarkerClusterGroup = createLayerComponent<L.MarkerClusterGroup, MarkerClusterProps>(
  function createMarkerClusterGroup(_props, context) {
    const instance = L.markerClusterGroup({
      showCoverageOnHover: false,
      maxClusterRadius: 50,
      disableClusteringAtZoom: DECLUSTER_ZOOM,
    });
    return { instance, context: { ...context, layerContainer: instance } };
  },
);

export interface BaseMapProps {
  className?: string;
  children?: ReactNode;
  /** Centre et zoom initiaux (défaut : Le Blanc, zoom 11). */
  center?: [number, number];
  zoom?: number;
  /** Cercle des 20 km (événements, lieux) ; les parcours vont jusqu'au bout du PNR. */
  showSearchRadius?: boolean;
}

/** Fond commun des cartes : tuiles OSM (attribution obligatoire) et rayon de 20 km. */
export function BaseMap({
  className = 'h-[500px] lg:h-[650px] w-full',
  children,
  center = [LE_BLANC_CENTER.lat, LE_BLANC_CENTER.lng],
  zoom = 11,
  showSearchRadius = true,
}: BaseMapProps) {
  return (
    <div className={`relative rounded-2xl overflow-hidden shadow-sm border border-gray-100 ${className}`}>
      <MapContainer center={center} zoom={zoom} scrollWheelZoom className="h-full w-full z-0">
        <TileLayer
          url={OSM_TILE_URL}
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          maxZoom={19}
        />
        {showSearchRadius && <Circle
          center={[LE_BLANC_CENTER.lat, LE_BLANC_CENTER.lng]}
          radius={SEARCH_RADIUS_METERS}
          pathOptions={{ color: '#2d6a4f', fillColor: '#52b788', fillOpacity: 0.06, weight: 1.5, dashArray: '6, 6' }}
        />}
        {children}
      </MapContainer>
    </div>
  );
}
