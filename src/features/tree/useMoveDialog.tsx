import { useState } from 'react'
import { MoveDialog } from './MoveDialog'
import { useTreeActions, type MoveItem } from './queries'

/**
 * The "Move" button of a page or card: `openMove` shows the location picker for one item and `dialog` is what to
 * render. Moving refreshes the tree and every page that shows the item's location.
 */
export function useMoveDialog() {
  const { move } = useTreeActions()
  const [target, setTarget] = useState<{ node: MoveItem; name: string } | null>(null)

  const close = () => setTarget(null)
  const dialog = target ? (
    <MoveDialog
      node={target.node}
      name={target.name}
      onClose={close}
      onMove={async (destination) => {
        await move.mutateAsync({ node: target.node, destination })
        close()
      }}
    />
  ) : null

  return { openMove: (node: MoveItem, name: string) => setTarget({ node, name }), dialog }
}
