import { describe, expect, it } from 'vitest'
import { resources } from '@/lib/i18n'

type Tree = { [key: string]: string | Tree }

function flatten(tree: Tree, prefix = ''): Record<string, string> {
  return Object.entries(tree).reduce<Record<string, string>>((all, [key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key
    return typeof value === 'string'
      ? { ...all, [path]: value }
      : { ...all, ...flatten(value, path) }
  }, {})
}

// Plural suffixes differ by language (English has `_one`/`_other`, Spanish may add `_many`): compare the base key.
const baseKey = (key: string) => key.replace(/_(zero|one|two|few|many|other)$/, '')
const placeholders = (text: string) =>
  [...text.matchAll(/{{\s*(\w+)\s*}}/g)].map((m) => m[1]).sort()

const namespaces = Object.keys(resources.en) as (keyof typeof resources.en)[]

describe('translations', () => {
  it('have the same namespaces in every language', () => {
    expect(Object.keys(resources.es).sort()).toEqual(Object.keys(resources.en).sort())
  })

  describe.each(namespaces)('%s', (namespace) => {
    const en = flatten(resources.en[namespace] as Tree)
    const es = flatten(resources.es[namespace] as Tree)

    it('has the same keys in Spanish and English', () => {
      expect([...new Set(Object.keys(es).map(baseKey))].sort()).toEqual(
        [...new Set(Object.keys(en).map(baseKey))].sort(),
      )
    })

    it('has no empty texts', () => {
      for (const [key, value] of [...Object.entries(en), ...Object.entries(es)])
        expect(value.trim(), key).not.toBe('')
    })

    it('uses the same placeholders in both', () => {
      for (const key of Object.keys(en)) {
        if (!(key in es)) continue
        expect(placeholders(es[key]), key).toEqual(placeholders(en[key]))
      }
    })

    it('is actually translated (no Spanish text left identical to the English one, but for names)', () => {
      const same = Object.keys(en).filter(
        (key) => key in es && es[key] === en[key] && /[a-z]{4,}/i.test(en[key]),
      )
      // Allowed: product names, units and similar that read the same in both languages.
      const allowed = new Set(['appName', 'language.en', 'language.es', 'shortcut'])
      expect(same.filter((key) => !allowed.has(key))).toEqual([])
    })
  })
})
