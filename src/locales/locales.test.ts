import { resources } from '@/lib/i18n'

const flatKeys = (obj: object, prefix = ''): string[] =>
  Object.entries(obj).flatMap(([k, v]) =>
    typeof v === 'object' && v !== null ? flatKeys(v, `${prefix}${k}.`) : [`${prefix}${k}`],
  )

describe('locales', () => {
  it('es and en have the same keys in every namespace', () => {
    for (const ns of Object.keys(resources.es) as (keyof typeof resources.es)[]) {
      expect(flatKeys(resources.es[ns]).sort()).toEqual(flatKeys(resources.en[ns]).sort())
    }
  })
})
