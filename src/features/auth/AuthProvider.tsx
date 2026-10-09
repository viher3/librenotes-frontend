import { useQueryClient } from '@tanstack/react-query'
import i18n from 'i18next'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useRepositories } from '@/data/DataProvider'
import type { User } from '@/data/types'

export type AuthState =
  | { status: 'loading' }
  /**
   * `none`: nobody was signed in (first visit or the stored session was no longer valid);
   * `expired`: an open session ended on its own; `signedOut`: the user asked to leave.
   */
  | { status: 'anonymous'; reason: 'none' | 'expired' | 'signedOut' }
  | { status: 'authenticated'; user: User }

interface AuthContextValue {
  state: AuthState
  login: (email: string, password: string) => Promise<User>
  logout: () => Promise<void>
  /** Replaces the cached user after changing the profile. */
  setUser: (user: User) => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

/** The app follows the account's language preference once it is known. */
function applyLocale(user: User) {
  if (i18n.resolvedLanguage !== user.locale) void i18n.changeLanguage(user.locale)
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const { auth, session } = useRepositories()
  const queryClient = useQueryClient()
  const [state, setState] = useState<AuthState>({ status: 'loading' })
  // Set when the user asks to sign out, so the session ending is not reported as an expiry.
  const signingOut = useRef(false)

  const authenticate = useCallback(
    (user: User) => {
      applyLocale(user)
      setState({ status: 'authenticated', user })
    },
    [setState],
  )

  // Resume the session from the stored refresh token (e.g. after a page reload).
  useEffect(() => {
    let cancelled = false
    auth
      .restoreSession()
      .then((user) => {
        if (cancelled) return
        if (user) authenticate(user)
        else setState({ status: 'anonymous', reason: 'none' })
      })
      .catch(() => {
        // The server could not be reached: show the sign-in page; the stored session is kept for next time.
        if (!cancelled) setState({ status: 'anonymous', reason: 'none' })
      })
    return () => {
      cancelled = true
    }
  }, [auth, authenticate])

  // A session that ends on its own (refresh token rejected) sends the user back to sign in.
  useEffect(
    () =>
      session.subscribe((hasSession) => {
        if (hasSession || signingOut.current) return
        queryClient.clear()
        setState((current) =>
          current.status === 'authenticated' ? { status: 'anonymous', reason: 'expired' } : current,
        )
      }),
    [session, queryClient],
  )

  const login = useCallback(
    async (email: string, password: string) => {
      const user = await auth.login(email, password)
      queryClient.clear() // never show data cached for someone else
      authenticate(user)
      return user
    },
    [auth, authenticate, queryClient],
  )

  const logout = useCallback(async () => {
    signingOut.current = true
    try {
      setState({ status: 'anonymous', reason: 'signedOut' })
      queryClient.clear()
      await auth.logout()
    } finally {
      signingOut.current = false
    }
  }, [auth, queryClient])

  const setUser = useCallback((user: User) => setState({ status: 'authenticated', user }), [])

  const value = useMemo(() => ({ state, login, logout, setUser }), [state, login, logout, setUser])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>')
  return context
}

/** The signed-in user. Only call it below `RequireAuth`. */
export function useUser(): User {
  const { state } = useAuth()
  if (state.status !== 'authenticated') throw new Error('useUser requires an authenticated session')
  return state.user
}
