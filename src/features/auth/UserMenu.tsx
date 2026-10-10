import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/Button'
import { LanguageSwitcher } from '@/components/LanguageSwitcher'
import { Modal } from '@/components/Modal'
import { ThemeSwitcher } from '@/components/ThemeSwitcher'
import { useAuth, useUser } from './AuthProvider'

/** The user's name with an icon; activating it opens the account options (theme, language, sign out). */
export function UserMenu() {
  const { t } = useTranslation()
  const user = useUser()
  const { logout } = useAuth()
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        aria-label={t('userMenu.open', { name: user.username })}
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded px-3 py-1.5 text-start text-sm hover:bg-neutral-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 dark:hover:bg-neutral-900"
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 20 20"
          className="size-5 shrink-0 text-neutral-600 dark:text-neutral-400"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        >
          <circle cx="10" cy="7" r="3.25" />
          <path d="M3.5 17c.8-3 3.3-4.5 6.5-4.5s5.7 1.5 6.5 4.5" />
        </svg>
        <span className="truncate font-medium">{user.username}</span>
      </button>
      {open && (
        <Modal title={t('userMenu.title')} onClose={() => setOpen(false)}>
          <div className="mt-4 flex flex-col gap-4">
            <div className="text-sm">
              <p className="text-xs text-neutral-600 dark:text-neutral-400">
                {t('userMenu.signedInAs')}
              </p>
              <p className="truncate font-medium">{user.username}</p>
              <p className="truncate text-xs text-neutral-600 dark:text-neutral-400">
                {user.email}
              </p>
            </div>
            <ThemeSwitcher />
            <LanguageSwitcher />
            <div className="flex justify-between gap-2 border-t border-neutral-200 pt-4 dark:border-neutral-800">
              <Button variant="secondary" onClick={() => void logout()}>
                {t('nav.signOut')}
              </Button>
              <Button variant="secondary" onClick={() => setOpen(false)}>
                {t('userMenu.close')}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </>
  )
}
