import i18n from 'i18next'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useRepositories } from '@/data/DataProvider'
import { MAX_ATTACHMENT_BYTES, type Attachment, type ID, type Note } from '@/data/types'
import { errorMessage } from '@/features/auth/errors'
import { noteKeys, treeKeys } from '@/lib/queryKeys'

/** What the files are attached to: a document or a folder. */
export interface AttachmentOwner {
  type: 'note' | 'folder'
  id: ID
}

export interface Upload {
  key: string
  file: File
  /** 0 to 1. */
  progress: number
  /** Why it failed, already in the user's language. */
  error: string | null
}

/** Keeps the cached owner in step after files were added or removed. */
function useOwnerCache(owner: AttachmentOwner) {
  const queryClient = useQueryClient()
  return {
    added: (attachment: Attachment) => {
      if (owner.type === 'note') {
        queryClient.setQueryData<Note>(noteKeys.detail(owner.id), (old) =>
          old ? { ...old, attachments: [...old.attachments, attachment] } : old,
        )
      } else void queryClient.invalidateQueries({ queryKey: treeKeys.folder(owner.id) })
    },
    removed: (id: ID) => {
      if (owner.type === 'note') {
        queryClient.setQueryData<Note>(noteKeys.detail(owner.id), (old) =>
          old ? { ...old, attachments: old.attachments.filter((a) => a.id !== id) } : old,
        )
      } else void queryClient.invalidateQueries({ queryKey: treeKeys.folder(owner.id) })
    },
  }
}

/**
 * Uploads files one after another, with progress. A file that is too big or empty is refused here, without
 * bothering the server; one that fails stays in the list so it can be retried or dismissed.
 */
export function useAttachmentUploads(owner: AttachmentOwner) {
  const { notes } = useRepositories()
  const cache = useOwnerCache(owner)
  const [uploads, setUploads] = useState<Upload[]>([])
  const controllers = useRef(new Map<string, AbortController>())
  const queue = useRef<Promise<void>>(Promise.resolve())
  const counter = useRef(0)
  const latest = useRef({ owner, cache, notes })
  useEffect(() => {
    latest.current = { owner, cache, notes }
  })

  useEffect(() => {
    const active = controllers.current
    return () => {
      for (const controller of active.values()) controller.abort()
      active.clear()
    }
  }, [])

  const patch = useCallback(
    (key: string, changes: Partial<Upload>) =>
      setUploads((list) => list.map((u) => (u.key === key ? { ...u, ...changes } : u))),
    [],
  )

  const start = useCallback(
    (key: string, file: File) => {
      const controller = new AbortController()
      controllers.current.set(key, controller)
      queue.current = queue.current.then(async () => {
        if (controller.signal.aborted) return
        const { owner: target, cache: ownerCache, notes: repository } = latest.current
        patch(key, { progress: 0, error: null })
        const options = {
          signal: controller.signal,
          onProgress: (fraction: number) => patch(key, { progress: fraction }),
        }
        try {
          const attachment =
            target.type === 'note'
              ? await repository.uploadNoteAttachment(target.id, file, options)
              : await repository.uploadFolderAttachment(target.id, file, options)
          controllers.current.delete(key)
          setUploads((list) => list.filter((u) => u.key !== key))
          ownerCache.added(attachment)
        } catch (error) {
          controllers.current.delete(key)
          if (controller.signal.aborted) return
          patch(key, { error: errorMessage(error) })
        }
      })
    },
    [patch],
  )

  const add = useCallback(
    (files: File[]) => {
      const entries: Upload[] = files.map((file) => {
        counter.current += 1
        const refused =
          file.size === 0
            ? i18n.t('errors:attachment.empty')
            : file.size > MAX_ATTACHMENT_BYTES
              ? i18n.t('errors:attachment.too_large')
              : null
        return { key: `upload-${counter.current}`, file, progress: 0, error: refused }
      })
      setUploads((list) => [...list, ...entries])
      for (const entry of entries) if (!entry.error) start(entry.key, entry.file)
    },
    [start],
  )

  const retry = useCallback(
    (key: string) => {
      const upload = uploads.find((u) => u.key === key)
      if (!upload) return
      patch(key, { error: null, progress: 0 })
      start(key, upload.file)
    },
    [patch, start, uploads],
  )

  const dismiss = useCallback((key: string) => {
    controllers.current.get(key)?.abort()
    controllers.current.delete(key)
    setUploads((list) => list.filter((u) => u.key !== key))
  }, [])

  return { uploads, add, retry, dismiss }
}

export type AttachmentUploads = ReturnType<typeof useAttachmentUploads>

export function useDeleteAttachment(owner: AttachmentOwner) {
  const { notes } = useRepositories()
  const cache = useOwnerCache(owner)
  return useMutation({
    mutationFn: (id: ID) => notes.deleteAttachment(id),
    onSuccess: (_, id) => cache.removed(id),
  })
}

/** The bytes of one file, fetched with the session (a plain link could not send it). */
export function useDownloadAttachment() {
  const { notes } = useRepositories()
  return useMutation({
    mutationFn: async (attachment: Attachment) => ({
      blob: await notes.downloadAttachment(attachment.id),
      fileName: attachment.fileName,
    }),
  })
}
