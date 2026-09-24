import { useTranslation } from 'react-i18next';

export function AboutPage() {
  const { t } = useTranslation('pages');

  return (
    <div className="bg-white rounded-2xl p-8 shadow-sm border border-gray-100">
      <h1 className="text-2xl font-bold text-gray-900 tracking-tight">
        {t('about.title')}
      </h1>
      <p className="mt-4 text-gray-600 leading-relaxed">
        {t('about.description')}
      </p>
    </div>
  );
}
