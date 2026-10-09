import { useTranslation } from 'react-i18next'
import { NavLink, Outlet } from 'react-router-dom'
import { LanguageSwitcher } from '@/components/LanguageSwitcher'

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `block rounded px-3 py-1.5 text-sm ${
    isActive
      ? 'bg-neutral-200 dark:bg-neutral-800'
      : 'hover:bg-neutral-100 dark:hover:bg-neutral-900'
  }`

export function AppLayout() {
  const { t } = useTranslation()
  return (
    <div className="flex min-h-screen">
      <aside className="flex w-64 shrink-0 flex-col gap-4 border-e border-neutral-200 p-4 dark:border-neutral-800">
        <h1 className="text-lg font-semibold">{t('appName')}</h1>
        <nav className="flex flex-col gap-1">
          <NavLink to="/" end className={linkClass}>
            {t('nav.home')}
          </NavLink>
        </nav>
        <div className="mt-auto">
          <LanguageSwitcher />
        </div>
      </aside>
      <main className="flex-1 p-6">
        <Outlet />
      </main>
    </div>
  )
}
