import type { Destination } from '@/data/types'
import type { NodeRef } from './queries'

export const DRAG_TYPE = 'application/x-librenotes-node'

/** What a row accepts being dropped on it. */
export type DropTarget =
  { type: 'root' } | { type: 'folder'; id: string } | { type: 'note'; id: string }

/**
 * Whether `node` may be dropped on `target`. Folders live in folders or at the top level; notes and links can also
 * go under a note. An item cannot be dropped on itself. (Dropping a note onto its own descendant is left for the
 * server to refuse: only it knows the whole tree.)
 */
export function canDrop(node: NodeRef, target: DropTarget): boolean {
  if (target.type === 'root') return true
  if (target.type === 'note' && node.kind === 'folder') return false
  return !(target.type === node.kind && target.id === node.id)
}

export const destinationOf = (target: DropTarget): Destination =>
  target.type === 'root' ? { type: 'root' } : target

export function parseNode(raw: string | undefined): NodeRef | null {
  try {
    const value: unknown = JSON.parse(raw ?? '')
    if (typeof value !== 'object' || value === null) return null
    const { kind, id } = value as Record<string, unknown>
    return (kind === 'folder' || kind === 'note' || kind === 'link') && typeof id === 'string'
      ? { kind, id }
      : null
  } catch {
    return null
  }
}
