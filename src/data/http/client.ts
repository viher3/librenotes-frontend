import createClient, { type Client } from 'openapi-fetch'
import type { paths } from '../api/schema'
import { ApiError } from '../errors'
import type { SessionStore } from '../session'

type FetchLike = (input: Request) => Promise<Response>

export interface HttpClientOptions {
  baseUrl: string
  session: SessionStore
  /** Defaults to the global `fetch`. */
  fetch?: FetchLike
  /** Called once when the session can no longer be renewed (refresh token rejected). */
  onSessionExpired?: () => void
}

export interface HttpClient {
  api: Client<paths>
  /**
   * Exchanges the refresh token for a new pair. Concurrent calls share one request, because the
   * backend's refresh tokens are single-use. Resolves `false` when the session could not be renewed.
   */
  renew: () => Promise<boolean>
  /** `fetch` with the Bearer header and renew-and-retry on `401`. */
  fetch: FetchLike
  url: (path: string) => string
  getAccessToken: () => string | null
}

/** Endpoints that are called without a session (and must never trigger a renewal). */
const PUBLIC_PATHS = new Set(['/login', '/signup', '/users/activate', '/token-renew'])

export function createHttpClient(options: HttpClientOptions): HttpClient {
  const { session } = options
  const baseUrl = absolutize(options.baseUrl).replace(/\/+$/, '')
  const baseFetch: FetchLike = options.fetch ?? ((request) => globalThis.fetch(request))
  const url = (path: string) => `${baseUrl}${path}`
  const basePath = new URL(
    baseUrl || '/',
    globalThis.location?.href ?? 'http://localhost',
  ).pathname.replace(/\/+$/, '')
  const isPublic = (request: Request) => PUBLIC_PATHS.has(pathOf(request.url, basePath))

  let inflightRenew: Promise<boolean> | null = null

  const renew = (): Promise<boolean> => {
    inflightRenew ??= doRenew().finally(() => {
      inflightRenew = null
    })
    return inflightRenew
  }

  async function doRenew(): Promise<boolean> {
    const refreshToken = session.refreshToken
    if (!refreshToken) return false

    let response: Response
    try {
      response = await baseFetch(
        new Request(url('/token-renew'), {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ token: refreshToken }),
        }),
      )
    } catch {
      // Offline or the server is down: the refresh token may still be good, so keep the session.
      return false
    }

    if (response.ok) {
      const body: unknown = await response.json().catch(() => null)
      const tokens = parseTokens(body)
      if (tokens) {
        session.setTokens(tokens)
        return true
      }
      return false
    }

    // The token was rejected (invalid, revoked or expired): the session is over. Other failures
    // (429, 5xx) are transient and do not end it.
    if (response.status === 400 || response.status === 401) {
      session.clear()
      options.onSessionExpired?.()
    }
    return false
  }

  const authedFetch: FetchLike = async (request) => {
    if (isPublic(request)) return baseFetch(request)

    const retry = request.clone() // the body of the original request is consumed by the first attempt
    const usedToken = session.accessToken
    const response = await baseFetch(withBearer(request, usedToken))

    if (response.status !== 401 || !session.refreshToken) return response

    // If another request already renewed the session while this one was in flight, just retry.
    const renewed =
      session.accessToken !== usedToken && session.accessToken !== null ? true : await renew()
    if (!renewed) return response

    return baseFetch(withBearer(retry, session.accessToken))
  }

  return {
    api: createClient<paths>({ baseUrl, fetch: authedFetch }),
    renew,
    fetch: authedFetch,
    url,
    getAccessToken: () => session.accessToken,
  }
}

/**
 * `fetch` and `Request` need absolute URLs outside a browser page, and a relative base (e.g. `/backend`, used by
 * the development proxy) resolves against the current origin.
 */
function absolutize(baseUrl: string): string {
  if (/^https?:\/\//i.test(baseUrl)) return baseUrl
  return new URL(baseUrl || '/', globalThis.location?.href ?? 'http://localhost').href
}

function withBearer(request: Request, token: string | null): Request {
  if (!token) return request
  const headers = new Headers(request.headers)
  headers.set('Authorization', `Bearer ${token}`)
  return new Request(request, { headers })
}

function pathOf(requestUrl: string, basePath: string): string {
  const { pathname } = new URL(requestUrl, globalThis.location?.href ?? 'http://localhost')
  return basePath && pathname.startsWith(basePath) ? pathname.slice(basePath.length) : pathname
}

function parseTokens(body: unknown): { accessToken: string; refreshToken: string } | null {
  if (typeof body !== 'object' || body === null) return null
  const { accessToken, refreshToken } = body as Record<string, unknown>
  return typeof accessToken === 'string' && typeof refreshToken === 'string'
    ? { accessToken, refreshToken }
    : null
}

/**
 * Awaits an `openapi-fetch` call and returns its data, turning every failure into an `ApiError`
 * (network problems included).
 */
export async function unwrap<D>(
  call: Promise<{ data?: D; error?: unknown; response: Response }>,
): Promise<D> {
  let result: { data?: D; error?: unknown; response: Response }
  try {
    result = await call
  } catch (cause) {
    throw ApiError.network(cause)
  }
  if (result.error !== undefined || !result.response.ok) {
    throw ApiError.fromResponse(result.response.status, result.error)
  }
  return result.data as D
}
