import { ApiError } from '../errors'
import type { UploadOptions } from '../types'

export interface UploadDeps {
  getAccessToken: () => string | null
  renew: () => Promise<boolean>
  /** Replaceable in tests. */
  createXhr?: () => XMLHttpRequest
}

interface Outcome {
  status: number
  body: unknown
}

/**
 * Multipart upload of one file (`file` field) with progress reporting, which `fetch` cannot do.
 * Like the regular client, it renews the session once and retries when the server answers `401`.
 * Resolves with the parsed JSON body of a successful response.
 */
export async function uploadFile(
  url: string,
  file: File,
  deps: UploadDeps,
  options: UploadOptions = {},
): Promise<unknown> {
  if (options.signal?.aborted) throw new ApiError({ status: 0, code: 'aborted' })

  let outcome = await send(url, file, deps, options)

  if (outcome.status === 401 && (await deps.renew())) {
    outcome = await send(url, file, deps, options)
  }

  if (outcome.status >= 200 && outcome.status < 300) return outcome.body
  throw ApiError.fromResponse(outcome.status, outcome.body)
}

function send(url: string, file: File, deps: UploadDeps, options: UploadOptions): Promise<Outcome> {
  return new Promise((resolve, reject) => {
    const xhr = deps.createXhr?.() ?? new XMLHttpRequest()
    const form = new FormData()
    form.append('file', file)

    xhr.open('POST', url)
    xhr.setRequestHeader('Accept', 'application/json')
    const token = deps.getAccessToken()
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`)

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0)
        options.onProgress?.(event.loaded / event.total)
    }
    xhr.onload = () => {
      options.onProgress?.(1)
      resolve({ status: xhr.status, body: parseJson(xhr.responseText) })
    }
    xhr.onerror = () => reject(ApiError.network(new Error('Network request failed')))
    xhr.onabort = () => reject(new ApiError({ status: 0, code: 'aborted' }))

    options.signal?.addEventListener('abort', () => xhr.abort(), { once: true })
    xhr.send(form)
  })
}

function parseJson(text: string): unknown {
  try {
    return text ? JSON.parse(text) : null
  } catch {
    return null
  }
}
