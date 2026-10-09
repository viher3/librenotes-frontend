import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'

export function HomePage() {
  const { t } = useTranslation()
  return (
    <>
      <h2 className="text-2xl font-semibold">{t('home.title')}</h2>
      <p className="mt-2 text-neutral-500">{t('home.empty')}</p>
    </>
  )
}

export function LoginPage() {
  const { t } = useTranslation('auth')
  return <h2 className="p-6 text-2xl font-semibold">{t('login.title')}</h2>
}

export function RegisterPage() {
  const { t } = useTranslation('auth')
  return <h2 className="p-6 text-2xl font-semibold">{t('register.title')}</h2>
}

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
