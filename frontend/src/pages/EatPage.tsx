import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { PageSeo } from '../components/PageSeo';
import { useLocalizedPath } from '../hooks/useLocalizedPath';

export function EatPage() {
  const { t } = useTranslation('pages');
  const getLocalizedPath = useLocalizedPath();

  return (
    <article className="py-6 sm:py-8 pb-12">
      <PageSeo section="eat" />
      <div className="rounded-2xl border border-sable-200 bg-sable-100 px-6 py-12 sm:p-12 lg:p-16">
        <div className="max-w-3xl space-y-8">
          <header className="space-y-5">
            <p className="inline-block rounded-full border border-brenne-200 bg-brenne-50 px-4 py-2 text-sm font-semibold text-brenne-900">
              {t('eat.comingSoon')}
            </p>
            <h1 className="font-display text-[40px] font-bold leading-tight text-brenne-950 [overflow-wrap:anywhere]">
              {t('eat.title')}
            </h1>
            <p className="text-base sm:text-lg leading-relaxed text-gray-700">
              {t('eat.description')}
            </p>
          </header>

          <ul className="list-disc space-y-3 pl-5 text-base leading-relaxed text-brenne-900 marker:text-brenne-700">
            <li>{t('eat.items.restaurants')}</li>
            <li>{t('eat.items.producers')}</li>
            <li>{t('eat.items.specialties')}</li>
          </ul>

          <Link to={getLocalizedPath('home')} className="btn-primary min-h-11 text-center">
            {t('eat.backHome')}
          </Link>
        </div>
      </div>
    </article>
  );
}
