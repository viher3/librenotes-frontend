import { useTranslation } from 'react-i18next'
import { Outlet } from 'react-router-dom'
import { LanguageSwitcher } from '@/components/LanguageSwitcher'
import { ThemeSwitcher } from '@/components/ThemeSwitcher'

/** Centered card shared by the sign-in, sign-up and activation pages. */
export function AuthLayout() {
  const { t } = useTranslation()
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 p-4">
      <div className="flex w-full max-w-sm items-center justify-between">
        <span className="text-lg font-semibold">{t('appName')}</span>
        <div className="flex items-center gap-3">
          <ThemeSwitcher />
          <LanguageSwitcher />
        </div>
      </div>
      <main className="w-full max-w-sm rounded-xl border border-neutral-200 p-6 shadow-sm dark:border-neutral-800">
        <Outlet />
      </main>
    </div>
  )
}
