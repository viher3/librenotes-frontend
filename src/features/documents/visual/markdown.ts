import type { Root, RootContent } from 'mdast'
import { $remark } from '@milkdown/kit/utils'
import { isSafeUrl } from './urls'

/** How Milkdown writes Markdown back. Fixed, so a document is always normalised the same way. */
export const stringifyOptions = {
  bullet: '-',
  bulletOther: '*',
  rule: '-',
  emphasis: '_',
  strong: '*',
  fence: '`',
  fences: true,
  listItemIndent: 'one',
  incrementListMarker: true,
} as const

type Node = RootContent & {
  children?: Node[]
  url?: string
  title?: string | null
  position?: { start: { offset?: number }; end: { offset?: number } }
}

/**
 * Two repairs on the parsed document, before it becomes editor nodes:
 *
 * 1. A link or image whose address is not allowed becomes an inert `html` node holding its original source:
 *    it is shown as text and written back unchanged.
 * 2. An image without a title has `title: null`, which the schema rejects: it becomes an empty title.
 */
export const repairMarkdown = $remark(
  'repairMarkdown',
  () => () => (tree: Root, file: { value?: unknown }) => {
    const source = typeof file.value === 'string' ? file.value : null

    const visit = (parent: { children?: Node[] }) => {
      parent.children?.forEach((child, index) => {
        if (child.type === 'link' || child.type === 'image') {
          const kind = child.type
          if (!isSafeUrl(child.url ?? '', kind)) {
            const start = child.position?.start.offset
            const end = child.position?.end.offset
            const raw =
              source !== null && start !== undefined && end !== undefined
                ? source.slice(start, end)
                : `${kind === 'image' ? '!' : ''}[](${child.url ?? ''})`
            ;(parent.children as Node[])[index] = { type: 'html', value: raw } as Node
            return
          }
          if (kind === 'image') child.title ??= ''
        }
        visit(child)
      })
    }
    visit(tree as { children?: Node[] })
  },
)
