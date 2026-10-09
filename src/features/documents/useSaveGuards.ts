import { useEffect } from 'react'

/**
 * What an autosaved screen does so that nothing typed is lost: Ctrl/Cmd+S saves now (instead of the browser's "save
 * page"), hiding the tab saves, and closing or reloading the page while something is unsaved asks the browser to
 * confirm.
 */
export function useSaveGuards({
  flush,
  unsaved,
}: {
  flush: () => Promise<boolean>
  unsaved: boolean
}) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault()
        void flush()
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
  }, [flush, unsaved])
}
