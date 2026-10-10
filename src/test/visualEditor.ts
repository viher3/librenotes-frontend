import { editorViewCtx } from '@milkdown/kit/core'
import { TextSelection } from '@milkdown/kit/prose/state'
import type { EditorView } from '@milkdown/kit/prose/view'
import { act, screen, waitFor } from '@testing-library/react'
import type { TestHost } from '@/features/documents/visual/VisualEditor'

/** The ProseMirror view of the visual editor on screen (waits for the lazily loaded editor). */
export async function findVisualView(): Promise<EditorView> {
  const host = await screen.findByTestId('visual-editor')
  return waitFor(() => {
    const editor = (host as TestHost).__editor
    if (!editor) throw new Error('visual editor not ready yet')
    return editor.action((ctx) => ctx.get(editorViewCtx))
  })
}

export const view$ = {
  /** Types at the cursor, as the user would (one transaction per call). */
  type(view: EditorView, text: string) {
    act(() => view.dispatch(view.state.tr.insertText(text)))
  },
  /** Puts the cursor (or a selection) at document positions. */
  select(view: EditorView, from: number, to = from) {
    act(() => {
      view.focus()
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, from, to)))
    })
  },
  /** The cursor to the end of the document's text. */
  end(view: EditorView) {
    const at = view.state.doc.content.size - 1
    this.select(view, Math.max(at, 1))
  },
  text: (view: EditorView) => view.state.doc.textContent,
}
