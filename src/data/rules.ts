// Business rules enforced by the backend, mirrored here so forms can validate before sending and the mock
// adapter behaves like the real API. The backend remains the authority.

export const MAX_TAGS = 20
export const MAX_TAG_LENGTH = 50
export const MAX_TITLE_LENGTH = 255
export const MAX_URL_LENGTH = 2048
export const MIN_SEARCH_LENGTH = 2
export const MIN_PASSWORD_LENGTH = 8
export const USERNAME_LENGTH = { min: 3, max: 20 } as const

/** Trims and lower-cases a tag name, as the backend does. */
export const normalizeTag = (name: string): string => name.trim().toLowerCase()

export type TagsProblem = 'empty' | 'too_long' | 'too_many'

/**
 * Normalizes a list of tags (trim, lower-case, drop duplicates keeping first appearance) and reports the
 * first rule it breaks, if any.
 */
export function normalizeTags(names: readonly string[]): {
  tags: string[]
  problem: TagsProblem | null
} {
  const tags: string[] = []
  for (const name of names) {
    const tag = normalizeTag(name)
    if (tag === '') return { tags, problem: 'empty' }
    if ([...tag].length > MAX_TAG_LENGTH) return { tags, problem: 'too_long' }
    if (!tags.includes(tag)) tags.push(tag)
  }
  return { tags, problem: tags.length > MAX_TAGS ? 'too_many' : null }
}

/** Loose email check: something@something.tld without spaces (the server decides the rest). */
export const isEmail = (value: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())

/** Absolute http(s) URL with a host and no whitespace, up to 2048 characters. */
export function isHttpUrl(value: string): boolean {
  const url = value.trim()
  if (url === '' || url.length > MAX_URL_LENGTH || /\s/.test(url)) return false
  try {
    const parsed = new URL(url)
    return (parsed.protocol === 'http:' || parsed.protocol === 'https:') && parsed.hostname !== ''
  } catch {
    return false
  }
}

/** Lower-cases and strips accents, so "Reunión" matches "reunion". */
export const foldForSearch = (text: string): string =>
  text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
