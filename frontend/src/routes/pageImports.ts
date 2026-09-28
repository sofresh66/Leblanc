import { resolveRoute } from './routeMapping';

export const pageImports = {
  eat: () => import('../pages/EatPage').then((module) => ({ default: module.EatPage })),
  places: () => import('../pages/PlacePage').then((module) => ({ default: module.PlacePage })),
  list: () => import('../pages/ListPage'),
  map: () => import('../pages/MapPage'),
  events: () => import('../pages/EventPage'),
  about: () => import('../pages/AboutPage').then((module) => ({ default: module.AboutPage })),
  credits: () => import('../pages/CreditsPage').then((module) => ({ default: module.CreditsPage })),
  privacy: () => import('../pages/PrivacyPage').then((module) => ({ default: module.PrivacyPage })),
  notFound: () =>
    import('../pages/NotFoundPage').then((module) => ({ default: module.NotFoundPage })),
};

export function prefetchPage(pathname: string): void {
  const { section } = resolveRoute(pathname);
  // Leaflet reste chargé uniquement lors de l'ouverture de la carte.
  if (section === 'home' || section === 'map' || section === 'notFound') return;
  void pageImports[section]().catch(() => {
    // Préchargement facultatif : un échec sera retenté lors de la navigation.
  });
}
