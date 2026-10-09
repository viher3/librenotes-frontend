import type { AuthRepository, NotesRepository } from './repositories'
import { createHttpRepositories } from './http/repositories'
import { SessionStore } from './session'

export interface Repositories {
  auth: AuthRepository
  notes: NotesRepository
  session: SessionStore
}

export interface CreateRepositoriesOptions {
  /** Called when the session can no longer be renewed (e.g. to send the user to the login page). */
  onSessionExpired?: () => void
  /** Overrides `import.meta.env`; for tests. */
  env?: Pick<ImportMetaEnv, 'VITE_API_URL' | 'VITE_DATA_ADAPTER'>
}

/**
 * Builds the data layer selected by `VITE_DATA_ADAPTER`: `http` (default) talks to the backend at
 * `VITE_API_URL`; `mock` is an in-memory fake for development. The mock is only reachable in development
 * builds: the `import.meta.env.DEV` guard lets the bundler drop it from production.
 */
export async function createRepositories(
  options: CreateRepositoriesOptions = {},
): Promise<Repositories> {
  const env = options.env ?? import.meta.env
  const session = new SessionStore()

  // The literal `import.meta.env.DEV` is what lets the bundler delete this branch (and the mock with it)
  // from production builds: do not hide it behind a variable.
  if (import.meta.env.DEV && env.VITE_DATA_ADAPTER === 'mock') {
    const { createMockRepositories } = await import('./mock')
    const { auth, notes } = createMockRepositories({ session, seed: true, latencyMs: 150 })
    return { auth, notes, session }
  }

  if (!env.VITE_API_URL) {
    throw new Error(
      'VITE_API_URL is not set. Copy .env.example to .env and point it at the backend.',
    )
  }
  const { auth, notes } = createHttpRepositories({
    baseUrl: env.VITE_API_URL,
    session,
    onSessionExpired: options.onSessionExpired,
  })
  return { auth, notes, session }
}
