import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect, useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'
import { Alert } from '@/components/Alert'
import { Button } from '@/components/Button'
import { Modal } from '@/components/Modal'
import { PasswordField } from '@/components/PasswordField'
import { PasswordStrength } from '@/components/PasswordStrength'
import { isApiError } from '@/data/errors'
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from '@/data/rules'
import { useAuth, useUser } from './AuthProvider'
import { errorMessage } from './errors'
import { fieldError } from './fieldError'

const schema = z
  .object({
    currentPassword: z
      .string()
      .min(1, 'validation.required')
      .max(MAX_PASSWORD_LENGTH, 'validation.passwordMax'),
    newPassword: z
      .string()
      .min(MIN_PASSWORD_LENGTH, 'validation.passwordMin')
      .max(MAX_PASSWORD_LENGTH, 'validation.passwordMax'),
    confirmPassword: z.string(),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    path: ['confirmPassword'],
    message: 'validation.passwordMismatch',
  })
  .refine((v) => v.newPassword !== v.currentPassword, {
    path: ['newPassword'],
    message: 'validation.passwordUnchanged',
  })
type Values = z.infer<typeof schema>

/** `842` -> `14:02`. */
function formatCountdown(seconds: number): string {
  const minutes = Math.floor(seconds / 60)
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`
}

/** The text of a client-side validation message; server messages are already text. */
function validationText(message: string | undefined): string | undefined {
  return fieldError(message, {
    count: message === 'validation.passwordMax' ? MAX_PASSWORD_LENGTH : MIN_PASSWORD_LENGTH,
  })
}

/**
 * Changes the signed-in user's password. A success ends every session (the backend revokes all tokens), so there
 * is nothing to do afterwards: the auth state turns anonymous and the app shows the sign-in page.
 */
export function ChangePasswordDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation('auth')
  const { changePassword } = useAuth()
  const user = useUser()
  const [failure, setFailure] = useState<string | null>(null)
  // Seconds left before another attempt is accepted (after too many wrong current passwords).
  const [lockedFor, setLockedFor] = useState(0)
  const locked = lockedFor > 0

  const {
    register,
    handleSubmit,
    setError,
    control,
    formState: { errors, isSubmitting },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { currentPassword: '', newPassword: '', confirmPassword: '' },
  })
  const newPassword = useWatch({ control, name: 'newPassword' })

  useEffect(() => {
    if (!locked) return
    const timer = setInterval(() => setLockedFor((seconds) => Math.max(0, seconds - 1)), 1000)
    return () => clearInterval(timer)
  }, [locked])

  const onSubmit = handleSubmit(async ({ currentPassword, newPassword }) => {
    setFailure(null)
    try {
      await changePassword({ currentPassword, newPassword })
    } catch (error) {
      const code = isApiError(error) ? error.code : null
      if (code === 'user.invalid_password') {
        setError('currentPassword', { message: errorMessage(error) })
      } else if (code === 'user.password_unchanged' || code === 'user.invalid_new_password') {
        setError('newPassword', { message: errorMessage(error) })
      } else if (code === 'user.change_password_rate_limited') {
        const retryAfter = isApiError(error) ? Number(error.params.retry_after) : NaN
        setLockedFor(Number.isFinite(retryAfter) && retryAfter > 0 ? Math.ceil(retryAfter) : 60)
      } else {
        setFailure(errorMessage(error))
      }
    }
  })

  return (
    <Modal title={t('changePassword.title')} busy={isSubmitting} onClose={onClose}>
      <form onSubmit={onSubmit} noValidate className="mt-4 flex flex-col gap-4">
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          {t('changePassword.description')}
        </p>

        {failure && <Alert tone="error">{failure}</Alert>}
        {locked && (
          <Alert tone="error">
            {t('changePassword.locked', { time: formatCountdown(lockedFor) })}
          </Alert>
        )}

        <fieldset disabled={locked || isSubmitting} className="flex flex-col gap-4">
          <PasswordField
            label={t('changePassword.current')}
            autoComplete="current-password"
            error={validationText(errors.currentPassword?.message)}
            {...register('currentPassword')}
          />
          <div className="flex flex-col gap-2">
            <PasswordField
              label={t('changePassword.new')}
              autoComplete="new-password"
              hint={t('changePassword.newHint', {
                min: MIN_PASSWORD_LENGTH,
                max: MAX_PASSWORD_LENGTH,
              })}
              error={validationText(errors.newPassword?.message)}
              {...register('newPassword')}
            />
            <PasswordStrength
              password={newPassword}
              context={{ email: user.email, username: user.username }}
            />
          </div>
          <PasswordField
            label={t('changePassword.confirm')}
            autoComplete="new-password"
            error={validationText(errors.confirmPassword?.message)}
            {...register('confirmPassword')}
          />
        </fieldset>

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>
            {t('changePassword.cancel')}
          </Button>
          <Button type="submit" disabled={locked || isSubmitting}>
            {isSubmitting ? t('changePassword.submitting') : t('changePassword.submit')}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
