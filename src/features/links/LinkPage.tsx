import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link as RouterLink, useNavigate, useParams } from 'react-router-dom'
import { Alert } from '@/components/Alert'
import { Breadcrumbs } from '@/components/Breadcrumbs'
import { Button } from '@/components/Button'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { TextAreaField, TextField } from '@/components/TextField'
import { isApiError } from '@/data/errors'
import { isHttpUrl } from '@/data/rules'
import type { LinkDetail, UpdateLinkInput } from '@/data/types'
import { errorMessage } from '@/features/auth/errors'
import { SaveIndicator } from '@/features/documents/SaveIndicator'
import { useAutosave } from '@/features/documents/useAutosave'
import { useSaveGuards } from '@/features/documents/useSaveGuards'
import { TagEditor } from '@/features/tags/TagEditor'
import { useTags } from '@/features/tags/queries'
import { useDeleteLink, useLink, useSaveLink } from './queries'

const MAX_TITLE_LENGTH = 255
const isTitleValid = (title: string) => title.trim() !== '' && title.length <= MAX_TITLE_LENGTH

export default function LinkPage() {
  const { id = '' } = useParams()
  const { t } = useTranslation('links')
  const query = useLink(id)

  if (query.isPending) {
    return (
      <p role="status" className="text-sm text-neutral-500">
        {t('common:loading')}
      </p>
    )
  }

  if (query.isError) {
    const missing = isApiError(query.error) && query.error.status === 404
    return (
      <div className="flex max-w-md flex-col items-start gap-3">
        <h2 className="text-xl font-semibold">
          {missing ? t('page.notFoundTitle') : t('page.loadError')}
        </h2>
        <p className="text-sm text-neutral-600 dark:text-neutral-300">
          {missing ? t('page.notFoundBody') : errorMessage(query.error)}
        </p>
        {missing ? (
          <RouterLink
            to="/links"
            className="text-sm font-medium text-indigo-600 underline dark:text-indigo-400"
          >
            {t('page.back')}
          </RouterLink>
        ) : (
          <Button variant="secondary" onClick={() => void query.refetch()}>
            {t('page.retry')}
          </Button>
        )}
      </div>
    )
  }

  // `key` makes opening another link start from a clean draft.
  return <LinkEditor key={query.data.id} link={query.data} />
}

function LinkEditor({ link }: { link: LinkDetail }) {
  const { t, i18n } = useTranslation('links')
  const navigate = useNavigate()
  const save = useSaveLink(link.id)
  const deleteLink = useDeleteLink()
  const knownTags = useTags().data?.map((tag) => tag.name) ?? []
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  const { draft, status, setField, flush, discard } = useAutosave({
    initial: { title: link.title, url: link.url, note: link.note ?? '', tags: link.tags },
    // The draft holds text as typed; the server wants a clean address and `null` for an empty note.
    save: (changes) => {
      const update: UpdateLinkInput = {}
      if (changes.title !== undefined) update.title = changes.title
      if (changes.url !== undefined) update.url = changes.url.trim()
      if (changes.note !== undefined) update.note = changes.note.trim() === '' ? null : changes.note
      if (changes.tags !== undefined) update.tags = changes.tags
      return save(update)
    },
    isValid: (field, value) =>
      field === 'title'
        ? isTitleValid(value as string)
        : field === 'url'
          ? isHttpUrl(value as string)
          : true,
  })

  const titleMissing = !isTitleValid(draft.title)
  const urlInvalid = !isHttpUrl(draft.url)
  const problem = titleMissing
    ? t('common:validation.required')
    : urlInvalid
      ? t('page.urlToSave')
      : undefined
  useSaveGuards({ flush, unsaved: status !== 'saved' || titleMissing || urlInvalid })

  useEffect(() => {
    document.title = `${draft.title.trim() || link.title} · ${i18n.t('appName')}`
    return () => {
      document.title = i18n.t('appName')
    }
  }, [draft.title, link.title, i18n])

  const confirmDelete = () =>
    deleteLink.mutate(link.id, {
      onSuccess: () => {
        discard() // the link is gone: do not try to save it again
        navigate('/links', { replace: true })
      },
    })

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <Breadcrumbs path={link.path} current={draft.title.trim() || link.title} />

      <div className="flex flex-wrap items-center gap-3">
        <input
          aria-label={t('page.titleLabel')}
          value={draft.title}
          maxLength={MAX_TITLE_LENGTH}
          onChange={(event) => setField('title', event.target.value)}
          onBlur={() => {
            // An empty title cannot be saved: put the last saved one back instead of leaving it blank.
            if (draft.title.trim() === '') setField('title', link.title)
          }}
          className="min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-2 py-1 text-2xl font-semibold hover:border-neutral-300 focus-visible:border-indigo-500 focus-visible:outline-none dark:hover:border-neutral-700"
        />
        <SaveIndicator status={status} problem={problem} />
        <Button variant="secondary" onClick={() => setConfirmingDelete(true)}>
          {t('page.delete')}
        </Button>
      </div>

      <div className="flex items-start gap-2">
        <div className="flex-1">
          <TextField
            label={t('page.urlLabel')}
            type="url"
            inputMode="url"
            autoComplete="off"
            value={draft.url}
            error={urlInvalid ? t('page.urlInvalid') : undefined}
            onChange={(event) => setField('url', event.target.value)}
          />
        </div>
        {!urlInvalid && (
          <a
            href={draft.url.trim()}
            target="_blank"
            rel="noopener noreferrer nofollow"
            aria-label={t('page.openAria', { title: draft.title.trim() || link.title })}
            className="mt-6 inline-flex shrink-0 items-center justify-center rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 dark:bg-indigo-500 dark:hover:bg-indigo-400"
          >
            {t('page.open')}
          </a>
        )}
      </div>

      <TextAreaField
        label={t('page.noteLabel')}
        placeholder={t('page.notePlaceholder')}
        value={draft.note}
        rows={6}
        onChange={(event) => setField('note', event.target.value)}
      />

      <TagEditor
        tags={draft.tags}
        onChange={(tags) => setField('tags', tags)}
        suggestions={knownTags}
      />

      {confirmingDelete && (
        <ConfirmDialog
          title={t('deleteDialog.title')}
          confirmLabel={t('deleteDialog.confirm')}
          cancelLabel={t('deleteDialog.cancel')}
          destructive
          busy={deleteLink.isPending}
          onConfirm={confirmDelete}
          onCancel={() => {
            deleteLink.reset()
            setConfirmingDelete(false)
          }}
        >
          <p>{t('deleteDialog.body', { title: draft.title.trim() || link.title })}</p>
          {deleteLink.isError && (
            <div className="mt-3">
              <Alert tone="error">{errorMessage(deleteLink.error)}</Alert>
            </div>
          )}
        </ConfirmDialog>
      )}
    </div>
  )
}
