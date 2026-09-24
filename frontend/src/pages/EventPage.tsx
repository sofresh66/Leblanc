import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

export function EventPage() {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation('pages');

  return (
    <div className="bg-white rounded-2xl p-8 shadow-sm border border-gray-100">
      <h1 className="text-2xl font-bold text-gray-900 tracking-tight">
        {t('event.title')}
      </h1>
      <p className="mt-4 text-gray-600">
        {id ? t('event.placeholder', { id }) : t('event.notFound')}
      </p>
    </div>
  );
}
