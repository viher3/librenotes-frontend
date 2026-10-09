/**
 * Every failure of the data layer. `code` is the backend's stable identifier (`note.not_found`,
 * `security.bad_credentials`...) or one generated here: `network_error`, `validation_error`,
 * `invalid_response`, `aborted`, `http_<status>`. Use it as a translation key.
 */
export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly params: Record<string, unknown>
  /** Field-level messages of a `400` validation failure, as `"[field] message"`. */
  readonly errors: string[]

  constructor(init: {
    status: number
    code: string
    message?: string
    params?: Record<string, unknown>
    errors?: string[]
  }) {
    super(init.message ?? init.code)
    this.name = 'ApiError'
    this.status = init.status
    this.code = init.code
    this.params = init.params ?? {}
    this.errors = init.errors ?? []
  }

  /** Builds an error from a failed response. `body` is the parsed JSON, when there was one. */
  static fromResponse(status: number, body: unknown): ApiError {
    if (isRecord(body)) {
      // The backend's authenticator answers 401 with `type` instead of `code` (every other error uses `code`).
      const code =
        typeof body.code === 'string' ? body.code : typeof body.type === 'string' ? body.type : null
      if (code !== null) {
        return new ApiError({
          status,
          code,
          message: typeof body.message === 'string' ? body.message : undefined,
          params: isRecord(body.params) ? body.params : undefined,
        })
      }
      if (Array.isArray(body.errors)) {
        return new ApiError({
          status,
          code: 'validation_error',
          errors: body.errors.filter((e): e is string => typeof e === 'string'),
        })
      }
    }
    return new ApiError({ status, code: `http_${status}` })
  }

  static network(cause: unknown): ApiError {
    if (cause instanceof DOMException && cause.name === 'AbortError') {
      return new ApiError({ status: 0, code: 'aborted' })
    }
    return new ApiError({
      status: 0,
      code: 'network_error',
      message: cause instanceof Error ? cause.message : undefined,
    })
  }

  static invalidResponse(detail: string): ApiError {
    return new ApiError({ status: 0, code: 'invalid_response', message: detail })
  }
}

export const isApiError = (error: unknown): error is ApiError => error instanceof ApiError

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
