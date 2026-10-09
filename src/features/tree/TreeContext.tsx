import { createContext, useContext, type DragEvent } from 'react'
import type { Destination, ID } from '@/data/types'
import type { DropTarget } from './dnd'
import type { NodeRef } from './queries'

/** Something the user asked to do from a row's menu; the sidebar turns it into a dialog or a request. */
export type TreeAction =
  | { type: 'newDocument'; destination: Destination }
  | { type: 'newLink'; destination: Destination }
  | { type: 'newFolder'; parentFolderId: ID | null }
  | { type: 'renameFolder'; id: ID; name: string }
  | { type: 'move'; node: NodeRef; name: string }
  | { type: 'delete'; node: NodeRef; name: string; childCount: number }

export interface TreeContextValue {
  isOpen: (key: string) => boolean
  toggle: (key: string) => void
  expand: (key: string) => void
  /** The row that holds the tab stop (roving tabindex). */
  activeKey: string | null
  setActiveKey: (key: string) => void
  /** The row of the page being shown, if it is part of the tree. */
  currentKey: string | null
  onAction: (action: TreeAction) => void
  drag: {
    start: (node: NodeRef, event: DragEvent) => void
    over: (target: DropTarget, key: string, event: DragEvent) => void
    leave: (key: string) => void
    drop: (target: DropTarget, event: DragEvent) => void
    end: () => void
    /** The row currently under the dragged item, if it accepts it. */
    overKey: string | null
  }
}

export const TreeContext = createContext<TreeContextValue | null>(null)

export function useTree(): TreeContextValue {
  const value = useContext(TreeContext)
  if (!value) throw new Error('useTree must be used inside the sidebar tree')
  return value
}
