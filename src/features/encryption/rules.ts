import type { TFunction } from 'i18next'
import { isCryptoError } from '@/lib/crypto/errors'

/** Shortest password accepted for a document. There is no server to rate-limit guesses, so length is the defence. */
export const MIN_DOCUMENT_PASSWORD_LENGTH = 10

/** What to tell the user about a failure while encrypting or decrypting. */
export function cryptoErrorMessage(t: TFunction<'encryption'>, error: unknown): string {
  if (isCryptoError(error)) {
    if (error.code === 'wrong_password') return t('errors.wrongPassword')
    if (error.code === 'unsupported') return t('errors.unsupported')
    return t('errors.malformed')
  }
  return t('errors.failed')
}
