import { useTranslation } from 'react-i18next'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import { scorePassword, type PasswordContext } from '@/lib/passwordStrength'

/** How long typing must pause before the meter (and the screen reader announcement) updates. */
const DEBOUNCE_MS = 300

const LEVELS: { key: 'weak' | 'fair' | 'good' | 'strong'; bar: string }[] = [
  { key: 'weak', bar: 'bg-red-500' },
  { key: 'fair', bar: 'bg-amber-500' },
  { key: 'good', bar: 'bg-lime-600' },
  { key: 'strong', bar: 'bg-emerald-600' },
]

/**
 * How strong the password being typed looks: a four-segment bar and a word (colour is never the only cue), plus
 * the one change that would help most. It is advice only and never blocks anything.
 */
export function PasswordStrength({
  password,
  context,
}: {
  password: string
  context?: PasswordContext
}) {
  const { t } = useTranslation()
  const settled = useDebouncedValue(password, DEBOUNCE_MS)
  if (!password || !settled) return null

  const { level, hint } = scorePassword(settled, context)
  const { key, bar } = LEVELS[level]
  const label = t(`password.strength.${key}`)

  return (
    <div className="flex flex-col gap-1" aria-live="polite" data-testid="password-strength">
      <div className="flex items-center gap-2">
        <div
          role="meter"
          aria-label={t('password.strength.label')}
          aria-valuemin={1}
          aria-valuemax={4}
          aria-valuenow={level + 1}
          aria-valuetext={label}
          className="flex flex-1 gap-1"
        >
          {LEVELS.map((_, index) => (
            <span
              key={index}
              className={`h-1.5 flex-1 rounded-full ${
                index <= level ? bar : 'bg-neutral-200 dark:bg-neutral-700'
              }`}
            />
          ))}
        </div>
        <span className="text-xs font-medium">
          <span className="sr-only">{t('password.strength.label')}: </span>
          {label}
        </span>
      </div>
      <p className="min-h-4 text-xs text-neutral-600 dark:text-neutral-400">
        {hint ? t(`password.strength.tips.${hint}`) : ''}
      </p>
    </div>
  )
}
