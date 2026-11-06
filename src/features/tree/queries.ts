import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'
import { useRepositories } from '@/data/DataProvider'
import { ApiError, isApiError } from '@/data/errors'
import type { BulkItem, Destination, ID, Icon } from '@/data/types'
import { invalidateStructure, noteKeys, treeKeys } from '@/lib/queryKeys'

export function useFolderContents(id: ID | null, enabled = true) {
  const { notes } = useRepositories()
  return useQuery({
    queryKey: treeKeys.folder(id),
    queryFn: () => notes.folderContents(id),
    enabled,
  })
}

export function useNoteChildren(id: ID, enabled = true) {
  const { notes } = useRepositories()
  return useQuery({
    queryKey: treeKeys.note(id),
    queryFn: () => notes.noteChildren(id),
    enabled,
  })
}

export { treeKeys }

export type NodeKind = 'folder' | 'note' | 'link'

/** Something that can be moved or removed from the tree. */
export interface NodeRef {
  kind: NodeKind
  id: ID
}

/** What the move dialog can move: a tree node, or a file (it goes into a folder or under a note, never the top). */
export type MoveItem = NodeRef | { kind: 'attachment'; id: ID }

/** The operations behind the tree's menus and drag & drop. Each one refreshes what depends on it. */
export function useTreeActions() {
  const { notes } = useRepositories()
  const queryClient = useQueryClient()
  const refresh = useCallback(() => invalidateStructure(queryClient), [queryClient])

  const createFolder = useMutation({
    mutationFn: ({ name, parentFolderId }: { name: string; parentFolderId: ID | null }) =>
      notes.createFolder(name, parentFolderId),
    onSuccess: refresh,
  })

  const renameFolder = useMutation({
    mutationFn: ({ id, name }: { id: ID; name: string }) => notes.renameFolder(id, name),
    onSuccess: refresh,
  })

  const setIcon = useMutation({
    mutationFn: ({ node, icon }: { node: NodeRef; icon: Icon }) => {
      switch (node.kind) {
        case 'folder':
          return notes.updateFolder(node.id, { icon })
        case 'note':
          return notes.updateNote(node.id, { icon })
        case 'link':
          return notes.updateLink(node.id, { icon })
      }
    },
    onSuccess: refresh,
  })

  const move = useMutation({
    mutationFn: ({ node, destination }: { node: MoveItem; destination: Destination }) => {
      switch (node.kind) {
        case 'attachment':
          return notes.moveAttachment(node.id, destination)
        case 'folder':
          // A folder lives in a folder or at the top level, never under a document.
          if (destination.type === 'note') {
            return Promise.reject(new ApiError({ status: 422, code: 'notes.invalid_location' }))
          }
          return notes.moveFolder(node.id, destination.type === 'folder' ? destination.id : null)
        case 'note':
          return notes.moveNote(node.id, destination)
        case 'link':
          return notes.moveLink(node.id, destination)
      }
    },
    onSuccess: refresh,
  })

  const remove = useMutation({
    mutationFn: (node: NodeRef) => {
      switch (node.kind) {
        case 'folder':
          return notes.deleteFolder(node.id)
        case 'note':
          return notes.deleteNote(node.id)
        case 'link':
          return notes.deleteLink(node.id)
      }
    },
    onSuccess: async (_result, node) => {
      if (node.kind === 'note') queryClient.removeQueries({ queryKey: noteKeys.detail(node.id) })
      await refresh()
    },
  })

  /** Moves or removes several things in one request: all of them or none. */
  const bulkMove = useMutation({
    mutationFn: ({ items, destination }: { items: BulkItem[]; destination: Destination }) =>
      notes.moveMany(items, destination),
    onSuccess: refresh,
    // Something picked no longer exists: the page is out of date, so show what is there now.
    onError: (error) => (isApiError(error) && error.status === 404 ? refresh() : undefined),
  })

  const bulkRemove = useMutation({
    mutationFn: (items: BulkItem[]) => notes.deleteMany(items),
    onSuccess: async (_result, items) => {
      for (const item of items) {
        if (item.kind === 'note') queryClient.removeQueries({ queryKey: noteKeys.detail(item.id) })
      }
      await refresh()
    },
    onError: (error) => (isApiError(error) && error.status === 404 ? refresh() : undefined),
  })

  return { createFolder, renameFolder, setIcon, move, remove, bulkMove, bulkRemove }
}
