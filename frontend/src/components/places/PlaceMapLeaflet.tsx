import { MapContainer, Marker, Popup, TileLayer } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const markerIcon = L.divIcon({
  className: 'custom-place-marker',
  html: '<div style="width:30px;height:30px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:#9a5a32;border:2px solid white;box-shadow:0 3px 8px #0005"><div style="width:9px;height:9px;margin:9px;border-radius:50%;background:white"></div></div>',
  iconSize: [30, 30], iconAnchor: [15, 30], popupAnchor: [0, -30],
});

export default function PlaceMapLeaflet({ latitude, longitude, title }: { latitude: number; longitude: number; title: string }) {
  return (
    <div className="h-64 w-full overflow-hidden rounded-xl border border-brenne-900/10 sm:h-80" role="region" aria-label={title}>
      <MapContainer center={[latitude, longitude]} zoom={16} scrollWheelZoom={false} className="z-0 h-full w-full">
        <TileLayer url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' maxZoom={19} />
        <Marker position={[latitude, longitude]} icon={markerIcon} title={title} alt={title}>
          <Popup>{title}</Popup>
        </Marker>
      </MapContainer>
    </div>
  );
}
