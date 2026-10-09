import { useCallback, useState } from 'react'

export type ViewMode = 'edit' | 'split' | 'preview'

const KEY = 'librenotes.viewMode'
const MODES: ViewMode[] = ['edit', 'split', 'preview']

function read(): ViewMode {
  try {
    const stored = localStorage.getItem(KEY)
    return MODES.includes(stored as ViewMode) ? (stored as ViewMode) : 'split'
  } catch {
    return 'split'
  }
}

/** Edit / split / preview, remembered between visits (a per-viewer convenience, so it lives in the browser). */
export function useViewMode(): [ViewMode, (mode: ViewMode) => void] {
  const [mode, setMode] = useState<ViewMode>(read)
  const change = useCallback((next: ViewMode) => {
    setMode(next)
    try {
      localStorage.setItem(KEY, next)
    } catch {
      /* storage unavailable: the choice just will not be remembered */
    }
  }, [])
  return [mode, change]
}
