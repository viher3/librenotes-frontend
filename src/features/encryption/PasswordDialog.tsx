import { useId, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Alert } from '@/components/Alert'
import { Button } from '@/components/Button'
import { Modal } from '@/components/Modal'
import { TextField } from '@/components/TextField'
import { cryptoErrorMessage, MIN_DOCUMENT_PASSWORD_LENGTH } from './rules'

interface PasswordDialogProps {
  /** `enable` also asks the user to acknowledge there is no recovery. */
  kind: 'enable' | 'change'
  /** Does the work; rejects when it fails (the dialog stays open and says so). */
  onSubmit: (password: string) => Promise<void>
  onClose: () => void
}

/** Asks for a new password twice: to encrypt a document, or to change the password of an encrypted one. */
export function PasswordDialog({ kind, onSubmit, onClose }: PasswordDialogProps) {
  const { t } = useTranslation('encryption')
  const understandId = useId()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [understood, setUnderstood] = useState(false)
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)

  const tooShort = password.length < MIN_DOCUMENT_PASSWORD_LENGTH
  const mismatch = password !== confirm
  const needsAck = kind === 'enable' && !understood
  const invalid = tooShort || mismatch || needsAck

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setSubmitted(true)
    if (invalid) return
    setBusy(true)
    setFailure(null)
    try {
      await onSubmit(password)
    } catch (error) {
      setFailure(cryptoErrorMessage(t, error))
      setBusy(false)
    }
  }

  return (
    <Modal title={t(`${kind}.title`)} busy={busy} onClose={onClose} width="md">
      <form
        onSubmit={(event) => void submit(event)}
        className="mt-3 flex flex-col gap-3"
        noValidate
      >
        <p className="text-sm text-neutral-600 dark:text-neutral-300">{t(`${kind}.body`)}</p>
        {kind === 'enable' && (
          <p className="text-xs text-neutral-600 dark:text-neutral-400">{t('enable.limits')}</p>
        )}
        <TextField
          type="password"
          autoComplete="new-password"
          label={t('password.label')}
          value={password}
          disabled={busy}
          hint={t('password.hint', { min: MIN_DOCUMENT_PASSWORD_LENGTH })}
          error={
            submitted && tooShort
              ? t('errors.tooShort', { min: MIN_DOCUMENT_PASSWORD_LENGTH })
              : undefined
          }
          onChange={(event) => setPassword(event.target.value)}
        />
        <TextField
          type="password"
          autoComplete="new-password"
          label={t('password.confirm')}
          value={confirm}
          disabled={busy}
          error={submitted && !tooShort && mismatch ? t('errors.mismatch') : undefined}
          onChange={(event) => setConfirm(event.target.value)}
        />
        {kind === 'enable' && (
          <div className="flex flex-col gap-1">
            <label htmlFor={understandId} className="flex items-start gap-2 text-sm">
              <input
                id={understandId}
                type="checkbox"
                checked={understood}
                disabled={busy}
                onChange={(event) => setUnderstood(event.target.checked)}
                className="mt-0.5"
              />
              <span>{t('enable.understand')}</span>
            </label>
            {submitted && needsAck && (
              <p className="text-xs text-red-600 dark:text-red-400">{t('errors.understand')}</p>
            )}
          </div>
        )}
        {failure && <Alert tone="error">{failure}</Alert>}
        <div className="mt-2 flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            {t('password.cancel')}
          </Button>
          <Button type="submit" disabled={busy}>
            {busy ? t(`${kind}.working`) : t(`${kind}.submit`)}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
