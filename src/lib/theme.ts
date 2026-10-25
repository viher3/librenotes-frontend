import { useSyncExternalStore } from 'react'

export type Theme = 'dark' | 'light'
export const THEMES: Theme[] = ['dark', 'light']

const STORAGE_KEY = 'librenotes.theme'
const listeners = new Set<() => void>()

/** The saved choice; dark when nothing (valid) is saved or storage is unavailable. */
export function storedTheme(): Theme {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'light' ? 'light' : 'dark'
  } catch {
    return 'dark'
  }
}

export const currentTheme = (): Theme =>
  document.documentElement.dataset.theme === 'light' ? 'light' : 'dark'

/** Puts the saved theme on the page. Called once, before the first render. */
export function applyStoredTheme() {
  document.documentElement.dataset.theme = storedTheme()
}

export function setTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme
  try {
    localStorage.setItem(STORAGE_KEY, theme)
  } catch {
    /* the choice still applies until the page is closed */
  }
  listeners.forEach((listener) => listener())
}

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useTheme(): [Theme, (theme: Theme) => void] {
  return [useSyncExternalStore(subscribe, currentTheme), setTheme]
}
