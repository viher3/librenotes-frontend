import { useTranslation } from 'react-i18next'
import type { SaveStatus } from './useAutosave'

/**
 * Tells whether what is on screen has reached the server. `problem` replaces the status when something must be
 * fixed before anything can be saved (e.g. an empty title); it is already translated.
 */
export function SaveIndicator({ status, problem }: { status: SaveStatus; problem?: string }) {
  const { t } = useTranslation('documents')
  const text =
    problem ??
    (status === 'saved'
      ? t('status.saved')
      : status === 'error'
        ? t('status.error')
        : t('status.saving'))
  const tone =
    problem || status === 'error'
      ? 'text-red-600 dark:text-red-400'
      : 'text-neutral-600 dark:text-neutral-400'
  return (
    <p role="status" aria-live="polite" className={`text-sm ${tone}`}>
      {text}
    </p>
  )
}
