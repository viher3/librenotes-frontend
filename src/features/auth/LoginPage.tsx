import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { Link, useLocation } from 'react-router-dom'
import { z } from 'zod'
import { Alert } from '@/components/Alert'
import { Button } from '@/components/Button'
import { TextField } from '@/components/TextField'
import { isEmail } from '@/data/rules'
import { useAuth } from './AuthProvider'
import { errorMessage } from './errors'
import { fieldError } from './fieldError'

const schema = z.object({
  email: z.string().trim().min(1, 'validation.required').refine(isEmail, 'validation.email'),
  password: z.string().min(1, 'validation.required'),
})
type Values = z.infer<typeof schema>

export function LoginPage() {
  const { t } = useTranslation('auth')
  const { state, login } = useAuth()
  const location = useLocation()
  const [failure, setFailure] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(schema) })

  const activated = (location.state as { activated?: boolean } | null)?.activated === true
  const expired = state.status === 'anonymous' && state.reason === 'expired'

  // On success the session changes and `PublicOnly` redirects away, so there is nothing else to do here.
  const onSubmit = handleSubmit(async ({ email, password }) => {
    setFailure(null)
    try {
      await login(email, password)
    } catch (error) {
      setFailure(errorMessage(error))
    }
  })

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold">{t('login.title')}</h1>
        <p className="text-sm text-neutral-600 dark:text-neutral-400">{t('login.subtitle')}</p>
      </div>

      {expired && <Alert tone="info">{t('login.sessionExpired')}</Alert>}
      {activated && <Alert tone="success">{t('login.activated')}</Alert>}
      {failure && <Alert tone="error">{failure}</Alert>}

      <TextField
        label={t('login.email')}
        type="email"
        autoComplete="username"
        error={fieldError(errors.email?.message)}
        {...register('email')}
      />
      <TextField
        label={t('login.password')}
        type="password"
        autoComplete="current-password"
        error={fieldError(errors.password?.message)}
        {...register('password')}
      />

      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? t('login.submitting') : t('login.submit')}
      </Button>

      <p className="text-center text-sm text-neutral-600 dark:text-neutral-400">
        {t('login.noAccount')}{' '}
        <Link to="/register" className="font-medium text-indigo-600 underline dark:text-indigo-400">
          {t('login.createAccount')}
        </Link>
      </p>
    </form>
  )
}
