import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { EditableIcon } from '@/components/EditableIcon'
import { useTranslation } from 'react-i18next'
import { Link, useBlocker, useLocation, useNavigate, useParams } from 'react-router-dom'
import { Alert } from '@/components/Alert'
import { Button } from '@/components/Button'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { isApiError } from '@/data/errors'
import type { Note, UpdateNoteInput } from '@/data/types'
import { errorMessage } from '@/features/auth/errors'
import { Breadcrumbs } from '@/components/Breadcrumbs'
import { AttachmentsPanel } from '@/features/attachments/AttachmentsPanel'
import { imageMarkdown } from '@/features/attachments/files'
import { useAttachmentUploads } from '@/features/attachments/queries'
import { useNoteKey } from '@/features/encryption/EncryptionProvider'
import { LockedDocument } from '@/features/encryption/LockedDocument'
import { OptionsDialog } from '@/features/encryption/OptionsDialog'
import { PasswordDialog } from '@/features/encryption/PasswordDialog'
import { cryptoErrorMessage } from '@/features/encryption/rules'
import { createNoteKey, decryptContent, encryptContent, type NoteKey } from '@/lib/crypto/envelope'
import { useFileDrop } from '@/features/attachments/useFileDrop'
import type { EditorHandle } from './visual/VisualEditor'
import { useNewLink } from '@/features/links/NewLinkProvider'
import { SubDocuments } from './SubDocuments'
import { TagEditor } from '@/features/tags/TagEditor'
import { useTags } from '@/features/tags/queries'
import { useNewDocument } from './useNewDocument'
import { useMoveDialog } from '@/features/tree/useMoveDialog'
import { useDeleteNote, useNote, useSaveNote } from './queries'
import { SaveIndicator } from './SaveIndicator'
import { useAutosave } from './useAutosave'
import { useSaveGuards } from './useSaveGuards'
import { useEditorMode, type EditorMode } from './useEditorMode'
import { clearDraft, loadDraft, storeDraft } from './localDraft'

// Both editors are large: only the one in use is loaded.
const VisualEditor = lazy(() => import('./visual/VisualEditor'))
const MarkdownEditor = lazy(() => import('./MarkdownEditor'))

const MAX_TITLE_LENGTH = 255
const isTitleValid = (title: string) => title.trim() !== '' && title.length <= MAX_TITLE_LENGTH

export default function DocumentPage() {
  const { id = '' } = useParams()
  const { t } = useTranslation('documents')
  const query = useNote(id)

  if (query.isPending) {
    return (
      <p role="status" className="text-sm text-neutral-600 dark:text-neutral-400">
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
  return <DocumentGate key={query.data.id} note={query.data} />
}

/** An unlocked document's plaintext, valid for the stored text and the key it was read with. */
interface Decrypted {
  source: string
  key: NoteKey
  content: string
}

/**
 * Decides what to show for a document: the editor, or (when it is encrypted and the password has not been given
 * in this tab) the unlock screen. The editor always works on plaintext; encrypting happens when it saves.
 */
function DocumentGate({ note }: { note: Note }) {
  const { t } = useTranslation('encryption')
  const { key, unlock, lock } = useNoteKey(note.id)
  const [plain, setPlain] = useState<Decrypted | null>(null)
  const [notice, setNotice] = useState<string | undefined>()

  // Locked again (timer, sign-out, button): do not keep the plaintext around.
  if (!key && plain) setPlain(null)

  const current = plain && plain.key === key && plain.source === note.content ? plain : null

  // The key is known but the plaintext is not yet (e.g. coming back to a document that stayed unlocked).
  useEffect(() => {
    if (!note.encrypted || !key || current) return
    let cancelled = false
    decryptContent(key, note.content, note.id).then(
      (content) => {
        if (!cancelled) setPlain({ source: note.content, key, content })
      },
      (error: unknown) => {
        if (cancelled) return
        setNotice(cryptoErrorMessage(t, error))
        lock()
      },
    )
    return () => {
      cancelled = true
    }
  }, [note.encrypted, note.content, note.id, key, current, lock, t])

  if (note.encrypted && !key) {
    return (
      <LockedDocument
        note={note}
        notice={notice}
        onUnlocked={(unlockedKey, content) => {
          setNotice(undefined)
          setPlain({ source: note.content, key: unlockedKey, content })
          unlock(unlockedKey)
        }}
      />
    )
  }

  if (note.encrypted && !current) {
    return (
      <p role="status" className="text-sm text-neutral-600 dark:text-neutral-400">
        {t('decrypting')}
      </p>
    )
  }

  return (
    <DocumentEditor
      note={note.encrypted && current ? { ...note, content: current.content } : note}
      noteKey={note.encrypted ? (key ?? null) : null}
      onKeyChange={(change) => {
        if (change) {
          setPlain({ source: change.stored, key: change.key, content: change.content })
          unlock(change.key)
        } else lock()
      }}
      onLock={lock}
    />
  )
}

interface DocumentEditorProps {
  /** Its content is plaintext, whether or not the document is encrypted. */
  note: Note
  /** The key while the document is encrypted: what the content is encrypted with when it is saved. */
  noteKey: NoteKey | null
  /** Encryption was turned on, changed (new key) or off (`null`). `stored` is what the server now holds. */
  onKeyChange: (change: { key: NoteKey; content: string; stored: string } | null) => void
  onLock: () => void
}

type EncryptionDialog = 'enable' | 'options' | 'change' | 'remove'

function DocumentEditor({ note, noteKey, onKeyChange, onLock }: DocumentEditorProps) {
  const { t, i18n } = useTranslation('documents')
  const { t: te } = useTranslation('encryption')
  const navigate = useNavigate()
  const location = useLocation()
  const locationState = location.state as { isNew?: boolean; edit?: boolean } | null
  const isNew = locationState?.isNew === true
  // Asked to open for editing (from the context menu).
  const editRequested = locationState?.edit === true
  const saveRaw = useSaveNote(note.id)
  // What the next save encrypts with. A ref, not the prop: it must change at the very moment encryption does,
  // so that no autosave in between sends the content in the wrong form.
  const cipher = useRef<NoteKey | null>(noteKey)
  const save = useCallback(
    async (changes: UpdateNoteInput) => {
      const key = cipher.current
      if (key && changes.content !== undefined) {
        changes = { ...changes, content: await encryptContent(key, changes.content, note.id) }
      }
      await saveRaw(changes)
    },
    [note.id, saveRaw],
  )
  const [encryptionDialog, setEncryptionDialog] = useState<EncryptionDialog | null>(null)
  const [removing, setRemoving] = useState(false)
  const [removeError, setRemoveError] = useState<string | null>(null)
  const deleteNote = useDeleteNote()
  const { t: tTree } = useTranslation('tree')
  const { openMove, dialog: moveDialog } = useMoveDialog()
  const [mode, setMode] = useEditorMode(note.id)
  const [pinned, setPinned] = useState(note.pinned)
  // Pinned from elsewhere (the context menu) while this page is open.
  const [seenPinned, setSeenPinned] = useState(note.pinned)
  if (seenPinned !== note.pinned) {
    setSeenPinned(note.pinned)
    setPinned(note.pinned)
  }
  const [pinError, setPinError] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [lossy, setLossy] = useState(false)
  const titleRef = useRef<HTMLTextAreaElement>(null)
  const { createDocument, pending: creating, error: createError } = useNewDocument()
  const newLink = useNewLink()
  const editor = useRef<EditorHandle>(null)
  const uploads = useAttachmentUploads({ type: 'note', id: note.id })
  const { dragging, dropProps } = useFileDrop(uploads.add)

  // Title and tags save by themselves; the content is saved when the user asks (Save), see below.
  const { draft, status, setField, flush, discard } = useAutosave({
    initial: { title: note.title, tags: note.tags },
    save,
    isValid: (field, value) => (field === 'title' ? isTitleValid(value as string) : true),
  })
  const titleMissing = !isTitleValid(draft.title)
  const knownTags = useTags().data?.map((tag) => tag.name) ?? []

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

  // Grow the title field with its content so a long title wraps instead of being cut off.
  useLayoutEffect(() => {
    const el = titleRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [draft.title])

  // The content: read as a page until the user starts editing, then kept as a draft until it is saved.
  const [recovered] = useState(() => (noteKey ? null : loadDraft(note.id, note.content)))
  const [restored, setRestored] = useState(recovered !== null)
  const [content, setContentState] = useState(recovered ?? note.content)
  const [saved, setSavedState] = useState(note.content)
  const contentRef = useRef(content)
  const savedRef = useRef(saved)
  const [editing, setEditing] = useState(isNew || recovered !== null || editRequested)
  const [savingContent, setSavingContent] = useState(false)
  const [contentError, setContentError] = useState<string | null>(null)
  const [confirmingDiscard, setConfirmingDiscard] = useState(false)
  // Where the user asked to start editing (a click on the page, or the Edit button): the cursor goes there.
  const focusRequest = useRef<{ x: number; y: number } | true | null>(null)
  const [started, setStarted] = useState(false) // the user chose to start editing (as opposed to a new document)
  const allowLeave = useRef(false)
  const contentDirty = content !== saved

  const setContent = (value: string) => {
    contentRef.current = value
    setContentState(value)
  }
  const markSaved = (value: string) => {
    savedRef.current = value
    setSavedState(value)
    setRestored(false)
  }

  // Unsaved content survives a crash or a reload in a local draft (never for encrypted documents).
  useEffect(() => {
    if (cipher.current) clearDraft(note.id)
    else if (content !== saved) storeDraft(note.id, saved, content)
    else clearDraft(note.id)
  }, [note.id, content, saved, noteKey])

  // Leaving the document through the app asks first; closing or reloading the page is handled in useSaveGuards.
  const blocker = useBlocker(() => {
    editor.current?.flush?.() // what was typed in the last moments counts too
    return !allowLeave.current && contentRef.current !== savedRef.current
  })

  useEffect(() => {
    if (!editing || focusRequest.current === null) return
    const request = focusRequest.current
    focusRequest.current = null
    editor.current?.focus?.(request === true ? undefined : request)
  }, [editing])

  const saveContent = async (): Promise<boolean> => {
    editor.current?.flush?.()
    const value = contentRef.current
    if (value === savedRef.current) return true
    setSavingContent(true)
    setContentError(null)
    try {
      await save({ content: value })
      markSaved(value)
      return true
    } catch (error) {
      setContentError(errorMessage(error))
      return false
    } finally {
      setSavingContent(false)
    }
  }

  const saveAndClose = async () => {
    if (await saveContent()) setEditing(false)
  }

  const startEditing = (point?: { x: number; y: number }) => {
    focusRequest.current = point ?? true
    setStarted(true)
    setEditing(true)
  }

  // Asked to edit again while this document is already open: a new navigation, not a new page.
  const [handledKey, setHandledKey] = useState(location.key)
  if (handledKey !== location.key) {
    setHandledKey(location.key)
    if (editRequested) {
      setStarted(true)
      setEditing(true)
    }
  }

  const stopEditing = () => {
    setContent(savedRef.current)
    clearDraft(note.id)
    setRestored(false)
    setContentError(null)
    setConfirmingDiscard(false)
    setEditing(false)
  }

  const saveAll = useCallback(async () => {
    await flush()
    if (editing) await saveContent()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flush, editing])

  const unsaved = status !== 'saved' || titleMissing || contentDirty
  useSaveGuards({ flush, save: saveAll, unsaved })

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

  /** Replaces what the server holds with `content` as plain text (`key` null) or encrypted with `key`. */
  const store = async (key: NoteKey | null) => {
    if (!(await flush())) throw new Error('unsaved changes')
    const previous = cipher.current
    cipher.current = key
    editor.current?.flush?.()
    const content = contentRef.current
    try {
      const stored = key ? await encryptContent(key, content, note.id) : content
      await saveRaw({ content: stored })
      markSaved(content)
      clearDraft(note.id)
      onKeyChange(key ? { key, content, stored } : null)
    } catch (error) {
      cipher.current = previous
      throw error
    }
  }

  const encrypt = async (password: string) => {
    await store(await createNoteKey(password))
    setEncryptionDialog(null)
  }

  const removeEncryption = async () => {
    setRemoving(true)
    setRemoveError(null)
    try {
      await store(null)
      setEncryptionDialog(null)
    } catch (error) {
      setRemoveError(cryptoErrorMessage(te, error))
    } finally {
      setRemoving(false)
    }
  }

  const lock = async () => {
    await flush()
    if (!(await saveContent())) return // the edits are kept on screen rather than lost by locking
    onLock()
  }

  const confirmDelete = () =>
    deleteNote.mutate(note.id, {
      onSuccess: () => {
        discard() // the document is gone: do not try to save it again
        allowLeave.current = true
        clearDraft(note.id)
        navigate('/', { replace: true })
      },
    })

  // Embeds an attached image where the cursor is; while the editor is still loading it goes at the end.
  const insertImage = (attachment: Note['attachments'][number]) => {
    const markup = imageMarkdown(attachment)
    if (editing && editor.current) editor.current.insert(markup)
    else {
      // Not editing yet: the image goes at the end and the page opens for editing.
      setContent(`${content}${content === '' ? '' : '\n\n'}${markup}\n`)
      setEditing(true)
    }
  }

  return (
    <div className="flex h-full min-h-[28rem] flex-col gap-3" {...dropProps}>
      <Breadcrumbs path={note.path} current={draft.title.trim() || t('untitled')} />
      <div className="flex items-center gap-3">
        <EditableIcon
          kind="note"
          icon={note.icon}
          pinned={pinned}
          name={draft.title.trim() || t('untitled')}
          describeError={errorMessage}
          onChange={(icon) => save({ icon })}
        />
        <textarea
          ref={titleRef}
          rows={1}
          aria-label={t('editor.titleLabel')}
          value={draft.title}
          maxLength={MAX_TITLE_LENGTH}
          autoFocus={isNew}
          onChange={(event) => setField('title', event.target.value.replace(/\n/g, ' '))}
          onKeyDown={(event) => {
            // The title is a single logical line that wraps visually: Enter must not add a break.
            if (event.key === 'Enter') event.preventDefault()
          }}
          onBlur={() => {
            // An empty title cannot be saved: put the last saved one back instead of leaving it blank.
            if (draft.title.trim() === '') setField('title', note.title)
          }}
          className="min-w-0 flex-1 resize-none overflow-hidden break-words rounded-md border border-transparent bg-transparent px-2 py-1 text-2xl font-semibold hover:border-neutral-300 focus-visible:border-indigo-500 focus-visible:outline-none dark:hover:border-neutral-700"
        />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <SaveIndicator
          status={savingContent ? 'saving' : contentDirty ? 'unsaved' : status}
          problem={titleMissing ? t('status.titleRequired') : undefined}
        />
        {editing ? (
          <>
            <Button onClick={() => void saveAndClose()} disabled={savingContent}>
              {t('editor.save')}
            </Button>
            <Button
              variant="secondary"
              disabled={savingContent}
              onClick={() => (contentDirty ? setConfirmingDiscard(true) : stopEditing())}
            >
              {t('editor.cancel')}
            </Button>
            <ModeSwitch mode={mode} onChange={setMode} />
          </>
        ) : (
          <Button variant="secondary" onClick={() => startEditing()}>
            {t('editor.edit')}
          </Button>
        )}
        {noteKey ? (
          <>
            <Button variant="secondary" onClick={() => void lock()}>
              {te('lock')}
            </Button>
            <Button variant="secondary" onClick={() => setEncryptionDialog('options')}>
              {te('options')}
            </Button>
          </>
        ) : (
          <Button variant="secondary" onClick={() => setEncryptionDialog('enable')}>
            {te('encrypt')}
          </Button>
        )}
        <Button variant="secondary" onClick={() => void togglePin()} aria-pressed={pinned}>
          {pinned ? t('editor.unpin') : t('editor.pin')}
        </Button>
        <Button
          variant="secondary"
          disabled={editing}
          onClick={() => openMove({ kind: 'note', id: note.id }, draft.title.trim() || note.title)}
        >
          {tTree('moveButton')}
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
      {restored && editing && <Alert>{t('draftRecovered')}</Alert>}
      {contentError && <Alert tone="error">{t('saveFailed')}</Alert>}
      {lossy && editing && mode === 'visual' && (
        <Alert>
          <span>{t('visual.lossy')}</span>{' '}
          <Button
            variant="ghost"
            className="px-2 py-0.5 text-xs"
            onClick={() => setMode('markdown')}
          >
            {t('visual.editAsMarkdown')}
          </Button>
        </Alert>
      )}
      {createError && <Alert tone="error">{createError}</Alert>}

      <SubDocuments
        noteId={note.id}
        adding={creating}
        onAdd={() => createDocument({ type: 'note', id: note.id })}
        onAddLink={() => newLink.open({ type: 'note', id: note.id })}
      />

      <AttachmentsPanel
        owner={{ type: 'note', id: note.id }}
        attachments={note.attachments}
        uploads={uploads}
        dragging={dragging}
        onInsert={insertImage}
      />

      <div
        className={`min-h-[16rem] flex-1 overflow-auto rounded-md ${editing ? 'border border-neutral-200 dark:border-neutral-800' : 'cursor-text'}`}
        onClick={(event) => {
          if (editing) return
          // Links open, and selecting text to copy it is not a request to edit.
          if ((event.target as HTMLElement).closest('a')) return
          if (!window.getSelection()?.isCollapsed) return
          startEditing({ x: event.clientX, y: event.clientY })
        }}
      >
        <Suspense
          fallback={
            <p className="p-3 text-sm text-neutral-600 dark:text-neutral-400">
              {t('common:loading')}
            </p>
          }
        >
          {editing && mode === 'markdown' ? (
            <MarkdownEditor
              key={`markdown-${note.id}`}
              value={content}
              onChange={setContent}
              label={t('editor.contentLabel')}
              autoFocus={!isNew || started}
              handleRef={editor}
            />
          ) : (
            <VisualEditor
              // Another document starts from a clean editor.
              key={`visual-${note.id}`}
              value={content}
              onChange={setContent}
              label={t('editor.contentLabel')}
              readOnly={!editing}
              autoFocus={editing && !isNew}
              handleRef={editor}
              onLossy={() => setLossy(true)}
            />
          )}
        </Suspense>
      </div>

      {(encryptionDialog === 'enable' || encryptionDialog === 'change') && (
        <PasswordDialog
          kind={encryptionDialog}
          onSubmit={encrypt}
          onClose={() => setEncryptionDialog(null)}
        />
      )}
      {encryptionDialog === 'options' && (
        <OptionsDialog
          onChangePassword={() => setEncryptionDialog('change')}
          onRemove={() => {
            setRemoveError(null)
            setEncryptionDialog('remove')
          }}
          onClose={() => setEncryptionDialog(null)}
        />
      )}
      {encryptionDialog === 'remove' && (
        <ConfirmDialog
          title={te('remove.title')}
          confirmLabel={te('remove.confirm')}
          cancelLabel={te('remove.cancel')}
          destructive
          busy={removing}
          onConfirm={() => void removeEncryption()}
          onCancel={() => setEncryptionDialog(null)}
        >
          <p>{te('remove.body')}</p>
          {removeError && (
            <div className="mt-3">
              <Alert tone="error">{removeError}</Alert>
            </div>
          )}
        </ConfirmDialog>
      )}

      {confirmingDiscard && (
        <ConfirmDialog
          title={t('discardDialog.title')}
          confirmLabel={t('discardDialog.confirm')}
          cancelLabel={t('discardDialog.cancel')}
          destructive
          onConfirm={stopEditing}
          onCancel={() => setConfirmingDiscard(false)}
        >
          <p>{t('discardDialog.body')}</p>
        </ConfirmDialog>
      )}

      {blocker.state === 'blocked' && (
        <ConfirmDialog
          title={t('leaveDialog.title')}
          confirmLabel={t('leaveDialog.confirm')}
          cancelLabel={t('leaveDialog.cancel')}
          destructive
          onConfirm={() => {
            clearDraft(note.id)
            blocker.proceed()
          }}
          onCancel={() => blocker.reset()}
        >
          <p>{t('leaveDialog.body')}</p>
        </ConfirmDialog>
      )}

      {moveDialog}
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

function ModeSwitch({
  mode,
  onChange,
}: {
  mode: EditorMode
  onChange: (mode: EditorMode) => void
}) {
  const { t } = useTranslation('documents')
  return (
    <div
      role="group"
      aria-label={t('editor.modeLabel')}
      className="inline-flex overflow-hidden rounded-md border border-neutral-300 dark:border-neutral-700"
    >
      {(['visual', 'markdown'] as const).map((value) => (
        <button
          key={value}
          type="button"
          aria-pressed={mode === value}
          onClick={() => onChange(value)}
          className={`px-3 py-2 text-sm ${mode === value ? 'bg-neutral-200 font-medium dark:bg-neutral-800' : 'hover:bg-neutral-100 dark:hover:bg-neutral-900'}`}
        >
          {value === 'visual' ? t('editor.modeVisual') : t('editor.modeMarkdown')}
        </button>
      ))}
    </div>
  )
}
