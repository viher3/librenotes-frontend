import i18n from 'i18next'
import { isApiError } from '@/data/errors'

/**
 * Text for a failure of the data layer, in the active language. Backend error codes map to the `errors`
 * namespace (`note.not_found` -> `errors:note.not_found`); anything unknown falls back to a generic message.
 */
export function errorMessage(error: unknown): string {
  const code = isApiError(error) ? error.code : 'unknown'
  const key = `errors:${code}`
  return i18n.exists(key) ? i18n.t(key as never) : i18n.t('errors:unknown' as never)
}
