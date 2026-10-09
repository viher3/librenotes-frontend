import { useTranslation } from 'react-i18next'
import { Link, useLocation } from 'react-router-dom'

export function CheckEmailPage() {
  const { t } = useTranslation('auth')
  const email = (useLocation().state as { email?: string } | null)?.email

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">{t('checkEmail.title')}</h1>
      <p className="text-sm">
        {email ? t('checkEmail.body', { email }) : t('checkEmail.bodyNoEmail')}
      </p>
      <Link
        to="/login"
        className="text-sm font-medium text-indigo-600 underline dark:text-indigo-400"
      >
        {t('checkEmail.backToSignIn')}
      </Link>
    </div>
  )
}
