import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useSearchParams } from 'react-router-dom'
import { Alert } from '@/components/Alert'
import { useRepositories } from '@/data/DataProvider'
import { errorMessage } from './errors'

type Status = { name: 'working' } | { name: 'success' } | { name: 'failed'; message: string }

/** Landing page of the emailed link (`/activate?token=...`). */
export function ActivatePage() {
  const { t } = useTranslation('auth')
  const { auth } = useRepositories()
  const token = useSearchParams()[0].get('token')
  const [status, setStatus] = useState<Status>(
    token ? { name: 'working' } : { name: 'failed', message: t('activate.missingToken') },
  )
  // An activation token works once. React StrictMode runs effects twice in development: share one request.
  const request = useRef<Promise<void> | null>(null)

  useEffect(() => {
    if (!token) return
    request.current ??= auth.activate(token)
    request.current.then(
      () => setStatus({ name: 'success' }),
      (error: unknown) => setStatus({ name: 'failed', message: errorMessage(error) }),
    )
  }, [auth, token])

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">{t('activate.title')}</h1>
      {status.name === 'working' && <Alert tone="info">{t('activate.working')}</Alert>}
      {status.name === 'success' && (
        <>
          <Alert tone="success">{t('activate.success')}</Alert>
          <Link
            to="/login"
            state={{ activated: true }}
            replace
            className="text-sm font-medium text-indigo-600 underline dark:text-indigo-400"
          >
            {t('activate.goToSignIn')}
          </Link>
        </>
      )}
      {status.name === 'failed' && (
        <>
          <Alert tone="error">{status.message}</Alert>
          <Link
            to="/login"
            className="text-sm font-medium text-indigo-600 underline dark:text-indigo-400"
          >
            {t('activate.backToSignIn')}
          </Link>
        </>
      )}
    </div>
  )
}
