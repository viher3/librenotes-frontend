import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { Button } from '@/components/Button'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { UserMenu } from '@/features/auth/UserMenu'
import { useNewDocument, useNewDocumentShortcut } from '@/features/documents/useNewDocument'
import { TagList } from '@/features/tags/TagList'
import { NewLinkProvider } from '@/features/links/NewLinkProvider'
import { SearchProvider, useSearch } from '@/features/search/SearchProvider'
import { SidebarTree } from '@/features/tree/SidebarTree'
import { Alert } from '@/components/Alert'

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `block rounded px-3 py-1.5 text-sm ${
    isActive
      ? 'bg-neutral-200 dark:bg-neutral-800'
      : 'hover:bg-neutral-100 dark:hover:bg-neutral-900'
  }`

/** The signed-in area: sidebar and page. The link dialog is available from anywhere inside it. */
export function AppLayout() {
  return (
    <NewLinkProvider>
      <SearchProvider>
        <Shell />
      </SearchProvider>
    </NewLinkProvider>
  )
}

function Shell() {
  const { t } = useTranslation()
  const { createDocument, error } = useNewDocument()
  useNewDocumentShortcut(createDocument)
  const { t: tLinks } = useTranslation('links')
  const search = useSearch()
  const { t: tSearch } = useTranslation('search')
  const desktop = useMediaQuery('(min-width: 768px)')
  const [menuOpen, setMenuOpen] = useState(false)
  const mainRef = useRef<HTMLElement>(null)
  const { pathname } = useLocation()

  // Going somewhere closes the drawer (adjusted while rendering, not in an effect).
  const [shownPath, setShownPath] = useState(pathname)
  if (shownPath !== pathname) {
    setShownPath(pathname)
    setMenuOpen(false)
  }

  const drawerOpen = !desktop && menuOpen
  useEffect(() => {
    if (!drawerOpen) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [drawerOpen])
  // A closed drawer is off screen: keep it out of the tab order and the accessibility tree too.
  const sidebarHidden = !desktop && !menuOpen

  return (
    <div className="flex h-screen flex-col md:flex-row">
      <a
        href="#main"
        onClick={(event) => {
          event.preventDefault()
          mainRef.current?.focus()
        }}
        className="sr-only focus:not-sr-only focus:absolute focus:start-2 focus:top-2 focus:z-50 focus:rounded focus:bg-indigo-600 focus:px-3 focus:py-2 focus:text-white"
      >
        {t('skipToContent')}
      </a>
      <header className="flex items-center gap-3 border-b border-neutral-200 p-3 md:hidden dark:border-neutral-800">
        <Button
          variant="secondary"
          className="px-3 py-1.5"
          aria-expanded={menuOpen}
          aria-controls="sidebar"
          aria-label={menuOpen ? t('menu.close') : t('menu.open')}
          onClick={() => setMenuOpen((open) => !open)}
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 20 20"
            className="size-5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          >
            <path d="M3 5h14M3 10h14M3 15h14" />
          </svg>
        </Button>
        <span className="text-lg font-semibold">{t('appName')}</span>
      </header>
      {drawerOpen && (
        <div
          aria-hidden="true"
          data-testid="drawer-backdrop"
          className="fixed inset-0 z-30 bg-black/50 md:hidden"
          onClick={() => setMenuOpen(false)}
        />
      )}
      <aside
        id="sidebar"
        aria-label={t('menu.sidebar')}
        inert={sidebarHidden}
        data-open={drawerOpen}
        className={`fixed inset-y-0 start-0 z-40 flex w-72 max-w-[85vw] shrink-0 flex-col gap-3 overflow-y-auto border-e border-neutral-200 bg-white p-4 transition-transform md:static md:z-auto md:max-w-none md:translate-x-0 dark:border-neutral-800 dark:bg-neutral-950 ${
          menuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <h1 className="hidden text-lg font-semibold md:block">{t('appName')}</h1>
        <UserMenu />
        {error && <Alert tone="error">{error}</Alert>}
        <nav className="flex flex-col gap-1">
          <NavLink to="/" end className={linkClass}>
            {t('nav.home')}
          </NavLink>
          <NavLink to="/links" className={linkClass}>
            {tLinks('nav')}
          </NavLink>
          <button
            type="button"
            onClick={search.open}
            aria-keyshortcuts="Control+K Meta+K"
            className={`${linkClass({ isActive: false })} flex w-full items-center justify-between text-start`}
          >
            <span>{tSearch('open')}</span>
            <kbd className="text-xs text-neutral-600 dark:text-neutral-400">
              {tSearch('shortcut')}
            </kbd>
          </button>
          <NavLink to="/trash" className={linkClass}>
            {t('nav.trash')}
          </NavLink>
        </nav>
        <SidebarTree />
        <TagList />
      </aside>
      <main
        id="main"
        ref={mainRef}
        tabIndex={-1}
        className="min-w-0 flex-1 overflow-y-auto p-4 focus:outline-none md:p-6"
      >
        <Outlet />
      </main>
    </div>
  )
}
