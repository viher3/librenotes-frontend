import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { Alert } from '@/components/Alert'
import { Button } from '@/components/Button'
import { Modal } from '@/components/Modal'
import { TextAreaField, TextField } from '@/components/TextField'
import { isHttpUrl } from '@/data/rules'
import type { Destination } from '@/data/types'
import { errorMessage } from '@/features/auth/errors'
import { TagEditor } from '@/features/tags/TagEditor'
import { useTags } from '@/features/tags/queries'
import { siteName } from './hostname'
import { useCreateLink } from './queries'

interface NewLinkContextValue {
  /** Opens the "new link" dialog; the link is saved at the top level, in a folder or under a document. */
  open: (destination?: Destination) => void
}

const NewLinkContext = createContext<NewLinkContextValue | null>(null)

export function useNewLink(): NewLinkContextValue {
  const value = useContext(NewLinkContext)
  if (!value) throw new Error('useNewLink must be used inside <NewLinkProvider>')
  return value
}

/** Offers the "new link" dialog to the whole signed-in area, so any screen can start saving a link. */
export function NewLinkProvider({ children }: { children: ReactNode }) {
  const [destination, setDestination] = useState<Destination | null>(null)
  const open = useCallback((where: Destination = { type: 'root' }) => setDestination(where), [])
  const value = useMemo(() => ({ open }), [open])

  return (
    <NewLinkContext.Provider value={value}>
      {children}
      {destination && (
        <NewLinkDialog destination={destination} onClose={() => setDestination(null)} />
      )}
    </NewLinkContext.Provider>
  )
}

function NewLinkDialog({
  destination,
  onClose,
}: {
  destination: Destination
  onClose: () => void
}) {
  const { t } = useTranslation('links')
  const navigate = useNavigate()
  const create = useCreateLink()
  const knownTags = useTags().data?.map((tag) => tag.name) ?? []
  const [url, setUrl] = useState('')
  const [title, setTitle] = useState('')
  const [note, setNote] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [urlError, setUrlError] = useState<string | null>(null)
  const [failure, setFailure] = useState<string | null>(null)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const address = url.trim()
    if (address === '') return setUrlError(t('dialog.urlRequired'))
    if (!isHttpUrl(address)) return setUrlError(t('page.urlInvalid'))
    setUrlError(null)
    setFailure(null)
    try {
      const link = await create.mutateAsync({
        url: address,
        title: title.trim() || siteName(address),
        note: note.trim() || null,
        tags,
        folderId: destination.type === 'folder' ? destination.id : null,
        parentNoteId: destination.type === 'note' ? destination.id : null,
      })
      onClose()
      navigate(`/link/${link.id}`)
    } catch (error) {
      setFailure(errorMessage(error))
    }
  }

  return (
    <Modal title={t('dialog.title')} width="md" busy={create.isPending} onClose={onClose}>
      <form onSubmit={submit} noValidate className="mt-3 flex flex-col gap-3">
        {failure && <Alert tone="error">{failure}</Alert>}
        <TextField
          label={t('dialog.url')}
          type="url"
          inputMode="url"
          autoComplete="off"
          placeholder="https://"
          value={url}
          error={urlError ?? undefined}
          onChange={(event) => {
            setUrl(event.target.value)
            setUrlError(null)
          }}
        />
        <TextField
          label={t('dialog.titleField')}
          hint={t('dialog.titleHint')}
          maxLength={255}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
        />
        <TextAreaField
          label={t('dialog.note')}
          rows={3}
          value={note}
          onChange={(event) => setNote(event.target.value)}
        />
        <div className="flex flex-col gap-1">
          <span className="text-sm font-medium">{t('dialog.tags')}</span>
          <TagEditor tags={tags} onChange={setTags} suggestions={knownTags} />
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={create.isPending}>
            {t('dialog.cancel')}
          </Button>
          <Button type="submit" disabled={create.isPending}>
            {create.isPending ? t('dialog.creating') : t('dialog.create')}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
