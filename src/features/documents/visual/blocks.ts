import type { Editor } from '@milkdown/kit/core'
import { editorViewCtx } from '@milkdown/kit/core'
import {
  createCodeBlockCommand,
  insertHrCommand,
  toggleEmphasisCommand,
  toggleInlineCodeCommand,
  toggleLinkCommand,
  toggleStrongCommand,
  wrapInBlockquoteCommand,
  wrapInBulletListCommand,
  wrapInHeadingCommand,
  wrapInOrderedListCommand,
} from '@milkdown/kit/preset/commonmark'
import { insertTableCommand, toggleStrikethroughCommand } from '@milkdown/kit/preset/gfm'
import { callCommand } from '@milkdown/kit/utils'

export type BlockId =
  | 'heading1'
  | 'heading2'
  | 'heading3'
  | 'bullet'
  | 'numbered'
  | 'task'
  | 'quote'
  | 'code'
  | 'divider'
  | 'table'

/** In the order shown in the slash menu. */
export const BLOCKS: BlockId[] = [
  'heading1',
  'heading2',
  'heading3',
  'bullet',
  'numbered',
  'task',
  'quote',
  'code',
  'table',
  'divider',
]

export type MarkId = 'bold' | 'italic' | 'strike' | 'code' | 'link'

/** The schema names of the marks, as the toolbar reports them back. */
export const MARK_NAMES: Record<MarkId, string> = {
  bold: 'strong',
  italic: 'emphasis',
  strike: 'strike_through',
  code: 'inlineCode',
  link: 'link',
}

export function runBlock(editor: Editor, id: BlockId) {
  switch (id) {
    case 'heading1':
    case 'heading2':
    case 'heading3':
      editor.action(callCommand(wrapInHeadingCommand.key, Number(id.slice(-1))))
      return
    case 'bullet':
      editor.action(callCommand(wrapInBulletListCommand.key))
      return
    case 'numbered':
      editor.action(callCommand(wrapInOrderedListCommand.key))
      return
    case 'task':
      editor.action(callCommand(wrapInBulletListCommand.key))
      editor.action((ctx) => {
        const view = ctx.get(editorViewCtx)
        const { $from } = view.state.selection
        for (let depth = $from.depth; depth > 0; depth -= 1) {
          const node = $from.node(depth)
          if (node.type.name === 'list_item') {
            view.dispatch(
              view.state.tr.setNodeMarkup($from.before(depth), undefined, {
                ...node.attrs,
                checked: false,
              }),
            )
            return
          }
        }
      })
      return
    case 'quote':
      editor.action(callCommand(wrapInBlockquoteCommand.key))
      return
    case 'code':
      editor.action(callCommand(createCodeBlockCommand.key))
      return
    case 'table':
      editor.action(callCommand(insertTableCommand.key, { row: 3, col: 3 }))
      return
    case 'divider':
      editor.action(callCommand(insertHrCommand.key))
      return
  }
}

export function runMark(editor: Editor, id: MarkId, href?: string) {
  switch (id) {
    case 'bold':
      return editor.action(callCommand(toggleStrongCommand.key))
    case 'italic':
      return editor.action(callCommand(toggleEmphasisCommand.key))
    case 'strike':
      return editor.action(callCommand(toggleStrikethroughCommand.key))
    case 'code':
      return editor.action(callCommand(toggleInlineCodeCommand.key))
    case 'link':
      return editor.action(callCommand(toggleLinkCommand.key, { href: href ?? '' }))
  }
}
