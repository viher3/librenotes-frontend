import { SessionStore } from '@/data/session'

export interface RecordedCall {
  method: string
  path: string
  query: URLSearchParams
  headers: Headers
  body: unknown
}

type Handler = (call: RecordedCall) => Response | Promise<Response>

export const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

export const apiError = (status: number, code: string, message = code): Response =>
  json({ code, message, params: [], status }, status)

/**
 * A scripted `fetch`: routes are keyed `"METHOD /path"`; a route may be a handler or a list of
 * handlers consumed in order (the last one repeats). Every request is recorded in `calls`.
 */
export function createFakeServer(
  routes: Record<string, Handler | Handler[]>,
  baseUrl = 'http://api.test',
) {
  const calls: RecordedCall[] = []
  const counters = new Map<string, number>()

  const fetch = async (request: Request): Promise<Response> => {
    const url = new URL(request.url)
    const path = url.pathname.startsWith(new URL(baseUrl).pathname.replace(/\/$/, ''))
      ? url.pathname.slice(new URL(baseUrl).pathname.replace(/\/$/, '').length) || '/'
      : url.pathname
    const text =
      request.method === 'GET' || request.method === 'HEAD' ? '' : await request.clone().text()
    let body: unknown = text
    try {
      body = text ? JSON.parse(text) : null
    } catch {
      /* keep raw text (multipart...) */
    }
    const call: RecordedCall = {
      method: request.method,
      path,
      query: url.searchParams,
      headers: request.headers,
      body,
    }
    calls.push(call)

    const key = `${request.method} ${path}`
    const route = routes[key]
    if (!route) return apiError(404, 'not_found_http_exception', `No route for ${key}`)
    const handlers = Array.isArray(route) ? route : [route]
    const index = Math.min(counters.get(key) ?? 0, handlers.length - 1)
    counters.set(key, (counters.get(key) ?? 0) + 1)
    return handlers[index](call)
  }

  return {
    fetch,
    calls,
    callsTo: (key: string) => calls.filter((c) => `${c.method} ${c.path}` === key),
  }
}

/** A session store backed by a plain in-memory object instead of `localStorage`. */
export function memorySession(initialRefreshToken?: string): {
  session: SessionStore
  storage: Map<string, string>
} {
  const storage = new Map<string, string>()
  if (initialRefreshToken) storage.set('librenotes.refreshToken', initialRefreshToken)
  const session = new SessionStore({
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => void storage.set(key, value),
    removeItem: (key) => void storage.delete(key),
  })
  return { session, storage }
}
