import { useEffect } from 'react'

/**
 * What an editing screen does so that nothing typed is lost: Ctrl/Cmd+S saves now (instead of the browser's "save
 * page"), hiding the tab lets the screen save what it saves in the background, and closing or reloading the page
 * while something is unsaved asks the browser to confirm.
 */
export function useSaveGuards({
  flush,
  save = flush,
  unsaved,
}: {
  /** Saves what saves in the background; also done when the tab is hidden. */
  flush: () => Promise<unknown>
  /** What Ctrl/Cmd+S does, when that is more than `flush` (e.g. also saving the content). */
  save?: () => Promise<unknown>
  unsaved: boolean
}) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault()
        void save()
      }
    }
    const onVisibility = () => {
      if (document.hidden) void flush()
    }
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!unsaved) return
      event.preventDefault() // makes the browser ask for confirmation before closing
      event.returnValue = ''
    }
    window.addEventListener('keydown', onKeyDown)
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('beforeunload', onBeforeUnload)
    }
  }, [flush, save, unsaved])
}
