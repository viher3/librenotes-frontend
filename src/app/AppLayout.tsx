import { useTranslation } from 'react-i18next'
import { NavLink, Outlet } from 'react-router-dom'
import { Button } from '@/components/Button'
import { LanguageSwitcher } from '@/components/LanguageSwitcher'
import { useAuth, useUser } from '@/features/auth/AuthProvider'
import { useNewDocument, useNewDocumentShortcut } from '@/features/documents/useNewDocument'
import { SidebarTree } from '@/features/tree/SidebarTree'
import { Alert } from '@/components/Alert'

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `block rounded px-3 py-1.5 text-sm ${
    isActive
      ? 'bg-neutral-200 dark:bg-neutral-800'
      : 'hover:bg-neutral-100 dark:hover:bg-neutral-900'
  }`

export function AppLayout() {
  const { t } = useTranslation()
  const user = useUser()
  const { logout } = useAuth()
  const { t: tDocs } = useTranslation('documents')
  const { createDocument, pending, error } = useNewDocument()
  useNewDocumentShortcut(createDocument)

  return (
    <div className="flex h-screen">
      <aside className="flex w-72 shrink-0 flex-col gap-3 border-e border-neutral-200 p-4 dark:border-neutral-800">
        <h1 className="text-lg font-semibold">{t('appName')}</h1>
        <Button onClick={() => createDocument()} disabled={pending}>
          {pending ? tDocs('creating') : tDocs('new')}
        </Button>
        {error && <Alert tone="error">{error}</Alert>}
        <nav className="flex flex-col gap-1">
          <NavLink to="/" end className={linkClass}>
            {t('nav.home')}
          </NavLink>
        </nav>
        <SidebarTree />
        <div className="flex flex-col gap-3 border-t border-neutral-200 pt-3 dark:border-neutral-800">
          <div className="text-sm">
            <p className="text-xs text-neutral-500">{t('userMenu.signedInAs')}</p>
            <p className="truncate font-medium">{user.username}</p>
            <p className="truncate text-xs text-neutral-500">{user.email}</p>
          </div>
          <LanguageSwitcher />
          <Button variant="secondary" onClick={() => void logout()}>
            {t('nav.signOut')}
          </Button>
        </div>
      </aside>
      <main className="min-w-0 flex-1 overflow-y-auto p-6">
        <Outlet />
      </main>
    </div>
  )
}
