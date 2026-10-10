import { useTranslation } from 'react-i18next'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from './AuthProvider'

/** Where to send the user after signing in: an internal path remembered by `RequireAuth`, else home. */
export function returnPath(state: unknown): string {
  const from = (state as { from?: unknown } | null)?.from
  return typeof from === 'string' && from.startsWith('/') && !from.startsWith('//') ? from : '/'
}

export function Loading() {
  const { t } = useTranslation()
  return (
    <p
      role="status"
      className="grid min-h-screen place-items-center text-sm text-neutral-600 dark:text-neutral-400"
    >
      {t('loading')}
    </p>
  )
}

/** Renders the nested routes for signed-in users; everybody else goes to the sign-in page. */
export function RequireAuth() {
  const { state } = useAuth()
  const location = useLocation()

  if (state.status === 'loading') return <Loading />
  if (state.status === 'anonymous') {
    // Remember where the user was heading, except when they chose to leave.
    const from =
      state.reason === 'signedOut' ? undefined : location.pathname + location.search + location.hash
    return <Navigate to="/login" replace state={{ from }} />
  }
  return <Outlet />
}

/** Sign-in / sign-up pages: signed-in users have nothing to do there. */
export function PublicOnly() {
  const { state } = useAuth()
  const location = useLocation()

  if (state.status === 'loading') return <Loading />
  if (state.status === 'authenticated') return <Navigate to={returnPath(location.state)} replace />
  return <Outlet />
}
