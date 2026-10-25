import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useRepositories } from '@/data/DataProvider'
import type { ID, TrashKind } from '@/data/types'
import { invalidateStructure, trashKeys } from '@/lib/queryKeys'

export function useTrash() {
  const { notes } = useRepositories()
  return useQuery({ queryKey: trashKeys.all, queryFn: () => notes.listTrash(), staleTime: 0 })
}

/** Restoring brings things back into the tree, the lists and the tags, so all of them are refreshed. */
export function useRestore() {
  const { notes } = useRepositories()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ kind, id }: { kind: TrashKind; id: ID }) => notes.restore(kind, id),
    onSuccess: () => invalidateStructure(queryClient),
  })
}

export function useDeleteForever() {
  const { notes } = useRepositories()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ kind, id }: { kind: TrashKind; id: ID }) => notes.deletePermanently(kind, id),
    onSuccess: () => invalidateStructure(queryClient),
  })
}

export function useEmptyTrash() {
  const { notes } = useRepositories()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => notes.emptyTrash(),
    onSuccess: () => invalidateStructure(queryClient),
  })
}
