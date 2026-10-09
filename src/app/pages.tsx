import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'

export function NotFoundPage() {
  const { t } = useTranslation()
  return (
    <div className="p-6">
      <h2 className="text-2xl font-semibold">{t('notFound.title')}</h2>
      <Link to="/" className="mt-2 inline-block underline">
        {t('notFound.back')}
      </Link>
    </div>
  )
}
