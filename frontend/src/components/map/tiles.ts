// NOTE : Pour un trafic important (>10k vues/jour), basculer vers un
// fournisseur de tuiles dédié (Stadia Maps, MapTiler) ou auto-héberger
// les tuiles. Les tuiles OSM publiques ne sont pas dimensionnées pour
// un site à fort trafic.
// Module à part : une carte simple l'importe sans charger BaseMap ni markercluster.
export const OSM_TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
