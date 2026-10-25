import { useCallback, useState } from 'react'
import type { ID } from '@/data/types'

/** How a document is edited: as the page looks (default) or as Markdown source. */
export type EditorMode = 'visual' | 'markdown'

const key = (id: ID) => `librenotes.editorMode.${id}`

function read(id: ID): EditorMode {
  try {
    return localStorage.getItem(key(id)) === 'markdown' ? 'markdown' : 'visual'
  } catch {
    return 'visual'
  }
}

/**
 * The editing mode of one document, remembered on this device (a per-viewer convenience, so it lives in the
 * browser, not in the document).
 */
export function useEditorMode(id: ID): [EditorMode, (mode: EditorMode) => void] {
  const [mode, setMode] = useState<EditorMode>(() => read(id))
  const change = useCallback(
    (next: EditorMode) => {
      setMode(next)
      try {
        localStorage.setItem(key(id), next)
      } catch {
        /* storage unavailable: the choice just will not be remembered */
      }
    },
    [id],
  )
  return [mode, change]
}
