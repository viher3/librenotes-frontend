import { describe, expect, it, vi } from 'vitest'
import { ApiError } from '../errors'
import { FakeXhr, createFakeXhr, lastXhr } from '@/test/fakeXhr'
import { uploadFile } from './upload'

const file = new File(['hello'], 'hello.txt', { type: 'text/plain' })
const createXhr = createFakeXhr
const last = lastXhr

describe('uploadFile', () => {
  it('posts the file as multipart with the token, reports progress and resolves with the body', async () => {
    FakeXhr.instances = []
    const onProgress = vi.fn()

    const promise = uploadFile(
      'http://api.test/notes/n1/attachments',
      file,
      { getAccessToken: () => 'tok', renew: vi.fn(), createXhr },
      { onProgress },
    )
    const xhr = last()
    xhr.upload.onprogress?.({ lengthComputable: true, loaded: 25, total: 100 })
    xhr.upload.onprogress?.({ lengthComputable: false, loaded: 0, total: 0 })
    xhr.respond(201, { id: 'a1' })

    await expect(promise).resolves.toEqual({ id: 'a1' })
    expect(xhr.method).toBe('POST')
    expect(xhr.url).toBe('http://api.test/notes/n1/attachments')
    expect(xhr.headers.Authorization).toBe('Bearer tok')
    expect((xhr.body as FormData).get('file')).toBeInstanceOf(File)
    expect(onProgress.mock.calls.map(([f]) => f)).toEqual([0.25, 1])
  })

  it('renews the session and retries once on 401', async () => {
    FakeXhr.instances = []
    let token = 'old'
    const renew = vi.fn(async () => {
      token = 'new'
      return true
    })

    const promise = uploadFile('http://api.test/x', file, {
      getAccessToken: () => token,
      renew,
      createXhr,
    })
    last().respond(401, { code: 'jwt.expired', message: 'x', params: [], status: 401 })
    await vi.waitFor(() => expect(FakeXhr.instances).toHaveLength(2))
    last().respond(201, { id: 'a1' })

    await expect(promise).resolves.toEqual({ id: 'a1' })
    expect(renew).toHaveBeenCalledTimes(1)
    expect(FakeXhr.instances.map((x) => x.headers.Authorization)).toEqual([
      'Bearer old',
      'Bearer new',
    ])
  })

  it('maps server errors to ApiError', async () => {
    FakeXhr.instances = []
    const promise = uploadFile('http://api.test/x', file, {
      getAccessToken: () => 't',
      renew: vi.fn(async () => false),
      createXhr,
    })
    last().respond(422, {
      code: 'attachment.too_large',
      message: 'big',
      params: { max_bytes: 5 },
      status: 422,
    })

    await expect(promise).rejects.toMatchObject({
      status: 422,
      code: 'attachment.too_large',
      params: { max_bytes: 5 },
    })
  })

  it('reports network failures and aborts', async () => {
    FakeXhr.instances = []
    const failing = uploadFile('http://api.test/x', file, {
      getAccessToken: () => 't',
      renew: vi.fn(),
      createXhr,
    })
    last().onerror?.()
    await expect(failing).rejects.toMatchObject({ code: 'network_error' })

    const controller = new AbortController()
    const cancelled = uploadFile(
      'http://api.test/x',
      file,
      { getAccessToken: () => 't', renew: vi.fn(), createXhr },
      { signal: controller.signal },
    )
    controller.abort()
    await expect(cancelled).rejects.toMatchObject({ code: 'aborted' })
    expect(last().aborted).toBe(true)

    const already = new AbortController()
    already.abort()
    await expect(
      uploadFile(
        'http://api.test/x',
        file,
        { getAccessToken: () => 't', renew: vi.fn(), createXhr },
        { signal: already.signal },
      ),
    ).rejects.toBeInstanceOf(ApiError)
  })
})
