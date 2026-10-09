import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router-dom'
import { z } from 'zod'
import { Alert } from '@/components/Alert'
import { Button } from '@/components/Button'
import { TextField } from '@/components/TextField'
import { useRepositories } from '@/data/DataProvider'
import { isApiError } from '@/data/errors'
import { MIN_PASSWORD_LENGTH, USERNAME_LENGTH, isEmail } from '@/data/rules'
import { errorMessage } from './errors'
import { fieldError } from './fieldError'

const schema = z
  .object({
    email: z.string().trim().min(1, 'validation.required').refine(isEmail, 'validation.email'),
    username: z
      .string()
      .trim()
      .refine(
        (v) => v === '' || (v.length >= USERNAME_LENGTH.min && v.length <= USERNAME_LENGTH.max),
        'validation.usernameLength',
      ),
    password: z.string().min(MIN_PASSWORD_LENGTH, 'validation.passwordMin'),
    confirmPassword: z.string(),
  })
  .refine((v) => v.password === v.confirmPassword, {
    path: ['confirmPassword'],
    message: 'validation.passwordMismatch',
  })
type Values = z.infer<typeof schema>

export function RegisterPage() {
  const { t } = useTranslation('auth')
  const { auth } = useRepositories()
  const navigate = useNavigate()
  const [failure, setFailure] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { username: '' } })

  const onSubmit = handleSubmit(async ({ email, username, password }) => {
    setFailure(null)
    try {
      await auth.signUp({ email, password, username: username || undefined })
      navigate('/register/check-email', { replace: true, state: { email } })
    } catch (error) {
      if (isApiError(error) && error.code === 'user.email_already_exists') {
        setError('email', { message: errorMessage(error) })
      } else {
        setFailure(errorMessage(error))
      }
    }
  })

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold">{t('register.title')}</h1>
        <p className="text-sm text-neutral-500">{t('register.subtitle')}</p>
      </div>

      {failure && <Alert tone="error">{failure}</Alert>}

      <TextField
        label={t('register.email')}
        type="email"
        autoComplete="email"
        error={fieldError(errors.email?.message)}
        {...register('email')}
      />
      <TextField
        label={t('register.username')}
        hint={t('register.usernameHint')}
        autoComplete="nickname"
        error={fieldError(errors.username?.message, USERNAME_LENGTH)}
        {...register('username')}
      />
      <TextField
        label={t('register.password')}
        hint={t('register.passwordHint', { count: MIN_PASSWORD_LENGTH })}
        type="password"
        autoComplete="new-password"
        error={fieldError(errors.password?.message, { count: MIN_PASSWORD_LENGTH })}
        {...register('password')}
      />
      <TextField
        label={t('register.confirmPassword')}
        type="password"
        autoComplete="new-password"
        error={fieldError(errors.confirmPassword?.message)}
        {...register('confirmPassword')}
      />

      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? t('register.submitting') : t('register.submit')}
      </Button>

      <p className="text-center text-sm text-neutral-500">
        {t('register.haveAccount')}{' '}
        <Link to="/login" className="font-medium text-indigo-600 underline dark:text-indigo-400">
          {t('register.signIn')}
        </Link>
      </p>
    </form>
  )
}
