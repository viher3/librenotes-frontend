import type { ID } from '@/data/types'

const key = (id: ID) => `librenotes.draft.${id}`

/**
 * An unsaved edit kept on this device, so that a crash or an accidental reload does not lose it. It is only
 * valid while the server still has the version it was started from (`base`). Never used for encrypted
 * documents: their plaintext must not be written to disk.
 */
export function loadDraft(id: ID, base: string): string | null {
  try {
    const raw = localStorage.getItem(key(id))
    if (!raw) return null
    const stored = JSON.parse(raw) as { base?: unknown; content?: unknown }
    if (stored.base !== base || typeof stored.content !== 'string' || stored.content === base)
      return null
    return stored.content
  } catch {
    return null
  }
}

export function storeDraft(id: ID, base: string, content: string) {
  try {
    localStorage.setItem(key(id), JSON.stringify({ base, content }))
  } catch {
    /* storage unavailable or full: the draft just will not be kept */
  }
}

export function clearDraft(id: ID) {
  try {
    localStorage.removeItem(key(id))
  } catch {
    /* nothing to clear */
  }
}
