import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'
import { useRepositories } from '@/data/DataProvider'
import type { CreateNoteInput, ID, ListNotesParams, Note, UpdateNoteInput } from '@/data/types'
import { isEncryptedContent } from '@/lib/crypto/marker'
import { invalidateStructure, noteKeys, tagKeys } from '@/lib/queryKeys'

export { noteKeys }

export function useNotesList(params: ListNotesParams) {
  const { notes } = useRepositories()
  return useQuery({ queryKey: noteKeys.list(params), queryFn: () => notes.listNotes(params) })
}

const ROOT_PAGE_SIZE = 12

/** The documents in no folder and under no note, newest first, a page at a time. */
export function useRootNotes() {
  const { notes } = useRepositories()
  return useInfiniteQuery({
    queryKey: [...noteKeys.lists(), 'root'],
    initialPageParam: 1,
    queryFn: ({ pageParam }) =>
      notes.listNotes({
        folderId: 'root',
        page: pageParam,
        size: ROOT_PAGE_SIZE,
        orderBy: 'updatedAt',
        orderDirection: 'desc',
      }),
    getNextPageParam: (last) => (last.page < last.lastPage ? last.page + 1 : undefined),
  })
}

/**
 * One document. It is loaded once and not refetched in the background: the editor keeps its own draft, and a
 * refetch must never be mistaken for something to overwrite it with.
 */
export function useNote(id: ID, enabled = true) {
  const { notes } = useRepositories()
  return useQuery({
    queryKey: noteKeys.detail(id),
    queryFn: () => notes.getNote(id),
    enabled,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  })
}

export function useCreateNote() {
  const { notes } = useRepositories()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateNoteInput) => notes.createNote(input),
    onSuccess: (note) => {
      queryClient.setQueryData(noteKeys.detail(note.id), note)
      void invalidateStructure(queryClient)
    },
  })
}

/** Saves some fields of a document and keeps the cached copy and the lists in step. */
export function useSaveNote(id: ID) {
  const { notes } = useRepositories()
  const queryClient = useQueryClient()
  return useCallback(
    async (changes: UpdateNoteInput) => {
      await notes.updateNote(id, changes)
      const before = queryClient.getQueryData<Note>(noteKeys.detail(id))
      const encrypted =
        changes.content === undefined ? undefined : isEncryptedContent(changes.content)
      queryClient.setQueryData<Note>(noteKeys.detail(id), (old) =>
        old
          ? {
              ...old,
              ...changes,
              encrypted: encrypted ?? old.encrypted,
              updatedAt: new Date().toISOString(),
            }
          : old,
      )
      // A new title or pin shows in the tree and in the breadcrumbs of other documents; plain typing does not.
      // Neither does encrypting or decrypting, which changes the icon the document has in those places.
      if (
        'title' in changes ||
        'pinned' in changes ||
        'icon' in changes ||
        (encrypted !== undefined && before !== undefined && encrypted !== before.encrypted)
      )
        void invalidateStructure(queryClient)
      else if ('tags' in changes) {
        void queryClient.invalidateQueries({ queryKey: tagKeys.all })
        void queryClient.invalidateQueries({ queryKey: noteKeys.lists() })
      } else void queryClient.invalidateQueries({ queryKey: noteKeys.lists() })
    },
    [id, notes, queryClient],
  )
}

export function useDeleteNote() {
  const { notes } = useRepositories()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: ID) => notes.deleteNote(id),
    onSuccess: (_result, id) => {
      queryClient.removeQueries({ queryKey: noteKeys.detail(id) })
      void invalidateStructure(queryClient)
    },
  })
}
