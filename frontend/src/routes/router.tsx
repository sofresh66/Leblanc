import { createBrowserRouter, Navigate, useLocation, useSearchParams } from 'react-router-dom';
import i18n, { i18nReady } from '../i18n/config';
import { SUPPORTED_LANGUAGES, type SupportedLanguage } from '../i18n/languages';
import { ROUTE_SEGMENTS, detectPreferredLanguage } from './routeMapping';
import { LocalizedRoute } from './LocalizedRoute';
import { HomePage } from '../pages/HomePage';
import { lazy } from 'react';
import { pageImports } from './pageImports';

const MapPage = lazy(pageImports.map);
const ListPage = lazy(pageImports.list);
const EventPage = lazy(pageImports.events);
const AboutPage = lazy(pageImports.about);
const CreditsPage = lazy(pageImports.credits);
const PrivacyPage = lazy(pageImports.privacy);
const EatPage = lazy(pageImports.eat);
const PlacePage = lazy(pageImports.places);
const WalksPage = lazy(pageImports.walks);
const WalkPage = lazy(pageImports.walk);
const NotFoundPage = lazy(pageImports.notFound);

/**
 * Composant de redirection racine (/) vers la langue préférée :
 * Priorité :
 * 1. Querystring ?lang=xx
 * 2. localStorage ('leblanc_i18n_lang')
 * 3. navigator.languages
 * 4. navigator.language
 * 5. Fallback 'fr'
 *
 * Conserve la query string et le hash éventuels (ex: /?category=sport -> /fr?category=sport).
 */
function RootRedirect() {
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const targetLang = detectPreferredLanguage(searchParams);
  return <Navigate to={`/${targetLang}${location.search}${location.hash}`} replace />;
}

/**
 * Les routes localisées
 * sont générées automatiquement et programmatiquement depuis la table `routeMapping.ts`
 * (source unique de vérité), garantissant l'exhaustivité et la cohérence des URLs.
 */
const localizedLanguageRoutes = SUPPORTED_LANGUAGES.map((lang: SupportedLanguage) => {
  const segments = ROUTE_SEGMENTS[lang];

  return {
    path: lang,
    loader: async () => {
      await i18nReady;
      if (i18n.language !== lang) {
        await i18n.changeLanguage(lang);
      }
      return null;
    },
    element: <LocalizedRoute />,
    children: [
      {
        index: true,
        element: <HomePage />,
      },
      {
        path: segments.map,
        element: <MapPage />,
      },
      {
        path: segments.list,
        element: <ListPage />,
      },
      {
        path: `${segments.events}/:id`,
        element: <EventPage />,
      },
      {
        path: segments.eat,
        element: <EatPage />,
      },
      {
        path: `${segments.places}/:id`,
        element: <PlacePage />,
      },
      {
        path: segments.walks,
        element: <WalksPage />,
      },
      {
        path: `${segments.walks}/:id`,
        element: <WalkPage />,
      },
      {
        path: segments.about,
        element: <AboutPage />,
      },
      {
        path: segments.credits,
        element: <CreditsPage />,
      },
      {
        path: segments.privacy,
        element: <PrivacyPage />,
      },
      {
        path: '*',
        element: <NotFoundPage />,
      },
    ],
  };
});

export const router = createBrowserRouter([
  {
    path: '/',
    element: <RootRedirect />,
  },
  ...localizedLanguageRoutes,
  {
    path: '*',
    element: (
      <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
        <NotFoundPage />
      </div>
    ),
  },
]);
