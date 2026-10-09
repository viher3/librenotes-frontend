import { describe, expect, it, vi } from 'vitest'
import { ApiError } from '../errors'
import { apiError, createFakeServer, json, memorySession } from '@/test/fakeServer'
import { createHttpClient, unwrap } from './client'

const tokens = (n: number) => ({ accessToken: `access-${n}`, refreshToken: `refresh-${n}` })

function setup(
  routes: Parameters<typeof createFakeServer>[0],
  opts: { refresh?: string; access?: string } = {},
) {
  const server = createFakeServer(routes)
  const { session, storage } = memorySession(opts.refresh)
  if (opts.access)
    session.setTokens({ accessToken: opts.access, refreshToken: opts.refresh ?? 'refresh-1' })
  const onSessionExpired = vi.fn()
  const client = createHttpClient({
    baseUrl: 'http://api.test',
    session,
    fetch: server.fetch,
    onSessionExpired,
  })
  return { server, session, storage, client, onSessionExpired }
}

describe('http client', () => {
  it('sends the access token as a Bearer header', async () => {
    const { client, server } = setup(
      { 'GET /tags': () => json({ data: [] }) },
      { access: 'access-1', refresh: 'refresh-1' },
    )

    await unwrap(client.api.GET('/tags'))

    expect(server.calls[0].headers.get('Authorization')).toBe('Bearer access-1')
  })

  it('does not send credentials to public endpoints, nor try to renew on their 401', async () => {
    const { client, server } = setup(
      { 'POST /login': () => apiError(401, 'security.bad_credentials') },
      { access: 'access-1', refresh: 'refresh-1' },
    )

    await expect(
      unwrap(client.api.POST('/login', { body: { email: 'a@b.co', password: 'x' } })),
    ).rejects.toMatchObject({
      code: 'security.bad_credentials',
      status: 401,
    })

    expect(server.calls).toHaveLength(1)
    expect(server.calls[0].headers.get('Authorization')).toBeNull()
  })

  it('renews the session on 401 and retries the request with the new token, keeping its body', async () => {
    const { client, server, session } = setup(
      {
        'POST /notes': [() => apiError(401, 'jwt.expired'), () => json({ id: 'n1' }, 201)],
        'PUT /token-renew': () => json(tokens(2)),
      },
      { access: 'access-1', refresh: 'refresh-1' },
    )

    const result = await unwrap(client.api.POST('/notes', { body: { title: 'Hello' } }))

    expect(result).toEqual({ id: 'n1' })
    expect(server.callsTo('PUT /token-renew')[0].body).toEqual({ token: 'refresh-1' })
    const [first, second] = server.callsTo('POST /notes')
    expect(first.headers.get('Authorization')).toBe('Bearer access-1')
    expect(second.headers.get('Authorization')).toBe('Bearer access-2')
    expect(second.body).toEqual({ title: 'Hello' })
    expect(session.accessToken).toBe('access-2')
    expect(session.refreshToken).toBe('refresh-2')
  })

  it('shares a single renewal among concurrent 401s (refresh tokens are single-use)', async () => {
    let release!: () => void
    const gate = new Promise<void>((resolve) => (release = resolve))
    const { client, server } = setup(
      {
        'GET /tags': (call) =>
          call.headers.get('Authorization') === 'Bearer access-2'
            ? json({ data: [] })
            : apiError(401, 'jwt.expired'),
        'PUT /token-renew': async () => {
          await gate
          return json(tokens(2))
        },
      },
      { access: 'access-1', refresh: 'refresh-1' },
    )

    const requests = [1, 2, 3].map(() => unwrap(client.api.GET('/tags')))
    await vi.waitFor(() => expect(server.callsTo('GET /tags')).toHaveLength(3))
    release()
    const results = await Promise.all(requests)

    expect(results).toHaveLength(3)
    expect(server.callsTo('PUT /token-renew')).toHaveLength(1)
    expect(server.callsTo('GET /tags')).toHaveLength(6)
  })

  it('retries without renewing again when another request already renewed the session', async () => {
    let release!: () => void
    const gate = new Promise<void>((resolve) => (release = resolve))
    const { client, server, session } = setup(
      {
        'GET /tags': async (call) => {
          if (call.headers.get('Authorization') === 'Bearer access-2') return json({ data: [] })
          await gate // a slow request that started with the old token
          return apiError(401, 'jwt.expired')
        },
        'PUT /token-renew': () => json(tokens(2)),
      },
      { access: 'access-1', refresh: 'refresh-1' },
    )

    const slow = unwrap(client.api.GET('/tags'))
    await vi.waitFor(() => expect(server.callsTo('GET /tags')).toHaveLength(1))
    // Someone else renews in the meantime.
    expect(await client.renew()).toBe(true)
    expect(session.accessToken).toBe('access-2')
    release()
    await slow

    expect(server.callsTo('PUT /token-renew')).toHaveLength(1)
  })

  it('clears the session and reports it when the refresh token is rejected', async () => {
    const { client, session, storage, onSessionExpired } = setup(
      {
        'GET /me': () => apiError(401, 'jwt.expired'),
        'PUT /token-renew': () => apiError(401, 'security.invalid_token'),
      },
      { access: 'access-1', refresh: 'refresh-1' },
    )

    await expect(unwrap(client.api.GET('/me'))).rejects.toMatchObject({
      status: 401,
      code: 'jwt.expired',
    })

    expect(session.hasSession).toBe(false)
    expect(storage.has('librenotes.refreshToken')).toBe(false)
    expect(onSessionExpired).toHaveBeenCalledTimes(1)
  })

  it('keeps the session when renewal fails for transient reasons (offline, 429, 5xx)', async () => {
    for (const renew of [
      () => Promise.reject(new TypeError('Failed to fetch')),
      () => apiError(429, 'too_many_attempts'),
      () => apiError(500, 'internal_error'),
    ]) {
      const { client, session, onSessionExpired } = setup(
        { 'GET /me': () => apiError(401, 'jwt.expired'), 'PUT /token-renew': renew },
        { access: 'access-1', refresh: 'refresh-1' },
      )

      await expect(unwrap(client.api.GET('/me'))).rejects.toMatchObject({ status: 401 })

      expect(session.refreshToken).toBe('refresh-1')
      expect(onSessionExpired).not.toHaveBeenCalled()
    }
  })

  it('does not try to renew when there is no refresh token', async () => {
    const { client, server } = setup({ 'GET /me': () => apiError(401, 'jwt.expired') })

    await expect(unwrap(client.api.GET('/me'))).rejects.toMatchObject({ status: 401 })

    expect(server.callsTo('PUT /token-renew')).toHaveLength(0)
  })

  it('resumes with a stored refresh token even though there is no access token yet', async () => {
    const { client, session } = setup(
      {
        'GET /me': (call) =>
          call.headers.get('Authorization') === 'Bearer access-2'
            ? json({ ok: true })
            : apiError(401, 'jwt.missing'),
        'PUT /token-renew': () => json(tokens(2)),
      },
      { refresh: 'refresh-1' },
    )

    await unwrap(client.api.GET('/me'))

    expect(session.accessToken).toBe('access-2')
  })

  it('treats a malformed renewal response as a failed renewal', async () => {
    const { client } = setup(
      {
        'GET /me': () => apiError(401, 'jwt.expired'),
        'PUT /token-renew': () => json({ nope: true }),
      },
      { access: 'access-1', refresh: 'refresh-1' },
    )

    expect(await client.renew()).toBe(false)
  })

  it('works when the API lives under a path prefix', async () => {
    const server = createFakeServer(
      { 'POST /login': () => apiError(401, 'security.bad_credentials') },
      'http://api.test/api',
    )
    const { session } = memorySession('refresh-1')
    const client = createHttpClient({
      baseUrl: 'http://api.test/api/',
      session,
      fetch: server.fetch,
    })

    await expect(
      unwrap(client.api.POST('/login', { body: { email: 'a@b.co', password: 'x' } })),
    ).rejects.toMatchObject({
      code: 'security.bad_credentials',
    })

    expect(server.calls).toHaveLength(1) // no renewal attempted for a public path under the prefix
    expect(client.url('/x')).toBe('http://api.test/api/x')
  })
})

describe('relative base URL', () => {
  it('resolves against the current origin (development proxy)', async () => {
    const server = createFakeServer(
      { 'GET /tags': () => json({ data: [] }) },
      `${location.origin}/backend`,
    )
    const { session } = memorySession()
    const client = createHttpClient({ baseUrl: '/backend', session, fetch: server.fetch })

    await unwrap(client.api.GET('/tags'))

    expect(client.url('/x')).toBe(`${location.origin}/backend/x`)
    expect(server.calls[0].path).toBe('/tags')
  })
})

describe('unwrap', () => {
  it("reads the error code from `type` too (the backend's authenticator uses it on 401)", async () => {
    const { client } = setup({
      'GET /me': () =>
        json(
          {
            type: 'security.unauthenticated',
            message: 'Authentication required.',
            params: [],
            status: 401,
          },
          401,
        ),
    })

    await expect(unwrap(client.api.GET('/me'))).rejects.toMatchObject({
      status: 401,
      code: 'security.unauthenticated',
    })
  })

  it('maps backend errors, validation errors and network failures to ApiError', async () => {
    const { client } = setup(
      {
        'GET /notes/{id}': () => apiError(404, 'note.not_found'),
        'POST /notes': () => json({ errors: ['[title] The property title is required'] }, 400),
        'GET /tags': () => Promise.reject(new TypeError('Failed to fetch')),
      },
      { access: 'a', refresh: 'r' },
    )

    // the path template does not match the fake route key, so request the concrete URL
    await expect(
      unwrap(client.api.GET('/notes/{id}', { params: { path: { id: 'x' } } })),
    ).rejects.toMatchObject({
      status: 404,
    })
    await expect(unwrap(client.api.POST('/notes', { body: { title: '' } }))).rejects.toMatchObject({
      code: 'validation_error',
      errors: ['[title] The property title is required'],
    })
    const network = await unwrap(client.api.GET('/tags')).catch((e: unknown) => e)
    expect(network).toBeInstanceOf(ApiError)
    expect(network).toMatchObject({ code: 'network_error', status: 0 })
  })
})
