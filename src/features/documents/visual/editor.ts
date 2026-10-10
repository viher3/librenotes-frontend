import {
  Editor,
  defaultValueCtx,
  editorViewOptionsCtx,
  remarkCtx,
  remarkStringifyOptionsCtx,
  rootCtx,
} from '@milkdown/kit/core'
import { clipboard } from '@milkdown/kit/plugin/clipboard'
import { history } from '@milkdown/kit/plugin/history'
import { indent } from '@milkdown/kit/plugin/indent'
import { trailing } from '@milkdown/kit/plugin/trailing'
import { commonmark, linkAttr } from '@milkdown/kit/preset/commonmark'
import { gfm } from '@milkdown/kit/preset/gfm'
import { Plugin } from '@milkdown/kit/prose/state'
import { $prose, getMarkdown, replaceAll } from '@milkdown/kit/utils'
import { repairMarkdown, stringifyOptions } from './markdown'

type Mdast = { type?: string; children?: Mdast[]; [key: string]: unknown }

/** The syntax tree without what does not change the meaning (positions, tight/loose lists). */
function meaning(node: Mdast): unknown {
  const { position: _position, spread: _spread, children, ...rest } = node
  void _position
  void _spread
  return children ? { ...rest, children: children.map(meaning) } : rest
}

export interface VisualEditorOptions {
  root: HTMLElement
  value: string
  label: string
  /** Called with the new Markdown after the user changed something (never for the initial load). */
  onUserChange: (markdown: string) => void
  /** Extra Milkdown plugins (node views, menus). */
  plugins?: Parameters<Editor['use']>[0][]
}

/**
 * The visual editor. `replace` swaps the whole document from outside (not reported as a user change);
 * `markdown` reads the current document; `flush` reports a pending change now.
 */
export interface VisualEditorHandle {
  editor: Editor
  /**
   * Whether the document, written back by the editor, means exactly what it did when it was opened.
   * False for Markdown the editor cannot represent (it is then best edited as source).
   */
  lossless: boolean
  markdown: () => string
  replace: (markdown: string) => void
  /** Reports what was typed so far without waiting for the pause (before saving, hiding, leaving). */
  flush: () => void
  destroy: () => Promise<void>
}

/** How long typing must pause before the Markdown is written out (serialising a long page takes time). */
export const REPORT_DELAY_MS = 150

export async function createVisualEditor(
  options: VisualEditorOptions,
): Promise<VisualEditorHandle> {
  // While true, document changes come from outside (`replace`) and are not the user's.
  let external = false
  let timer: ReturnType<typeof setTimeout> | null = null
  let current: Editor | null = null
  // What the document last was, as Markdown: a change is reported only when the text really differs from it.
  // This also keeps editor-made changes (the empty paragraph after a final code block) from counting as edits.
  let baseline = options.value

  const report = () => {
    timer = null
    if (!current || external) return
    const markdown = current.action(getMarkdown())
    if (markdown === baseline) return
    baseline = markdown
    options.onUserChange(markdown)
  }

  const schedule = () => {
    if (timer !== null) clearTimeout(timer)
    timer = setTimeout(report, REPORT_DELAY_MS)
  }

  const flush = () => {
    if (timer === null) return
    clearTimeout(timer)
    report()
  }

  const watchChanges = $prose(
    () =>
      new Plugin({
        view: () => ({
          update: (view, previous) => {
            if (!external && !view.state.doc.eq(previous.doc)) schedule()
          },
        }),
      }),
  )

  const editor = Editor.make()
    .config((ctx) => {
      ctx.set(rootCtx, options.root)
      ctx.set(defaultValueCtx, options.value)
      ctx.set(remarkStringifyOptionsCtx, { ...stringifyOptions })
      ctx.update(editorViewOptionsCtx, (previous) => ({
        ...previous,
        attributes: {
          ...(previous.attributes as Record<string, string> | undefined),
          'aria-label': options.label,
          'aria-multiline': 'true',
          role: 'textbox',
          spellcheck: 'true',
        },
      }))
      ctx.set(linkAttr.key, () => ({ target: '_blank', rel: 'noopener noreferrer nofollow' }))
    })
    .use(repairMarkdown)
    .use(commonmark)
    .use(gfm)
    .use(history)
    .use(watchChanges)
    .use(clipboard)
    .use(indent)
    .use(trailing)
  for (const plugin of options.plugins ?? []) editor.use(plugin)
  await editor.create()
  current = editor

  const opened = editor.action(getMarkdown())
  const lossless = editor.action((ctx) => {
    const remark = ctx.get(remarkCtx)
    try {
      const before = meaning(remark.parse(options.value) as Mdast)
      const after = meaning(remark.parse(opened) as Mdast)
      return JSON.stringify(before) === JSON.stringify(after)
    } catch {
      return false
    }
  })
  // Compare later edits with how the editor itself writes the document, not with the file's original style.
  baseline = opened

  return {
    editor,
    lossless,
    markdown: () => editor.action(getMarkdown()),
    replace: (markdown) => {
      if (timer !== null) clearTimeout(timer)
      timer = null
      external = true
      try {
        editor.action(replaceAll(markdown))
        baseline = editor.action(getMarkdown())
      } finally {
        external = false
      }
    },
    flush,
    destroy: async () => {
      flush()
      current = null
      await editor.destroy()
    },
  }
}
