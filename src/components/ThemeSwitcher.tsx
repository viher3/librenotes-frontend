import { useTranslation } from 'react-i18next'
import { THEMES, useTheme, type Theme } from '@/lib/theme'

/** Dark or light, remembered on this device. */
export function ThemeSwitcher() {
  const { t } = useTranslation()
  const [theme, setTheme] = useTheme()

  return (
    <label className="flex items-center gap-2 text-sm">
      <span>{t('theme.label')}</span>
      <select
        className="rounded border border-neutral-300 bg-transparent px-2 py-1 dark:border-neutral-700 dark:bg-neutral-900"
        value={theme}
        onChange={(event) => setTheme(event.target.value as Theme)}
      >
        {THEMES.map((value) => (
          <option key={value} value={value}>
            {t(`theme.${value}`)}
          </option>
        ))}
      </select>
    </label>
  )
}
