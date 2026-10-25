import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import type { Destination } from '@/data/types'
import { errorMessage } from '@/features/auth/errors'
import { useCreateNote } from './queries'

/** Creates an empty document in the active language and opens it, ready to be named. */
export function useNewDocument() {
  const { t } = useTranslation('documents')
  const navigate = useNavigate()
  const create = useCreateNote()

  // `isPending` is state and only updates on the next render: two quick activations (a shortcut held down,
  // a double click) would both pass it. A ref closes that gap.
  const creating = useRef(false)

  /** Creates the document at the top level, in a folder, or under another document. */
  const createDocument = (destination: Destination = { type: 'root' }) => {
    if (creating.current) return
    creating.current = true
    create.mutate(
      {
        title: t('untitled'),
        folderId: destination.type === 'folder' ? destination.id : null,
        parentNoteId: destination.type === 'note' ? destination.id : null,
      },
      {
        onSuccess: (note) => navigate(`/doc/${note.id}`, { state: { isNew: true } }),
        onSettled: () => {
          creating.current = false
        },
      },
    )
  }

  return {
    createDocument,
    pending: create.isPending,
    error: create.isError ? errorMessage(create.error) : null,
  }
}

/**
 * Ctrl/Cmd+N creates a document. Browsers reserve that combination for "new window" and often never deliver it to
 * the page, so Alt+N is accepted too.
 */
export function useNewDocumentShortcut(createDocument: (destination?: Destination) => void) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || event.shiftKey || event.key.toLowerCase() !== 'n') return
      const primary = (event.ctrlKey || event.metaKey) && !event.altKey
      const alternative = event.altKey && !event.ctrlKey && !event.metaKey
      if (!primary && !alternative) return
      event.preventDefault()
      createDocument() // never forward the event: the first argument is a destination
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [createDocument])
}
