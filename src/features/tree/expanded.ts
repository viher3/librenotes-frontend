import { useCallback, useState } from 'react'

const KEY = 'librenotes.tree.expanded'

/** Identifies a branch of the tree: `folder:<id>` or `note:<id>`. */
export const branchKey = (kind: 'folder' | 'note', id: string) => `${kind}:${id}`

function read(): Set<string> {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(KEY) ?? '[]')
    return new Set(
      Array.isArray(stored) ? stored.filter((k): k is string => typeof k === 'string') : [],
    )
  } catch {
    return new Set()
  }
}

/** Which branches are open. Remembered between visits (a per-viewer convenience, so it lives in the browser). */
export function useExpandedBranches() {
  const [open, setOpen] = useState<Set<string>>(read)

  const update = useCallback((change: (current: Set<string>) => Set<string>) => {
    setOpen((current) => {
      const next = change(current)
      try {
        localStorage.setItem(KEY, JSON.stringify([...next]))
      } catch {
        /* storage unavailable: the tree just starts collapsed next time */
      }
      return next
    })
  }, [])

  const toggle = useCallback(
    (key: string) =>
      update((current) => {
        const next = new Set(current)
        if (!next.delete(key)) next.add(key)
        return next
      }),
    [update],
  )

  const expand = useCallback(
    (...keys: string[]) =>
      update((current) =>
        keys.every((k) => current.has(k)) ? current : new Set([...current, ...keys]),
      ),
    [update],
  )

  const collapse = useCallback(
    (key: string) =>
      update((current) => {
        if (!current.has(key)) return current
        const next = new Set(current)
        next.delete(key)
        return next
      }),
    [update],
  )

  return { isOpen: (key: string) => open.has(key), toggle, expand, collapse }
}
