import { describe, expect, it } from 'vitest'
import { foldForSearch, isHttpUrl, normalizeTags } from './rules'

describe('normalizeTags', () => {
  it('trims, lower-cases and deduplicates keeping the first appearance', () => {
    expect(normalizeTags(['Work', ' work ', 'Ideas'])).toEqual({
      tags: ['work', 'ideas'],
      problem: null,
    })
  })

  it('reports empty, too long and too many tags', () => {
    expect(normalizeTags(['ok', '  '])).toMatchObject({ problem: 'empty' })
    expect(normalizeTags(['a'.repeat(51)])).toMatchObject({ problem: 'too_long' })
    expect(normalizeTags(['a'.repeat(50)]).problem).toBeNull()
    expect(normalizeTags(Array.from({ length: 21 }, (_, i) => `t${i}`)).problem).toBe('too_many')
    expect(normalizeTags(Array.from({ length: 20 }, (_, i) => `t${i}`)).problem).toBeNull()
  })
})

describe('isHttpUrl', () => {
  it('accepts absolute http and https URLs', () => {
    for (const url of [
      'http://example.com',
      'HTTPS://Example.com/a?b=c#d',
      'https://example.com:8443/path',
    ]) {
      expect(isHttpUrl(url), url).toBe(true)
    }
  })

  it('rejects anything else', () => {
    for (const url of [
      'javascript:alert(1)',
      'data:text/html;base64,AAAA',
      'ftp://example.com',
      'example.com',
      '//example.com',
      'https://',
      'https://exa mple.com',
      'file:///etc/passwd',
      '',
    ]) {
      expect(isHttpUrl(url), url).toBe(false)
    }
    expect(isHttpUrl(`https://a.co/${'x'.repeat(2048)}`)).toBe(false)
  })
})

describe('foldForSearch', () => {
  it('ignores case and accents', () => {
    expect(foldForSearch('Reunión de PLANIFICACIÓN')).toBe('reunion de planificacion')
  })
})
