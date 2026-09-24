import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useLocalizedPath } from '../hooks/useLocalizedPath';

export function NotFoundPage() {
  const { t } = useTranslation(['errors', 'nav']);
  const getLocalizedPath = useLocalizedPath();

  return (
    <div className="bg-white rounded-2xl p-12 text-center shadow-sm border border-gray-100 max-w-xl mx-auto my-12">
      <p className="text-sm font-semibold text-blue-600 uppercase tracking-wide">404</p>
      <h1 className="mt-2 text-3xl font-extrabold text-gray-900 tracking-tight sm:text-4xl">
        {t('errors:notFound.title')}
      </h1>
      <p className="mt-4 text-base text-gray-500">
        {t('errors:notFound.description')}
      </p>
      <div className="mt-8">
        <Link
          to={getLocalizedPath('home')}
          className="inline-flex items-center px-5 py-2.5 border border-transparent text-sm font-medium rounded-lg shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
        >
          {t('nav:home')}
        </Link>
      </div>
    </div>
  );
}
