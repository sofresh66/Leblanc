import { useTranslation } from 'react-i18next';
import { PageSeo } from '../components/PageSeo';

const categoryPhotos = [
  { file: 'culture.jpg', subject: 'culture', url: 'https://unsplash.com/es/fotos/un-grupo-de-personas-que-estan-en-un-escenario-4-qRzyGSb98' },
  { file: 'sport.jpg', subject: 'sport', url: 'https://unsplash.com/es/fotos/una-persona-caminando-por-un-sendero-en-el-bosque-I-tGOPAq-1A' },
  { file: 'fete.jpg', subject: 'fete', url: 'https://unsplash.com/de/fotos/obststand-tagsuber-auf-der-strasse-PBvFpF3f624' },
  { file: 'association.jpg', subject: 'association', url: 'https://unsplash.com/photos/woman-planting-plant-during-daytime-gHho4FE4Ga0' },
  { file: 'autre.jpg', subject: 'autre', url: 'https://unsplash.com/photos/a-pond-with-water-lilies-and-trees-around-it-UFNm8GydEvM' },
] as const;

const linkStyle = 'text-creuse-800 underline underline-offset-4 hover:text-creuse-900 break-words';
const sectionStyle = 'rounded-2xl border border-brenne-900/5 bg-white p-6 sm:p-8 shadow-md space-y-5';

export function CreditsPage() {
  const { t } = useTranslation('pages');

  return (
    <article className="space-y-10 sm:space-y-12 py-6 sm:py-8 pb-12">
      <PageSeo section="credits" />
      <header className="rounded-2xl bg-sable-100 border border-sable-200 p-6 py-12 sm:p-12 lg:p-16 space-y-6">
        <h1 className="section-title text-4xl sm:text-[40px] [overflow-wrap:anywhere] max-w-3xl">{t('credits.title')}</h1>
        <p className="max-w-3xl text-base sm:text-lg leading-relaxed text-gray-700">{t('credits.description')}</p>
      </header>

      <section className={sectionStyle} aria-labelledby="hero-credit-title">
        <h2 id="hero-credit-title" className="font-display text-[28px] sm:text-[32px] text-brenne-950 leading-tight">{t('credits.hero.title')}</h2>
        <div className="grid gap-8 lg:grid-cols-2">
          <img src="/images/hero-le-blanc.jpg" alt={t('credits.hero.description')} width="1920" height="1080" loading="lazy" className="w-full rounded-xl aspect-video object-cover" />
          <dl className="space-y-4 text-gray-700 leading-relaxed min-w-0">
            <div><dt className="font-semibold text-brenne-950">{t('credits.hero.file')}</dt><dd><code className="break-all">hero-le-blanc.jpg</code></dd></div>
            <div><dt className="font-semibold text-brenne-950">{t('credits.hero.work')}</dt><dd>Le Blanc (Indre). (35763042230).jpg — {t('credits.hero.description')}</dd></div>
            <div><dt className="font-semibold text-brenne-950">{t('credits.hero.author')}</dt><dd>Daniel Jolivet (sybarite48)</dd></div>
            <div><dt className="font-semibold text-brenne-950">{t('credits.hero.source')}</dt><dd><a className={linkStyle} href="https://commons.wikimedia.org/wiki/File:Le_Blanc_(Indre)._(35763042230).jpg">Wikimedia Commons</a></dd></div>
            <div><dt className="font-semibold text-brenne-950">{t('credits.hero.license')}</dt><dd><a className={linkStyle} href="https://creativecommons.org/licenses/by/2.0/">Creative Commons Attribution 2.0 Generic (CC BY 2.0)</a></dd></div>
          </dl>
        </div>
        <p className="text-gray-700 leading-relaxed">{t('credits.hero.changes')}</p>
        <div className="flex flex-wrap gap-x-6 gap-y-3">
          <a className={linkStyle} href="https://upload.wikimedia.org/wikipedia/commons/7/7e/Le_Blanc_%28Indre%29._%2835763042230%29.jpg">{t('credits.hero.original')}</a>
          <a className={linkStyle} href="https://www.flickr.com/photos/sybarite48/35763042230">{t('credits.hero.publication')}</a>
        </div>
      </section>

      <section className={sectionStyle} aria-labelledby="category-credit-title">
        <h2 id="category-credit-title" className="font-display text-[28px] sm:text-[32px] text-brenne-950 leading-tight">{t('credits.categories.title')}</h2>
        <p className="text-gray-700 leading-relaxed">{t('credits.categories.description')}</p>
        <div className="overflow-x-auto rounded-xl border border-sable-200">
          <table className="w-full table-fixed text-left text-xs sm:text-base">
            <caption className="sr-only">{t('credits.categories.title')}</caption>
            <thead className="bg-sable-100 text-brenne-950">
              <tr>{(['file', 'subject', 'source'] as const).map((key) => <th key={key} scope="col" className="p-2 sm:p-4 break-words">{t(`credits.categories.${key}`)}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-sable-200">
              {categoryPhotos.map((photo) => (
                <tr key={photo.file}>
                  <th scope="row" className="p-2 sm:p-4 font-normal"><code className="break-all">{photo.file}</code></th>
                  <td className="p-2 sm:p-4 text-gray-700 break-words">{t(`credits.categories.subjects.${photo.subject}`)}</td>
                  <td className="p-2 sm:p-4 break-words"><a className={linkStyle} href={photo.url} aria-label={`Unsplash — ${t(`credits.categories.subjects.${photo.subject}`)}`}>Unsplash ↗</a></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <a className={linkStyle} href="https://unsplash.com/license">{t('credits.categories.license')}</a>
      </section>

      <section className="rounded-2xl bg-sable-100 border border-sable-200 p-6 sm:p-8 space-y-4">
        <h2 className="font-display text-[28px] text-brenne-950">{t('credits.footer.title')}</h2>
        <p className="text-gray-700 leading-relaxed">{t('credits.footer.note')}</p>
        <p className="text-gray-700 leading-relaxed">{t('credits.footer.eventImages')}</p>
        <div className="flex flex-wrap gap-x-6 gap-y-3">
          <a className={linkStyle} href="https://creativecommons.org/licenses/by/2.0/legalcode">{t('credits.footer.ccLicense')}</a>
          <a className={linkStyle} href="https://unsplash.com/license">{t('credits.categories.license')}</a>
        </div>
      </section>
    </article>
  );
}
