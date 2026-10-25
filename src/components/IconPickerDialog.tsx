import { useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { isIcon } from '@/data/rules'
import type { Icon } from '@/data/types'
import { Alert } from './Alert'
import { Button } from './Button'
import { EMOJI_CATALOG, EMOJI_CATEGORIES } from './emojis'
import { Modal } from './Modal'

interface IconPickerDialogProps {
  /** What the dialog is about, e.g. the name of the item. */
  name: string
  /** The icon the item has now (`null` when it uses the default one). */
  current: Icon
  /** The icon the item shows when none is chosen; "Use the default" brings it back. */
  defaultIcon: string
  /** Resolves when saved (the caller closes the dialog); a rejection is shown inside the dialog. */
  onSelect: (icon: Icon) => Promise<void>
  onCancel: () => void
  describeError: (error: unknown) => string
}

const fold = (text: string) => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()

/** Picks an emoji for an item from a curated list (searchable), or any emoji typed or pasted. */
export function IconPickerDialog({
  name,
  current,
  defaultIcon,
  onSelect,
  onCancel,
  describeError,
}: IconPickerDialogProps) {
  const { t } = useTranslation('common')
  const [query, setQuery] = useState('')
  const [custom, setCustom] = useState('')
  const [customError, setCustomError] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)
  const gridRef = useRef<HTMLDivElement>(null)

  const terms = useMemo(() => fold(query).split(/\s+/).filter(Boolean), [query])
  const sections = useMemo(
    () =>
      EMOJI_CATEGORIES.map((category) => ({
        category,
        emojis: EMOJI_CATALOG[category].filter(
          ([emoji, keywords]) =>
            terms.length === 0 ||
            terms.every((term) =>
              fold(`${emoji} ${keywords} ${t(`iconPicker.categories.${category}`)}`).includes(term),
            ),
        ),
      })).filter((section) => section.emojis.length > 0),
    [terms, t],
  )

  const choose = async (icon: Icon) => {
    setFailure(null)
    setBusy(true)
    try {
      await onSelect(icon)
    } catch (cause) {
      setFailure(describeError(cause))
      setBusy(false)
    }
  }

  const submitCustom = (event: FormEvent) => {
    event.preventDefault()
    const value = custom.trim()
    if (!isIcon(value)) {
      setCustomError(true)
      return
    }
    setCustomError(false)
    void choose(value)
  }

  // Arrow keys move through the emoji grid (one tab stop for the whole grid, like the document tree).
  const onGridKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const keys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End']
    if (!keys.includes(event.key)) return
    const buttons = [
      ...(gridRef.current?.querySelectorAll<HTMLButtonElement>('button[data-emoji]') ?? []),
    ]
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement)
    if (index < 0) return
    event.preventDefault()
    let next = index
    if (event.key === 'ArrowLeft') next = index - 1
    else if (event.key === 'ArrowRight') next = index + 1
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = buttons.length - 1
    else {
      // Up / down: the nearest button in the previous or next row, by horizontal position.
      const here = buttons[index].getBoundingClientRect()
      const direction = event.key === 'ArrowDown' ? 1 : -1
      const candidates = buttons.filter((button) => {
        const rect = button.getBoundingClientRect()
        return direction === 1 ? rect.top > here.bottom - 1 : rect.bottom < here.top + 1
      })
      const rowTop = candidates.length
        ? direction === 1
          ? Math.min(...candidates.map((button) => button.getBoundingClientRect().top))
          : Math.max(...candidates.map((button) => button.getBoundingClientRect().top))
        : null
      const row = candidates.filter((button) => button.getBoundingClientRect().top === rowTop)
      const target = row.sort(
        (a, b) =>
          Math.abs(a.getBoundingClientRect().left - here.left) -
          Math.abs(b.getBoundingClientRect().left - here.left),
      )[0]
      if (target) next = buttons.indexOf(target)
    }
    buttons[Math.max(0, Math.min(buttons.length - 1, next))]?.focus()
  }

  const firstEmoji = sections[0]?.emojis[0]?.[0]
  const tabStop = sections.some((s) => s.emojis.some(([e]) => e === current)) ? current : firstEmoji

  return (
    <Modal
      title={t('iconPicker.title', { name })}
      width="md"
      initialFocus={searchRef}
      busy={busy}
      onClose={onCancel}
    >
      <div className="mt-3 flex flex-col gap-3">
        {failure && <Alert tone="error">{failure}</Alert>}

        <div className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className="grid size-12 shrink-0 place-items-center rounded-lg border border-neutral-200 text-2xl dark:border-neutral-700"
          >
            {current ?? defaultIcon}
          </span>
          <p className="min-w-0 flex-1 text-sm text-neutral-600 dark:text-neutral-400">
            {current ? t('iconPicker.currentCustom') : t('iconPicker.currentDefault')}
          </p>
          <Button
            variant="secondary"
            disabled={busy || current === null}
            onClick={() => void choose(null)}
          >
            {t('iconPicker.useDefault')}
          </Button>
        </div>

        <input
          ref={searchRef}
          type="search"
          aria-label={t('iconPicker.searchLabel')}
          placeholder={t('iconPicker.searchPlaceholder')}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="w-full rounded-md border border-neutral-300 bg-transparent px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-indigo-500 dark:border-neutral-700"
        />

        <div
          ref={gridRef}
          onKeyDown={onGridKeyDown}
          className="flex max-h-72 flex-col gap-3 overflow-y-auto pe-1"
        >
          {sections.length === 0 && (
            <p
              role="status"
              className="py-4 text-center text-sm text-neutral-600 dark:text-neutral-400"
            >
              {t('iconPicker.noResults')}
            </p>
          )}
          {sections.map(({ category, emojis }) => (
            <section key={category} aria-label={t(`iconPicker.categories.${category}`)}>
              <h3 className="mb-1 text-xs font-semibold tracking-wide text-neutral-600 uppercase dark:text-neutral-400">
                {t(`iconPicker.categories.${category}`)}
              </h3>
              <div className="flex flex-wrap gap-1">
                {emojis.map(([emoji]) => (
                  <button
                    key={emoji}
                    type="button"
                    data-emoji
                    disabled={busy}
                    tabIndex={emoji === tabStop ? 0 : -1}
                    aria-pressed={emoji === current}
                    onClick={() => void choose(emoji)}
                    className={`grid size-9 place-items-center rounded-md text-xl hover:bg-neutral-100 focus-visible:outline-2 focus-visible:outline-indigo-500 disabled:opacity-60 dark:hover:bg-neutral-800 ${
                      emoji === current
                        ? 'bg-indigo-100 ring-2 ring-indigo-500 dark:bg-indigo-950'
                        : ''
                    }`}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>

        <form onSubmit={submitCustom} noValidate className="flex flex-col gap-1">
          <label htmlFor="icon-custom" className="text-sm font-medium">
            {t('iconPicker.customLabel')}
          </label>
          <div className="flex items-start gap-2">
            <input
              id="icon-custom"
              value={custom}
              autoComplete="off"
              aria-invalid={customError || undefined}
              aria-describedby={customError ? 'icon-custom-error' : undefined}
              onChange={(event) => {
                setCustom(event.target.value)
                setCustomError(false)
              }}
              className="w-24 rounded-md border border-neutral-300 bg-transparent px-3 py-2 text-center text-lg focus-visible:outline-2 focus-visible:outline-indigo-500 dark:border-neutral-700"
            />
            <Button type="submit" variant="secondary" disabled={busy || custom.trim() === ''}>
              {t('iconPicker.apply')}
            </Button>
          </div>
          {customError && (
            <p
              id="icon-custom-error"
              role="alert"
              className="text-sm text-red-600 dark:text-red-400"
            >
              {t('iconPicker.invalid')}
            </p>
          )}
        </form>

        <div className="flex justify-end">
          <Button variant="secondary" onClick={onCancel} disabled={busy}>
            {t('iconPicker.cancel')}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
