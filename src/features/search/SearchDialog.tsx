import { useId, useMemo, useState } from 'react'
import { iconFor } from '@/components/itemIcons'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { Alert } from '@/components/Alert'
import { Button } from '@/components/Button'
import { Modal } from '@/components/Modal'
import type { ID } from '@/data/types'
import { errorMessage } from '@/features/auth/errors'
import { highlight } from './highlight'
import { SEARCH_DEFAULTS, useDebounced, useSearchResults } from './queries'

const ATTACHMENT_ICON = '📎'

/** One row of the list, whatever it is. */
interface Entry {
  key: string
  kind: 'note' | 'folder' | 'attachment' | 'link'
  title: string
  icon: string
  /** Where it opens: a file opens the document or folder it belongs to. */
  path: string
  /** Shown under the title (the address of a link). */
  detail?: string
}

const folderPath = (id: ID) => `/folder/${id}`
const notePath = (id: ID) => `/doc/${id}`

function Marked({ text, query }: { text: string; query: string }) {
  return (
    <>
      {highlight(text, query).map((piece, index) =>
        piece.match ? (
          <mark
            key={index}
            className="rounded bg-yellow-200 px-0.5 text-inherit dark:bg-yellow-500/40"
          >
            {piece.text}
          </mark>
        ) : (
          piece.text
        ),
      )}
    </>
  )
}

/** Search over documents and links: type, move with the arrows, Enter opens. */
export function SearchDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation('search')
  const navigate = useNavigate()
  const listId = useId()
  const [text, setText] = useState('')
  const [active, setActive] = useState(0)
  const typed = text.trim()
  const q = useDebounced(typed, SEARCH_DEFAULTS.delayMs)
  const query = useSearchResults(q)

  const long = typed.length >= SEARCH_DEFAULTS.minLength
  const waiting = long && (typed !== q || query.isPending)
  const items: Entry[] = useMemo(() => {
    if (waiting || !query.data) return []
    const { notes, folders, attachments, links } = query.data
    return [
      ...notes.items.map((n): Entry => ({
        key: `note:${n.id}`,
        kind: 'note',
        title: n.title,
        icon: iconFor('note', n.icon),
        path: notePath(n.id),
      })),
      ...folders.items.map((f): Entry => ({
        key: `folder:${f.id}`,
        kind: 'folder',
        title: f.name,
        icon: iconFor('folder', f.icon),
        path: folderPath(f.id),
      })),
      ...links.items.map((l): Entry => ({
        key: `link:${l.id}`,
        kind: 'link',
        title: l.title,
        icon: iconFor('link', l.icon),
        path: `/link/${l.id}`,
        detail: l.url,
      })),
      ...attachments.items.map((a): Entry => ({
        key: `attachment:${a.id}`,
        kind: 'attachment',
        title: a.fileName,
        icon: ATTACHMENT_ICON,
        path: a.noteId ? notePath(a.noteId) : a.folderId ? folderPath(a.folderId) : '/',
      })),
    ]
  }, [waiting, query.data])
  const total = query.data
    ? query.data.notes.total +
      query.data.folders.total +
      query.data.links.total +
      query.data.attachments.total
    : 0
  const current = Math.min(active, Math.max(items.length - 1, 0))

  const open = (entry: Entry) => {
    onClose()
    navigate(entry.path)
  }

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (items.length === 0) return
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActive((current + 1) % items.length)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActive((current - 1 + items.length) % items.length)
    } else if (event.key === 'Enter') {
      event.preventDefault()
      open(items[current])
    }
  }

  const optionId = (index: number) => `${listId}-${index}`

  return (
    <Modal title={t('title')} onClose={onClose} width="md">
      <div className="mt-3 flex flex-col gap-3">
        <input
          type="search"
          role="combobox"
          aria-label={t('label')}
          aria-expanded={items.length > 0}
          aria-controls={listId}
          aria-activedescendant={items.length > 0 ? optionId(current) : undefined}
          aria-autocomplete="list"
          placeholder={t('placeholder')}
          value={text}
          onChange={(event) => {
            setText(event.target.value)
            setActive(0)
          }}
          onKeyDown={onKeyDown}
          className="w-full rounded-md border border-neutral-300 bg-transparent px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-indigo-500 dark:border-neutral-700"
        />

        <div role="status" className="text-sm text-neutral-600 dark:text-neutral-400">
          {!long && t('hint')}
          {waiting && t('searching')}
          {long && !waiting && query.data && items.length === 0 && t('none', { query: q })}
          {long && !waiting && items.length > 0 && t('count', { count: total })}
        </div>

        {query.isError && !waiting && (
          <Alert tone="error">
            <span>
              {t('error')} {errorMessage(query.error)}
            </span>{' '}
            <Button
              variant="ghost"
              className="px-2 py-0.5 text-xs"
              onClick={() => void query.refetch()}
            >
              {t('retry')}
            </Button>
          </Alert>
        )}

        <ul id={listId} role="listbox" aria-label={t('results')} className="flex flex-col gap-1">
          {items.map((entry, index) => (
            <li
              key={entry.key}
              id={optionId(index)}
              role="option"
              aria-selected={index === current}
              onMouseMove={() => setActive(index)}
              onClick={() => open(entry)}
              className={`cursor-pointer rounded-md px-3 py-2 text-sm ${
                index === current ? 'bg-neutral-200 dark:bg-neutral-800' : ''
              }`}
            >
              <div className="flex items-center gap-2">
                <span aria-hidden="true">{entry.icon}</span>
                <span className="min-w-0 flex-1 truncate font-medium">
                  <Marked text={entry.title || t('untitled')} query={q} />
                </span>
                <span className="text-xs text-neutral-600 dark:text-neutral-400">
                  {t(entry.kind)}
                </span>
              </div>
              {entry.detail && (
                <p className="mt-0.5 truncate text-xs text-neutral-600 dark:text-neutral-400">
                  <Marked text={entry.detail} query={q} />
                </p>
              )}
            </li>
          ))}
        </ul>

        {!waiting && total > items.length && items.length > 0 && (
          <p className="text-xs text-neutral-600 dark:text-neutral-400">
            {t('showing', { shown: items.length, total })}
          </p>
        )}
      </div>
    </Modal>
  )
}
