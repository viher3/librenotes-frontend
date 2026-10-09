import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'
import { useRepositories } from '@/data/DataProvider'
import type { CreateNoteInput, ID, ListNotesParams, Note, UpdateNoteInput } from '@/data/types'
import { invalidateStructure, noteKeys } from '@/lib/queryKeys'

export { noteKeys }

export function useNotesList(params: ListNotesParams) {
  const { notes } = useRepositories()
  return useQuery({ queryKey: noteKeys.list(params), queryFn: () => notes.listNotes(params) })
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
      queryClient.setQueryData<Note>(noteKeys.detail(id), (old) =>
        old ? { ...old, ...changes, updatedAt: new Date().toISOString() } : old,
      )
      // A new title or pin shows in the tree and in the breadcrumbs of other documents; plain typing does not.
      if ('title' in changes || 'pinned' in changes) void invalidateStructure(queryClient)
      else void queryClient.invalidateQueries({ queryKey: noteKeys.lists() })
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
