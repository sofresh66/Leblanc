import { PageSeo } from '../components/PageSeo';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useLocalizedPath } from '../hooks/useLocalizedPath';

export function NotFoundPage() {
  const { t } = useTranslation(['errors', 'pages']);
  const getLocalizedPath = useLocalizedPath();

  return (
    <div className="relative overflow-hidden bg-white rounded-2xl px-6 py-12 sm:p-16 text-center shadow-md border border-brenne-900/5 max-w-3xl mx-auto my-6 sm:my-12">
      <PageSeo section="notFound" />
      <div aria-hidden="true" className="absolute -top-20 -right-20 h-64 w-64 rounded-full bg-sable-100" />
      <p className="relative font-display text-[112px] sm:text-[160px] leading-none text-brenne-800">{t('pages:notFound.code')}</p>
      <h1 className="relative mt-8 [overflow-wrap:anywhere] font-display text-3xl sm:text-[40px] leading-tight font-bold text-brenne-950">
        {t('errors:notFound.title')}
      </h1>
      <p className="relative mt-6 text-base leading-relaxed text-gray-600 max-w-md mx-auto">
        {t('errors:notFound.description')}
      </p>
      <div className="mt-8">
        <Link
          to={getLocalizedPath('home')}
          className="btn-primary min-h-12 px-6 py-3"
        >
          {t('pages:notFound.backHome')}
        </Link>
      </div>
    </div>
  );
}
