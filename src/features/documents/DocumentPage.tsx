import { lazy, Suspense, useDeferredValue, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { Alert } from '@/components/Alert'
import { Button } from '@/components/Button'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { isApiError } from '@/data/errors'
import type { Note } from '@/data/types'
import { errorMessage } from '@/features/auth/errors'
import { Breadcrumbs } from '@/components/Breadcrumbs'
import { MarkdownPreview } from './MarkdownPreview'
import { useNewLink } from '@/features/links/NewLinkProvider'
import { SubDocuments } from './SubDocuments'
import { TagEditor } from '@/features/tags/TagEditor'
import { useTags } from '@/features/tags/queries'
import { useNewDocument } from './useNewDocument'
import { useDeleteNote, useNote, useSaveNote } from './queries'
import { SaveIndicator } from './SaveIndicator'
import { useAutosave } from './useAutosave'
import { useSaveGuards } from './useSaveGuards'
import { useViewMode, type ViewMode } from './useViewMode'

// CodeMirror and its language support are large: they load only when a document is opened.
const MarkdownEditor = lazy(() => import('./MarkdownEditor'))

const MAX_TITLE_LENGTH = 255
const isTitleValid = (title: string) => title.trim() !== '' && title.length <= MAX_TITLE_LENGTH

export default function DocumentPage() {
  const { id = '' } = useParams()
  const { t } = useTranslation('documents')
  const query = useNote(id)

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
          {missing ? t('notFound.title') : t('loadError.title')}
        </h2>
        <p className="text-sm text-neutral-600 dark:text-neutral-300">
          {missing ? t('notFound.body') : errorMessage(query.error)}
        </p>
        {missing ? (
          <Link
            to="/"
            className="text-sm font-medium text-indigo-600 underline dark:text-indigo-400"
          >
            {t('notFound.back')}
          </Link>
        ) : (
          <Button variant="secondary" onClick={() => void query.refetch()}>
            {t('loadError.retry')}
          </Button>
        )}
      </div>
    )
  }

  // `key` makes opening another document start from a clean draft.
  return <DocumentEditor key={query.data.id} note={query.data} />
}

function DocumentEditor({ note }: { note: Note }) {
  const { t, i18n } = useTranslation('documents')
  const navigate = useNavigate()
  const isNew = (useLocation().state as { isNew?: boolean } | null)?.isNew === true
  const save = useSaveNote(note.id)
  const deleteNote = useDeleteNote()
  const [mode, setMode] = useViewMode()
  const [pinned, setPinned] = useState(note.pinned)
  const [pinError, setPinError] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const titleRef = useRef<HTMLInputElement>(null)
  const { createDocument, pending: creating, error: createError } = useNewDocument()
  const newLink = useNewLink()

  const { draft, status, setField, flush, discard } = useAutosave({
    initial: { title: note.title, content: note.content, tags: note.tags },
    save,
    isValid: (field, value) => (field === 'title' ? isTitleValid(value as string) : true),
  })
  const titleMissing = !isTitleValid(draft.title)
  const knownTags = useTags().data?.map((tag) => tag.name) ?? []
  const preview = useDeferredValue(draft.content)

  // A brand-new document opens with its placeholder title selected, so typing names it.
  useEffect(() => {
    if (isNew) titleRef.current?.select()
  }, [isNew])

  useEffect(() => {
    document.title = `${draft.title.trim() || t('untitled')} · ${i18n.t('appName')}`
    return () => {
      document.title = i18n.t('appName')
    }
  }, [draft.title, i18n, t])

  const unsaved = status !== 'saved' || titleMissing
  useSaveGuards({ flush, unsaved })

  const togglePin = async () => {
    const next = !pinned
    setPinned(next)
    setPinError(false)
    try {
      await save({ pinned: next })
    } catch {
      setPinned(!next)
      setPinError(true)
    }
  }

  const confirmDelete = () =>
    deleteNote.mutate(note.id, {
      onSuccess: () => {
        discard() // the document is gone: do not try to save it again
        navigate('/', { replace: true })
      },
    })

  const showEditor = mode !== 'preview'
  const showPreview = mode !== 'edit'

  return (
    <div className="flex h-full min-h-[28rem] flex-col gap-3">
      <Breadcrumbs path={note.path} current={draft.title.trim() || t('untitled')} />
      <div className="flex flex-wrap items-center gap-3">
        <input
          ref={titleRef}
          aria-label={t('editor.titleLabel')}
          value={draft.title}
          maxLength={MAX_TITLE_LENGTH}
          autoFocus={isNew}
          onChange={(event) => setField('title', event.target.value)}
          onBlur={() => {
            // An empty title cannot be saved: put the last saved one back instead of leaving it blank.
            if (draft.title.trim() === '') setField('title', note.title)
          }}
          className="min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-2 py-1 text-2xl font-semibold hover:border-neutral-300 focus-visible:border-indigo-500 focus-visible:outline-none dark:hover:border-neutral-700"
        />
        <SaveIndicator
          status={status}
          problem={titleMissing ? t('status.titleRequired') : undefined}
        />
        <ViewSwitch mode={mode} onChange={setMode} />
        <Button variant="secondary" onClick={() => void togglePin()} aria-pressed={pinned}>
          {pinned ? t('editor.unpin') : t('editor.pin')}
        </Button>
        <Button variant="secondary" onClick={() => setConfirmingDelete(true)}>
          {t('editor.delete')}
        </Button>
      </div>

      <TagEditor
        tags={draft.tags}
        onChange={(tags) => setField('tags', tags)}
        suggestions={knownTags}
      />

      {pinError && <Alert tone="error">{t('pinFailed')}</Alert>}
      {createError && <Alert tone="error">{createError}</Alert>}

      <SubDocuments
        noteId={note.id}
        adding={creating}
        onAdd={() => createDocument({ type: 'note', id: note.id })}
        onAddLink={() => newLink.open({ type: 'note', id: note.id })}
      />

      <div
        className={`grid min-h-0 flex-1 gap-3 ${mode === 'split' ? 'grid-rows-2 md:grid-cols-2 md:grid-rows-1' : ''}`}
      >
        {showEditor && (
          <div className="min-h-0 overflow-auto rounded-md border border-neutral-200 dark:border-neutral-800">
            <Suspense
              fallback={<p className="p-3 text-sm text-neutral-500">{t('common:loading')}</p>}
            >
              <MarkdownEditor
                value={draft.content}
                onChange={(value) => setField('content', value)}
                label={t('editor.contentLabel')}
                autoFocus={!isNew}
              />
            </Suspense>
          </div>
        )}
        {showPreview && (
          <section
            aria-label={t('editor.previewLabel')}
            className="min-h-0 overflow-auto rounded-md border border-neutral-200 p-4 dark:border-neutral-800"
          >
            {draft.content.trim() === '' ? (
              <p className="text-sm text-neutral-500">{t('editor.emptyPreview')}</p>
            ) : (
              <MarkdownPreview source={preview} />
            )}
          </section>
        )}
      </div>

      {confirmingDelete && (
        <ConfirmDialog
          title={t('deleteDialog.title')}
          confirmLabel={t('deleteDialog.confirm')}
          cancelLabel={t('deleteDialog.cancel')}
          destructive
          busy={deleteNote.isPending}
          onConfirm={confirmDelete}
          onCancel={() => {
            deleteNote.reset()
            setConfirmingDelete(false)
          }}
        >
          <p>{t('deleteDialog.body', { title: draft.title.trim() || t('untitled') })}</p>
          {deleteNote.isError && (
            <div className="mt-3">
              <Alert tone="error">{errorMessage(deleteNote.error)}</Alert>
            </div>
          )}
        </ConfirmDialog>
      )}
    </div>
  )
}

function ViewSwitch({ mode, onChange }: { mode: ViewMode; onChange: (mode: ViewMode) => void }) {
  const { t } = useTranslation('documents')
  return (
    <div
      role="group"
      aria-label={t('editor.viewMode')}
      className="inline-flex overflow-hidden rounded-md border border-neutral-300 dark:border-neutral-700"
    >
      {(['edit', 'split', 'preview'] as const).map((value) => (
        <button
          key={value}
          type="button"
          aria-pressed={mode === value}
          onClick={() => onChange(value)}
          className={`px-3 py-2 text-sm ${mode === value ? 'bg-neutral-200 font-medium dark:bg-neutral-800' : 'hover:bg-neutral-100 dark:hover:bg-neutral-900'}`}
        >
          {t(`editor.mode.${value}`)}
        </button>
      ))}
    </div>
  )
}
