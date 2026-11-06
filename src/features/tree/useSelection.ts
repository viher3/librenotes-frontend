import { useCallback, useEffect, useMemo, useState } from 'react'
import type { CardSelection } from '@/components/ItemCard'
import type { BulkItem } from '@/data/types'

const keyOf = (item: BulkItem) => `${item.kind}:${item.id}`

/** How one card (or file row) takes part in a page's selection. */
export const cardSelection = (selection: Selection, item: BulkItem): CardSelection => ({
  selected: selection.isSelected(item),
  active: selection.active,
  onToggle: ({ range }) => selection.toggle(item, { range }),
})

export type SectionState = 'none' | 'some' | 'all'

export interface Selection {
  /** Selection mode: checkboxes are shown and a click on a card picks it instead of opening it. */
  active: boolean
  count: number
  /** The picked items, in the order they appear on the page. */
  items: BulkItem[]
  isSelected: (item: BulkItem) => boolean
  /** Picks or unpicks one item; with `range`, everything between the last one picked and this one. */
  toggle: (item: BulkItem, options?: { range?: boolean }) => void
  /** The state of a group of items (a section of the page), and a function that picks or unpicks all of them. */
  section: (items: BulkItem[]) => { state: SectionState; toggle: () => void }
  selectAll: () => void
  /** Enters selection mode with nothing picked yet. */
  start: () => void
  /** Unpicks everything and leaves selection mode. */
  clear: () => void
}

interface State {
  mode: boolean
  keys: ReadonlySet<string>
  anchor: string | null
}

const EMPTY: State = { mode: false, keys: new Set(), anchor: null }

/**
 * What the user has picked on one page, to act on several things at once. `visible` is every item the page shows,
 * in display order: it gives ranges (Shift+click) and "select all" their meaning, and anything that is no longer
 * shown (moved, deleted, removed by a refresh) is dropped from the selection. The state belongs to the page, so
 * going to another page starts clean.
 */
export function useSelection(visible: BulkItem[]): Selection {
  const [state, setState] = useState<State>(EMPTY)
  // An item can be on the page twice (a pinned document is also in the list of its folder): it is one pick.
  const order = [...new Set(visible.map(keyOf))]
  const signature = order.join('|')
  const byKey = useMemo(
    () => new Map(visible.map((item) => [keyOf(item), item])),
    // `signature` stands for the content of `visible`, which is a new array on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [signature],
  )

  // Forget what is no longer on the page (adjusting state while rendering: React re-renders straight away).
  const kept = [...state.keys].filter((key) => byKey.has(key))
  if (kept.length !== state.keys.size) setState({ ...state, keys: new Set(kept) })

  const toggle = useCallback(
    (item: BulkItem, options?: { range?: boolean }) => {
      const key = keyOf(item)
      setState((current) => {
        const keys = new Set(current.keys)
        if (options?.range && current.anchor && current.anchor !== key) {
          const from = order.indexOf(current.anchor)
          const to = order.indexOf(key)
          if (from >= 0 && to >= 0) {
            const [start, end] = from < to ? [from, to] : [to, from]
            for (const between of order.slice(start, end + 1)) keys.add(between)
            return { mode: true, keys, anchor: key }
          }
        }
        if (!keys.delete(key)) keys.add(key)
        return { mode: current.mode, keys, anchor: key }
      })
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [signature],
  )

  const section = useCallback(
    (items: BulkItem[]) => {
      const picked = items.filter((item) => state.keys.has(keyOf(item))).length
      const sectionState: SectionState =
        picked === 0 ? 'none' : picked === items.length ? 'all' : 'some'
      return {
        state: sectionState,
        toggle: () =>
          setState((current) => {
            const keys = new Set(current.keys)
            const everyPicked = items.every((item) => keys.has(keyOf(item)))
            for (const item of items) {
              if (everyPicked) keys.delete(keyOf(item))
              else keys.add(keyOf(item))
            }
            return { ...current, keys }
          }),
      }
    },
    [state.keys],
  )

  const selectAll = useCallback(
    () => setState((current) => ({ ...current, mode: true, keys: new Set(order) })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [signature],
  )
  const start = useCallback(() => setState((current) => ({ ...current, mode: true })), [])
  const clear = useCallback(() => setState(EMPTY), [])

  const active = state.mode || state.keys.size > 0

  // Keyboard: Ctrl/Cmd+A picks everything and Escape lets go, unless a dialog or menu is open or the user is typing.
  useEffect(() => {
    if (!active) return
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target?.closest('input:not([type=checkbox]), textarea, select, [contenteditable=true]'))
        return
      if (document.querySelector('[role=dialog], [role=alertdialog], [role=menu]')) return
      if (event.key === 'Escape') clear()
      else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a') {
        event.preventDefault()
        selectAll()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [active, clear, selectAll])

  return useMemo(
    () => ({
      active,
      count: state.keys.size,
      items: order.filter((key) => state.keys.has(key)).map((key) => byKey.get(key)!),
      isSelected: (item) => state.keys.has(keyOf(item)),
      toggle,
      section,
      selectAll,
      start,
      clear,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [active, state.keys, signature, toggle, section, selectAll, start, clear],
  )
}
