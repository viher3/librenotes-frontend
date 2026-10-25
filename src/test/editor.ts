import { EditorView } from '@codemirror/view'
import { act, waitFor } from '@testing-library/react'

/** The CodeMirror instance on screen (waits for the lazily loaded editor). */
export async function findEditor(): Promise<EditorView> {
  return waitFor(() => {
    const element = document.querySelector('.cm-editor') as HTMLElement | null
    const view = element ? EditorView.findFromDOM(element) : null
    if (!view) throw new Error('editor not mounted yet')
    return view
  })
}

export const editorText = async () => (await findEditor()).state.doc.toString()

/** Replaces the document, as if the user had typed it; CodeMirror reports it like any edit. */
export async function setEditorText(text: string) {
  const view = await findEditor()
  act(() => view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } }))
}
