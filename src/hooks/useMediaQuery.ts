import { useSyncExternalStore } from 'react'

/** Whether a CSS media query matches now; true where `matchMedia` does not exist (older test environments). */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (listener) => {
      if (typeof window.matchMedia !== 'function') return () => {}
      const list = window.matchMedia(query)
      list.addEventListener('change', listener)
      return () => list.removeEventListener('change', listener)
    },
    () => (typeof window.matchMedia === 'function' ? window.matchMedia(query).matches : true),
  )
}
