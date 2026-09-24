import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useLocalizedPath } from '../hooks/useLocalizedPath';

export function HomePage() {
  const { t } = useTranslation(['pages', 'common', 'nav']);
  const getLocalizedPath = useLocalizedPath();

  return (
    <div className="space-y-8">
      <div className="bg-white rounded-2xl p-8 shadow-sm border border-gray-100">
        <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight sm:text-4xl">
          {t('pages:home.title')}
        </h1>
        <p className="mt-3 text-lg text-gray-600">
          {t('pages:home.subtitle')}
        </p>
        <p className="mt-1 text-sm text-gray-400">
          {t('common:app.tagline')}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Link
          to={getLocalizedPath('map')}
          className="p-6 bg-white rounded-xl border border-gray-200 hover:border-blue-500 hover:shadow-md transition-all group"
        >
          <h2 className="text-lg font-semibold text-gray-900 group-hover:text-blue-600">
            {t('nav:map')}
          </h2>
          <p className="mt-2 text-sm text-gray-500">
            {t('pages:map.placeholder')}
          </p>
        </Link>

        <Link
          to={getLocalizedPath('list')}
          className="p-6 bg-white rounded-xl border border-gray-200 hover:border-blue-500 hover:shadow-md transition-all group"
        >
          <h2 className="text-lg font-semibold text-gray-900 group-hover:text-blue-600">
            {t('nav:list')}
          </h2>
          <p className="mt-2 text-sm text-gray-500">
            {t('pages:list.placeholder')}
          </p>
        </Link>

        <Link
          to={getLocalizedPath('about')}
          className="p-6 bg-white rounded-xl border border-gray-200 hover:border-blue-500 hover:shadow-md transition-all group"
        >
          <h2 className="text-lg font-semibold text-gray-900 group-hover:text-blue-600">
            {t('nav:about')}
          </h2>
          <p className="mt-2 text-sm text-gray-500">
            {t('pages:about.description')}
          </p>
        </Link>
      </div>
    </div>
  );
}
