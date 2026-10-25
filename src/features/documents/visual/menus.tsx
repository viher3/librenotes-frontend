import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import type { BlockId, MarkId } from './blocks'
import type { Anchor } from './interaction'

const panel =
  'fixed z-50 rounded-lg border border-neutral-200 bg-white p-1 shadow-lg dark:border-neutral-700 dark:bg-neutral-900'

/** Keeps a floating panel inside the window. */
function place(anchor: Anchor, width: number): { left: number; top: number } {
  const left = Math.max(8, Math.min(anchor.left - width / 2, window.innerWidth - width - 8))
  return { left, top: anchor.bottom + 6 }
}

export function SlashMenu({
  id,
  anchor,
  items,
  selected,
  onHover,
  onPick,
}: {
  id: string
  anchor: Anchor
  items: BlockId[]
  selected: number
  onHover: (index: number) => void
  onPick: (id: BlockId) => void
}) {
  const { t } = useTranslation('documents')
  const position = place(anchor, 256)

  return createPortal(
    <div
      className={`${panel} max-h-72 w-64 overflow-auto`}
      style={position}
      onMouseDown={(event) => event.preventDefault()}
    >
      {items.length === 0 ? (
        <p className="px-2 py-1.5 text-sm text-neutral-600 dark:text-neutral-400" role="status">
          {t('visual.noBlocks')}
        </p>
      ) : (
        <ul id={id} role="listbox" aria-label={t('visual.blocksLabel')}>
          {items.map((block, index) => (
            <li
              key={block}
              id={`${id}-${block}`}
              role="option"
              aria-selected={index === selected}
              onMouseMove={() => onHover(index)}
              onClick={() => onPick(block)}
              className={`cursor-pointer rounded px-2 py-1.5 text-sm ${
                index === selected ? 'bg-neutral-200 dark:bg-neutral-800' : ''
              }`}
            >
              <span className="font-medium">{t(`visual.blocks.${block}.label`)}</span>
              <span className="block text-xs text-neutral-600 dark:text-neutral-400">
                {t(`visual.blocks.${block}.hint`)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>,
    document.body,
  )
}

const MARKS: MarkId[] = ['bold', 'italic', 'strike', 'code', 'link']

export function BubbleMenu({
  anchor,
  active,
  onMark,
  onLink,
  onLinkInput,
  onClose,
}: {
  anchor: Anchor
  active: MarkId[]
  onMark: (id: MarkId) => void
  /** Returns false when the address is not acceptable. */
  onLink: (href: string) => boolean
  onLinkInput: (open: boolean) => void
  onClose: () => void
}) {
  const { t } = useTranslation('documents')
  const [editingLink, setEditingLink] = useState(false)
  const [href, setHref] = useState('')
  const [invalid, setInvalid] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const width = editingLink ? 288 : 176
  const position = {
    left: Math.max(8, Math.min(anchor.left - width / 2, window.innerWidth - width - 8)),
    top: Math.max(8, anchor.top - 44),
  }

  useEffect(() => {
    if (editingLink) input.current?.focus()
  }, [editingLink])

  const finish = () => {
    setEditingLink(false)
    setHref('')
    setInvalid(false)
    onLinkInput(false)
    onClose()
  }

  return createPortal(
    <div
      role="toolbar"
      aria-label={t('visual.toolbar')}
      className={`${panel} flex items-center gap-0.5`}
      style={position}
      onMouseDown={(event) => {
        if (event.target !== input.current) event.preventDefault()
      }}
    >
      {editingLink ? (
        <form
          className="flex items-center gap-1 px-1"
          onSubmit={(event) => {
            event.preventDefault()
            if (href.trim() === '') return finish()
            if (onLink(href)) finish()
            else setInvalid(true)
          }}
        >
          <input
            ref={input}
            type="text"
            inputMode="url"
            aria-label={t('visual.linkAddress')}
            aria-invalid={invalid}
            aria-describedby={invalid ? 'visual-link-error' : undefined}
            placeholder="https://"
            value={href}
            onChange={(event) => {
              setHref(event.target.value)
              setInvalid(false)
            }}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.stopPropagation()
                finish()
              }
            }}
            className="w-52 rounded border border-neutral-300 bg-transparent px-2 py-1 text-sm dark:border-neutral-700"
          />
          {invalid && (
            <span id="visual-link-error" role="alert" className="sr-only">
              {t('visual.linkInvalid')}
            </span>
          )}
          <button
            type="submit"
            className="rounded px-2 py-1 text-sm hover:bg-neutral-100 dark:hover:bg-neutral-800"
          >
            {t('visual.apply')}
          </button>
        </form>
      ) : (
        MARKS.map((mark) => (
          <button
            key={mark}
            type="button"
            aria-pressed={active.includes(mark)}
            aria-label={t(`visual.marks.${mark}`)}
            title={t(`visual.marks.${mark}`)}
            onClick={() => {
              if (mark === 'link' && !active.includes('link')) {
                onLinkInput(true)
                setEditingLink(true)
              } else onMark(mark)
            }}
            className={`rounded px-2 py-1 text-sm ${
              active.includes(mark)
                ? 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/50 dark:text-indigo-200'
                : 'hover:bg-neutral-100 dark:hover:bg-neutral-800'
            }`}
          >
            <span
              aria-hidden="true"
              className={
                mark === 'bold'
                  ? 'font-bold'
                  : mark === 'italic'
                    ? 'italic'
                    : mark === 'strike'
                      ? 'line-through'
                      : mark === 'code'
                        ? 'font-mono'
                        : ''
              }
            >
              {t(`visual.markGlyph.${mark}`)}
            </span>
          </button>
        ))
      )}
    </div>,
    document.body,
  )
}
