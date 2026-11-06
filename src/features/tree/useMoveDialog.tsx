import { useState } from 'react'
import type { BulkItem } from '@/data/types'
import { MoveDialog } from './MoveDialog'
import { useTreeActions, type MoveItem } from './queries'

interface Target {
  nodes: MoveItem[]
  name: string
  /** Picked together with others: moved in one request, and the caller is told when it is done. */
  bulk?: { onMoved: () => void }
}

/**
 * The "Move" button of a page or card: `openMove` shows the location picker for one item, `openMoveMany` for
 * several picked ones, and `dialog` is what to render. Moving refreshes the tree and every page that shows the
 * items' location.
 */
export function useMoveDialog() {
  const { move, bulkMove } = useTreeActions()
  const [target, setTarget] = useState<Target | null>(null)

  const close = () => setTarget(null)
  const dialog = target ? (
    <MoveDialog
      nodes={target.nodes}
      name={target.name}
      onClose={close}
      onMove={async (destination) => {
        if (target.bulk) {
          await bulkMove.mutateAsync({ items: target.nodes as BulkItem[], destination })
          target.bulk.onMoved()
        } else {
          await move.mutateAsync({ node: target.nodes[0], destination })
        }
        close()
      }}
    />
  ) : null

  return {
    openMove: (node: MoveItem, name: string) => setTarget({ nodes: [node], name }),
    openMoveMany: (items: BulkItem[], onMoved: () => void) =>
      setTarget({ nodes: items, name: '', bulk: { onMoved } }),
    dialog,
  }
}
