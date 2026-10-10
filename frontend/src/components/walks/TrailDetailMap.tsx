import { useEffect, useMemo } from 'react';
import { MapContainer, Marker, Polyline, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { TrailTrack } from '@leblanc/shared';
import { OSM_TILE_URL } from '../map/tiles';

const TRACK_COLOR = '#9a3412';
const startIcon = L.divIcon({
  className: 'custom-trail-start',
  html: '<div style="width:30px;height:30px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:#1b4332;border:2px solid white;box-shadow:0 3px 8px #0005"><div style="width:9px;height:9px;margin:9px;border-radius:50%;background:white"></div></div>',
  iconSize: [30, 30], iconAnchor: [15, 30],
});

type LatLng = [number, number];

/** Cadre la carte sur le tracé entier, ou sur le départ seul. */
function FitView({ points }: { points: LatLng[] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length > 1) map.fitBounds(L.latLngBounds(points), { padding: [24, 24] });
    else if (points[0]) map.setView(points[0], 14);
  }, [map, points]);
  return null;
}

/** Attribution ODbL du tracé dans le contrôle Leaflet, avec la relation d'origine. */
function TrackAttribution({ text, relationUrl }: { text: string; relationUrl: string }) {
  const map = useMap();
  useEffect(() => {
    const html = `<a href="${relationUrl}" target="_blank" rel="noopener noreferrer">${text.replace(/[<>&"]/g, '')}</a>`;
    map.attributionControl?.addAttribution(html);
    return () => {
      map.attributionControl?.removeAttribution(html);
    };
  }, [map, text, relationUrl]);
  return null;
}

export interface TrailDetailMapProps {
  start: { lat: number; lng: number };
  track: TrailTrack | null;
  label: string;
  startLabel: string;
  attribution: { text: string; relationUrl: string } | null;
}

export default function TrailDetailMap({ start, track, label, startLabel, attribution }: TrailDetailMapProps) {
  // Mémorisés : le cadrage ne doit pas se refaire à chaque rendu.
  const lines = useMemo(() => track?.coordinates.map((line) => line.map(([lng, lat]) => [lat, lng] as LatLng)) ?? [], [track]);
  const startPoint = useMemo<LatLng>(() => [start.lat, start.lng], [start.lat, start.lng]);
  const points = useMemo(() => (lines.length ? [...lines.flat(), startPoint] : [startPoint]), [lines, startPoint]);
  return (
    <div className="h-72 w-full overflow-hidden rounded-xl border border-brenne-900/10 sm:h-[420px]" role="region" aria-label={label}>
      <MapContainer center={startPoint} zoom={13} scrollWheelZoom={false} className="z-0 h-full w-full">
        <TileLayer url={OSM_TILE_URL} attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' maxZoom={19} />
        {attribution && <TrackAttribution text={attribution.text} relationUrl={attribution.relationUrl} />}
        {lines.length > 0 && <Polyline positions={lines} pathOptions={{ color: TRACK_COLOR, weight: 4, opacity: 0.9 }} />}
        <Marker position={startPoint} icon={startIcon} title={startLabel} alt={startLabel} />
        <FitView points={points} />
      </MapContainer>
    </div>
  );
}
