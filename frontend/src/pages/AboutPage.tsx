import { Link } from 'react-router-dom';
import { useLocalizedPath } from '../hooks/useLocalizedPath';
import { LegalNotice } from '../components/LegalNotice';
import { PageSeo } from '../components/PageSeo';
import { useTranslation } from 'react-i18next';

export function AboutPage() {
  const getLocalizedPath = useLocalizedPath();
  const { t } = useTranslation('pages');

  return (
    <article className="space-y-10 sm:space-y-12 py-6 sm:py-8 pb-12">
      <PageSeo section="about" />
      <header className="rounded-2xl bg-sable-100 border border-sable-200 p-6 py-12 sm:p-12 lg:p-16 space-y-6">
        <h1 className="section-title text-4xl sm:text-[40px] [overflow-wrap:anywhere] max-w-3xl">{t('about.title')}</h1>
        <p className="max-w-3xl text-base sm:text-lg leading-relaxed text-gray-700">{t('about.description')}</p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <section className="bg-white rounded-2xl p-6 sm:p-8 shadow-md border border-brenne-900/5 space-y-5">
          <h2 className="font-display text-[28px] sm:text-[32px] text-brenne-950 leading-tight">{t('about.projectTitle')}</h2>
          <p className="text-base leading-loose text-gray-700">{t('about.projectBody')}</p>
        </section>
        <section className="bg-white rounded-2xl p-6 sm:p-8 shadow-md border border-brenne-900/5 space-y-5">
          <h2 className="font-display text-[28px] sm:text-[32px] text-brenne-950 leading-tight">{t('about.dataTitle')}</h2>
          <p className="text-base leading-loose text-gray-700">{t('about.dataBody')}</p>
          <ul className="space-y-4 text-base leading-relaxed text-gray-700">
            <li>
              <a className="text-creuse-800 underline underline-offset-4 hover:text-creuse-900" href="https://www.datatourisme.fr/ressources-juridiques/">{t('about.datatourismeLabel')}</a>
              <p className="mt-1">{t('about.datatourismeLicense')}</p>
            </li>
          </ul>
          <p className="rounded-xl bg-brenne-50 p-4 text-sm leading-relaxed text-brenne-900">{t('about.updates')}</p>
        </section>
        <section className="bg-white rounded-2xl p-6 sm:p-8 shadow-md border border-brenne-900/5 space-y-5">
          <h2 className="font-display text-[28px] sm:text-[32px] text-brenne-950 leading-tight">{t('about.walksTitle')}</h2>
          <p className="text-base leading-loose text-gray-700">{t('about.walksBody')}</p>
          <Link to={getLocalizedPath('walks')} className="inline-flex min-h-11 items-center text-creuse-800 underline underline-offset-4 hover:text-creuse-900 font-semibold">{t('about.walksLink')}</Link>
        </section>
        <section className="bg-white rounded-2xl p-6 sm:p-8 shadow-md border border-brenne-900/5 space-y-5">
          <h2 className="font-display text-[28px] sm:text-[32px] text-brenne-950 leading-tight">{t('about.photosTitle')}</h2>
          <p className="text-base leading-loose text-gray-700">{t('about.photosBody')}</p>
          <Link to={getLocalizedPath('credits')} className="inline-flex min-h-11 items-center text-creuse-800 underline underline-offset-4 hover:text-creuse-900 font-semibold">{t('about.creditsLink')}</Link>
        </section>
        <section className="rounded-2xl bg-sable-100 p-6 sm:p-8 border border-sable-200 space-y-5">
          <h2 className="font-display text-[28px] sm:text-[32px] text-brenne-950 leading-tight">{t('about.legalTitle')}</h2>
          <LegalNotice />
        </section>
      </div>
    </article>
  );
}
