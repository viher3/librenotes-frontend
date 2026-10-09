import { useTranslation } from 'react-i18next'
import { useRepositories } from '@/data/DataProvider'
import type { Locale } from '@/data/types'
import { useAuth } from '@/features/auth/AuthProvider'
import { SUPPORTED_LANGUAGES } from '@/lib/i18n'

/**
 * Switches the interface language at once and, for a signed-in user, saves it as their preference
 * (best effort: the language still changes if the server cannot be reached).
 */
export function LanguageSwitcher() {
  const { t, i18n } = useTranslation()
  const { auth } = useRepositories()
  const { state, setUser } = useAuth()
  const current = i18n.resolvedLanguage ?? 'en'

  const change = async (language: string) => {
    await i18n.changeLanguage(language)
    if (state.status !== 'authenticated' || state.user.locale === language) return
    try {
      setUser(await auth.updateProfile({ locale: language as Locale }))
    } catch {
      /* the preference will be saved the next time it is changed */
    }
  }

  return (
    <label className="flex items-center gap-2 text-sm">
      <span>{t('language.label')}</span>
      <select
        className="rounded border border-neutral-300 bg-transparent px-2 py-1 dark:border-neutral-700 dark:bg-neutral-900"
        value={current}
        onChange={(event) => void change(event.target.value)}
      >
        {SUPPORTED_LANGUAGES.map((language) => (
          <option key={language} value={language}>
            {t(`language.${language}`)}
          </option>
        ))}
      </select>
    </label>
  )
}
