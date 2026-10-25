import { useCallback, useState } from 'react'

/** Identifies a branch of the tree: `folder:<id>` or `note:<id>`. */
export const branchKey = (kind: 'folder' | 'note', id: string) => `${kind}:${id}`

/** Which branches are open. Not remembered between visits: the tree starts collapsed and branches open as the user navigates. */
export function useExpandedBranches() {
  const [open, setOpen] = useState<Set<string>>(() => new Set())

  const update = useCallback((change: (current: Set<string>) => Set<string>) => {
    setOpen((current) => {
      const next = change(current)
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
