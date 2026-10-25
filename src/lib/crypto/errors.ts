export type CryptoErrorCode =
  /** Wrong password, or the content was altered: AES-GCM cannot tell them apart. */
  | 'wrong_password'
  /** Not an envelope this version of the app understands. */
  | 'unsupported'
  | 'malformed'

export class CryptoError extends Error {
  readonly code: CryptoErrorCode

  constructor(code: CryptoErrorCode) {
    super(`crypto.${code}`)
    this.name = 'CryptoError'
    this.code = code
  }
}

export const isCryptoError = (error: unknown): error is CryptoError => error instanceof CryptoError
