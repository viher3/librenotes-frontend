import type { QueryClient } from '@tanstack/react-query'
import type { ID, ListNotesParams } from '@/data/types'

// Cache keys shared by several features. They live here so features do not import each other.

export const noteKeys = {
  all: ['notes'] as const,
  lists: () => [...noteKeys.all, 'list'] as const,
  list: (params: ListNotesParams) => [...noteKeys.lists(), params] as const,
  detail: (id: ID) => [...noteKeys.all, 'detail', id] as const,
}

export const treeKeys = {
  all: ['tree'] as const,
  /** The contents of a folder; `null` is the top level. */
  folder: (id: ID | null) => [...treeKeys.all, 'folder', id ?? 'root'] as const,
  /** What is directly under a note. */
  note: (id: ID) => [...treeKeys.all, 'note', id] as const,
}

/**
 * Anything that adds, moves, renames or removes something changes the tree, the lists and the breadcrumbs of
 * documents (their `path`), so all of them are marked stale together. Open documents keep their own draft:
 * a refetch only refreshes what is shown around it.
 */
export function invalidateStructure(queryClient: QueryClient) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: treeKeys.all }),
    queryClient.invalidateQueries({ queryKey: noteKeys.all }),
  ])
}
