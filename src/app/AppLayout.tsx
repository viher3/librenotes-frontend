import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react'
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

const SIDEBAR_WIDTH_KEY = 'sidebarWidth'
const SIDEBAR_DEFAULT = 288
const SIDEBAR_MIN = 200
const SIDEBAR_MAX = 600
const SIDEBAR_STEP = 16

const clampWidth = (width: number) => Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, width))

function loadSidebarWidth() {
  try {
    const stored = Number(localStorage.getItem(SIDEBAR_WIDTH_KEY))
    return stored ? clampWidth(stored) : SIDEBAR_DEFAULT
  } catch {
    return SIDEBAR_DEFAULT
  }
}

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
  const [sidebarWidth, setSidebarWidth] = useState(loadSidebarWidth)
  const [resizing, setResizing] = useState(false)
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

  const saveWidth = (width: number) => {
    try {
      localStorage.setItem(SIDEBAR_WIDTH_KEY, String(width))
    } catch {
      // Storage unavailable: the width just isn't remembered.
    }
  }

  const startResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault()
    const startX = event.clientX
    const startWidth = sidebarWidth
    const sign = document.documentElement.dir === 'rtl' ? -1 : 1
    let latest = startWidth
    setResizing(true)
    const onMove = (move: PointerEvent) => {
      latest = clampWidth(startWidth + sign * (move.clientX - startX))
      setSidebarWidth(latest)
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      setResizing(false)
      saveWidth(latest)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  const resizeWithKeys = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const rtl = document.documentElement.dir === 'rtl'
    const grow = rtl ? 'ArrowLeft' : 'ArrowRight'
    const shrink = rtl ? 'ArrowRight' : 'ArrowLeft'
    if (event.key !== grow && event.key !== shrink) return
    event.preventDefault()
    const next = clampWidth(sidebarWidth + (event.key === grow ? SIDEBAR_STEP : -SIDEBAR_STEP))
    setSidebarWidth(next)
    saveWidth(next)
  }

  return (
    <div className={`flex h-screen flex-col md:flex-row ${resizing ? 'cursor-col-resize select-none' : ''}`}>
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
        style={desktop ? { width: sidebarWidth } : undefined}
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
      {desktop && (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label={t('menu.resize')}
          aria-valuenow={sidebarWidth}
          aria-valuemin={SIDEBAR_MIN}
          aria-valuemax={SIDEBAR_MAX}
          tabIndex={0}
          onPointerDown={startResize}
          onKeyDown={resizeWithKeys}
          onDoubleClick={() => {
            setSidebarWidth(SIDEBAR_DEFAULT)
            saveWidth(SIDEBAR_DEFAULT)
          }}
          className={`relative z-10 -mx-1 w-2 shrink-0 cursor-col-resize touch-none transition-colors hover:bg-indigo-500/40 focus-visible:bg-indigo-500/60 focus-visible:outline-none ${
            resizing ? 'bg-indigo-500/60' : ''
          }`}
        />
      )}
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
