import { useId, useState, type ChangeEvent, type KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { MAX_TAGS, MAX_TAG_LENGTH, normalizeTags } from '@/data/rules'

interface TagEditorProps {
  tags: string[]
  onChange: (tags: string[]) => void
  /** Names offered while typing (the tags already in use elsewhere). Those already on the item are left out. */
  suggestions?: string[]
}

/**
 * Chips for the tags of an item plus a field to add more: Enter or a comma adds what was typed (pasting a list
 * separated by commas adds them all). Names are normalized and checked with the backend's rules before anything is
 * sent, so a save can never fail because of a tag.
 */
export function TagEditor({ tags, onChange, suggestions = [] }: TagEditorProps) {
  const { t } = useTranslation('tags')
  const [text, setText] = useState('')
  const [problem, setProblem] = useState<'too_long' | 'too_many' | null>(null)
  const listId = useId()

  /** Adds each non-empty name; stops at the first one that breaks a rule and says which. */
  const add = (names: string[]) => {
    let current = tags
    for (const name of names) {
      if (name.trim() === '') continue
      const result = normalizeTags([...current, name])
      if (result.problem === 'too_long' || result.problem === 'too_many') {
        setProblem(result.problem)
        if (current.length !== tags.length) onChange(current) // keep what fitted before the limit
        return false
      }
      current = result.tags // a duplicate leaves the list as it was
    }
    setProblem(null)
    if (current !== tags && current.length !== tags.length) onChange(current)
    return true
  }

  const commit = () => {
    if (add([text])) setText('')
  }

  const onInput = (event: ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value
    setProblem(null)
    if (!value.includes(',')) return setText(value)
    // Typing or pasting "a, b, c": everything before the last comma is complete.
    const parts = value.split(',')
    const rest = parts.pop() ?? ''
    if (add(parts)) setText(rest)
    else setText(value)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault() // never submit a surrounding form
      commit()
    }
  }

  const remove = (name: string) => {
    setProblem(null)
    onChange(tags.filter((tag) => tag !== name))
  }

  const offered = suggestions.filter((name) => !tags.includes(name))

  return (
    <div
      role="group"
      aria-label={t('editor.label')}
      className="flex flex-wrap items-center gap-2 text-sm"
    >
      {tags.length > 0 && (
        <ul className="flex flex-wrap items-center gap-1.5">
          {tags.map((name) => (
            <li
              key={name}
              className="flex items-center rounded-full bg-neutral-100 ps-2.5 pe-1 dark:bg-neutral-800"
            >
              <Link to={`/tag/${encodeURIComponent(name)}`} className="py-0.5 hover:underline">
                {name}
              </Link>
              <button
                type="button"
                aria-label={t('editor.remove', { name })}
                onClick={() => remove(name)}
                className="ms-1 grid size-5 place-items-center rounded-full text-neutral-500 hover:bg-neutral-200 hover:text-neutral-900 dark:hover:bg-neutral-700 dark:hover:text-neutral-100"
              >
                <span aria-hidden="true">{REMOVE}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <input
        aria-label={t('editor.add')}
        placeholder={t('editor.placeholder')}
        value={text}
        list={listId}
        maxLength={MAX_TAG_LENGTH * 2}
        aria-invalid={problem ? true : undefined}
        onChange={onInput}
        onKeyDown={onKeyDown}
        onBlur={commit}
        className="min-w-32 flex-1 rounded-md border border-transparent bg-transparent px-2 py-0.5 hover:border-neutral-300 focus-visible:border-indigo-500 focus-visible:outline-none dark:hover:border-neutral-700"
      />
      <datalist id={listId}>
        {offered.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>
      {problem && (
        <p role="alert" className="w-full text-xs text-red-600 dark:text-red-400">
          {problem === 'too_long'
            ? t('editor.tooLong', { max: MAX_TAG_LENGTH })
            : t('editor.tooMany', { max: MAX_TAGS })}
        </p>
      )}
    </div>
  )
}

const REMOVE = '×'
