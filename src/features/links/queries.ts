import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'
import { useRepositories } from '@/data/DataProvider'
import type { CreateLinkInput, ID, LinkDetail, UpdateLinkInput } from '@/data/types'
import { invalidateStructure, linkKeys, tagKeys } from '@/lib/queryKeys'

/**
 * One link. Like a document it is loaded once: the page edits its own draft, so a background refetch must not
 * be mistaken for something to overwrite it with.
 */
export function useLink(id: ID, enabled = true) {
  const { notes } = useRepositories()
  return useQuery({
    queryKey: linkKeys.detail(id),
    queryFn: () => notes.getLink(id),
    enabled,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  })
}

/** Every link, newest first, a page at a time. */
export function useLinks() {
  const { notes } = useRepositories()
  return useInfiniteQuery({
    queryKey: linkKeys.list(),
    initialPageParam: 1,
    queryFn: ({ pageParam }) =>
      notes.listLinks({ page: pageParam, size: 20, orderBy: 'updatedAt', orderDirection: 'desc' }),
    getNextPageParam: (last) => (last.page < last.lastPage ? last.page + 1 : undefined),
  })
}

export function useCreateLink() {
  const { notes } = useRepositories()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateLinkInput) => notes.createLink(input),
    onSuccess: (link) => {
      queryClient.setQueryData(linkKeys.detail(link.id), link)
      return invalidateStructure(queryClient)
    },
  })
}

/** Saves some fields of a link and keeps the cached copy, the lists and the tree in step. */
export function useSaveLink(id: ID) {
  const { notes } = useRepositories()
  const queryClient = useQueryClient()
  return useCallback(
    async (changes: UpdateLinkInput) => {
      await notes.updateLink(id, changes)
      queryClient.setQueryData<LinkDetail>(linkKeys.detail(id), (old) =>
        old ? { ...old, ...changes, updatedAt: new Date().toISOString() } : old,
      )
      // A new title shows in the tree; tags in the tag list. The address and the note only in the lists.
      if ('title' in changes) void invalidateStructure(queryClient)
      else {
        void queryClient.invalidateQueries({ queryKey: linkKeys.list() })
        if ('tags' in changes) void queryClient.invalidateQueries({ queryKey: tagKeys.all })
      }
    },
    [id, notes, queryClient],
  )
}

export function useDeleteLink() {
  const { notes } = useRepositories()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: ID) => notes.deleteLink(id),
    onSuccess: (_result, id) => {
      queryClient.removeQueries({ queryKey: linkKeys.detail(id) })
      return invalidateStructure(queryClient)
    },
  })
}
