import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { Alert } from '@/components/Alert'
import { Button } from '@/components/Button'
import { Modal } from '@/components/Modal'
import type { SearchResult } from '@/data/types'
import { errorMessage } from '@/features/auth/errors'
import { highlight } from './highlight'
import { SEARCH_DEFAULTS, useDebounced, useSearchResults } from './queries'

const pathOf = (result: SearchResult) =>
  result.type === 'note' ? `/doc/${result.id}` : `/link/${result.id}`

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
  const items = !waiting && query.data ? query.data.items : []
  const total = query.data?.total ?? 0
  const current = Math.min(active, Math.max(items.length - 1, 0))

  const open = (result: SearchResult) => {
    onClose()
    navigate(pathOf(result))
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
          {items.map((result, index) => (
            <li
              key={`${result.type}:${result.id}`}
              id={optionId(index)}
              role="option"
              aria-selected={index === current}
              onMouseMove={() => setActive(index)}
              onClick={() => open(result)}
              className={`cursor-pointer rounded-md px-3 py-2 text-sm ${
                index === current ? 'bg-neutral-200 dark:bg-neutral-800' : ''
              }`}
            >
              <div className="flex items-center gap-2">
                <span aria-hidden="true">{result.type === 'note' ? '📄' : '🔗'}</span>
                <span className="min-w-0 flex-1 truncate font-medium">
                  <Marked text={result.title || t('untitled')} query={q} />
                </span>
                <span className="text-xs text-neutral-600 dark:text-neutral-400">
                  {result.type === 'note' ? t('document') : t('link')}
                </span>
              </div>
              {result.snippet && (
                <p className="mt-0.5 line-clamp-2 text-xs break-words text-neutral-600 dark:text-neutral-400">
                  <Marked text={result.snippet} query={q} />
                </p>
              )}
              {result.url && (
                <p className="mt-0.5 truncate text-xs text-neutral-600 dark:text-neutral-400">
                  <Marked text={result.url} query={q} />
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
