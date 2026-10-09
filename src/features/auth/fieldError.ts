import i18n from 'i18next'

/**
 * Validation schemas report i18n keys (`validation.required`); server messages are already text.
 * Turns either into text for the active language.
 */
export function fieldError(
  message: string | undefined,
  options?: Record<string, unknown>,
): string | undefined {
  if (!message) return undefined
  return message.startsWith('validation.')
    ? String(i18n.t(message as never, options as never))
    : message
}
