import { describe, expect, it } from 'vitest'
import { formatDateTime, formatRelativeTime } from './format'

const now = new Date('2026-10-09T12:00:00Z').getTime()
const ago = (seconds: number) => new Date(now - seconds * 1000).toISOString()

describe('formatRelativeTime', () => {
  it('uses the largest fitting unit, in the requested language', () => {
    expect(formatRelativeTime(ago(10), 'en', now)).toBe('now')
    expect(formatRelativeTime(ago(5 * 60), 'en', now)).toBe('5 minutes ago')
    expect(formatRelativeTime(ago(3 * 3600), 'en', now)).toBe('3 hours ago')
    expect(formatRelativeTime(ago(24 * 3600), 'en', now)).toBe('yesterday')
    expect(formatRelativeTime(ago(3 * 24 * 3600), 'en', now)).toBe('3 days ago')
    expect(formatRelativeTime(ago(14 * 24 * 3600), 'en', now)).toBe('2 weeks ago')
    expect(formatRelativeTime(ago(5 * 60), 'es', now)).toBe('hace 5 minutos')
  })

  it('tolerates invalid dates', () => {
    expect(formatRelativeTime('nope', 'en', now)).toBe('')
    expect(formatDateTime('nope', 'en')).toBe('')
  })
})

describe('formatDateTime', () => {
  it('formats in the requested language', () => {
    expect(formatDateTime('2026-10-09T12:00:00Z', 'en')).toMatch(/Oct\s+9,\s+2026/)
    expect(formatDateTime('2026-10-09T12:00:00Z', 'es')).toMatch(/9\s+oct\.?\s+2026/)
  })
})
