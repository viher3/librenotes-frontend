import { $prose } from '@milkdown/kit/utils'
import { Plugin, PluginKey, TextSelection } from '@milkdown/kit/prose/state'
import { Decoration, DecorationSet, type EditorView } from '@milkdown/kit/prose/view'

export interface Anchor {
  left: number
  top: number
  bottom: number
}

export interface SlashState extends Anchor {
  /** Document range of the typed "/query", to be removed when an item is chosen. */
  from: number
  to: number
  query: string
}

export interface BubbleState extends Anchor {
  from: number
  to: number
  /** Names of the marks present over the whole selection. */
  marks: string[]
}

export interface InteractionCallbacks {
  onSlash: (state: SlashState | null) => void
  onBubble: (state: BubbleState | null) => void
  /** Returns true when the menu used the key. */
  onSlashKey: (key: string) => boolean
}

const SLASH = /(?:^|\s)\/([\p{L}\p{N}-]*)$/u

const sameSlash = (a: SlashState | null, b: SlashState | null) =>
  a === b ||
  (!!a &&
    !!b &&
    a.from === b.from &&
    a.to === b.to &&
    a.query === b.query &&
    a.top === b.top &&
    a.left === b.left)

const sameBubble = (a: BubbleState | null, b: BubbleState | null) =>
  a === b ||
  (!!a &&
    !!b &&
    a.from === b.from &&
    a.to === b.to &&
    a.top === b.top &&
    a.left === b.left &&
    a.marks.join() === b.marks.join())

function anchorAt(view: EditorView, from: number, to = from): Anchor {
  const start = view.coordsAtPos(from)
  const end = view.coordsAtPos(to)
  return {
    left: (start.left + end.left) / 2,
    top: Math.min(start.top, end.top),
    bottom: Math.max(start.bottom, end.bottom),
  }
}

/**
 * What the visual editor needs from ProseMirror and cannot get from markdown alone: the typed `/command`, the
 * text selection (for the floating toolbar), clickable task checkboxes and the empty-document placeholder.
 */
export const interaction = (callbacks: () => InteractionCallbacks, placeholder: () => string) =>
  $prose(() => {
    let slash: SlashState | null = null
    let bubble: BubbleState | null = null
    const key = new PluginKey('librenotes-interaction')

    const compute = (view: EditorView) => {
      const { state } = view
      const { selection } = state
      let nextSlash: SlashState | null = null
      let nextBubble: BubbleState | null = null

      if (view.editable && view.hasFocus()) {
        if (selection.empty && selection instanceof TextSelection) {
          const { $from } = selection
          if ($from.parent.isTextblock && $from.parent.type.name !== 'code_block') {
            const before = $from.parent.textBetween(0, $from.parentOffset, undefined, '￼')
            const match = SLASH.exec(before)
            if (match) {
              const length = match[1].length + 1
              nextSlash = {
                ...anchorAt(view, selection.from),
                from: selection.from - length,
                to: selection.from,
                query: match[1],
              }
            }
          }
        } else if (selection instanceof TextSelection && !selection.empty) {
          const { $from } = selection
          if (
            $from.parent.isTextblock &&
            $from.parent.type.name !== 'code_block' &&
            $from.sameParent(selection.$to)
          ) {
            const marks = Object.values(state.schema.marks)
              .filter((type) => state.doc.rangeHasMark(selection.from, selection.to, type))
              .map((type) => type.name)
            nextBubble = {
              ...anchorAt(view, selection.from, selection.to),
              from: selection.from,
              to: selection.to,
              marks,
            }
          }
        }
      }

      if (!sameSlash(slash, nextSlash)) {
        slash = nextSlash
        callbacks().onSlash(slash)
      }
      if (!sameBubble(bubble, nextBubble)) {
        bubble = nextBubble
        callbacks().onBubble(bubble)
      }
    }

    return new Plugin({
      key,
      view: () => ({
        update: (view) => compute(view),
        destroy: () => {
          callbacks().onSlash(null)
          callbacks().onBubble(null)
        },
      }),
      props: {
        handleKeyDown: (_view, event) => {
          if (!slash || event.isComposing) return false
          if (!['ArrowDown', 'ArrowUp', 'Enter', 'Tab', 'Escape'].includes(event.key)) return false
          return callbacks().onSlashKey(event.key)
        },
        handleDOMEvents: {
          // The focus is part of "is the toolbar showing": recompute when it moves.
          focus: (view) => (queueMicrotask(() => compute(view)), false),
          blur: (view) => {
            // Let a click on the menu land before it is taken away.
            setTimeout(() => {
              if (!view.isDestroyed) compute(view)
            }, 150)
            return false
          },
        },
        handleClick: (view, _pos, event) => {
          const target = event.target as HTMLElement | null
          const item = target?.closest?.('li[data-item-type="task"]') as HTMLElement | null
          if (!item || !view.dom.contains(item)) return false
          // Only the checkbox drawn in the left gutter toggles; clicking the text edits it.
          const box = item.getBoundingClientRect()
          if (event.clientX - box.left > 28 && box.width > 0) return false
          const inside = view.posAtDOM(item, 0)
          const $pos = view.state.doc.resolve(inside)
          for (let depth = $pos.depth; depth > 0; depth -= 1) {
            const node = $pos.node(depth)
            if (node.type.name === 'list_item') {
              view.dispatch(
                view.state.tr.setNodeMarkup($pos.before(depth), undefined, {
                  ...node.attrs,
                  checked: !node.attrs.checked,
                }),
              )
              return true
            }
          }
          return false
        },
        decorations: (state) => {
          const { doc } = state
          const empty =
            doc.childCount === 1 &&
            doc.firstChild!.isTextblock &&
            doc.firstChild!.content.size === 0
          if (!empty) return DecorationSet.empty
          return DecorationSet.create(doc, [
            Decoration.node(0, doc.firstChild!.nodeSize, {
              class: 'is-empty',
              'data-placeholder': placeholder(),
            }),
          ])
        },
      },
    })
  })
