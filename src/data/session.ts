export interface TokenPair {
  accessToken: string
  refreshToken: string
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

export const REFRESH_TOKEN_KEY = 'librenotes.refreshToken'

/**
 * Holds the session tokens. The short-lived access token lives in memory only; the refresh token is
 * kept in `localStorage` so a reload can resume the session. (A refresh token there is reachable by XSS;
 * the backend rotates it on every use and detects reuse. See the spec, §4.6.)
 */
export class SessionStore {
  private access: string | null = null
  private refresh: string | null
  private listeners = new Set<(authenticated: boolean) => void>()
  private storage: StorageLike | null

  constructor(storage: StorageLike | null = defaultStorage()) {
    this.storage = storage
    this.refresh = this.read()
  }

  get accessToken(): string | null {
    return this.access
  }

  get refreshToken(): string | null {
    return this.refresh
  }

  /** True when there is something to resume or use. */
  get hasSession(): boolean {
    return this.access !== null || this.refresh !== null
  }

  setTokens(tokens: TokenPair): void {
    this.access = tokens.accessToken
    this.refresh = tokens.refreshToken
    this.write(tokens.refreshToken)
    this.emit()
  }

  clear(): void {
    if (!this.hasSession) return
    this.access = null
    this.refresh = null
    this.write(null)
    this.emit()
  }

  /** The listener receives `true` when tokens were set and `false` when the session was cleared. */
  subscribe(listener: (authenticated: boolean) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private emit(): void {
    const authenticated = this.hasSession
    this.listeners.forEach((listener) => listener(authenticated))
  }

  private read(): string | null {
    try {
      return this.storage?.getItem(REFRESH_TOKEN_KEY) ?? null
    } catch {
      return null
    }
  }

  private write(value: string | null): void {
    try {
      if (value === null) this.storage?.removeItem(REFRESH_TOKEN_KEY)
      else this.storage?.setItem(REFRESH_TOKEN_KEY, value)
    } catch {
      // Private mode or blocked storage: the session simply will not survive a reload.
    }
  }
}

function defaultStorage(): StorageLike | null {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}
