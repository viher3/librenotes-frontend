import { useEffect, useRef, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'

/** Class of a card: the "Move" button is part of it and shows when the card is hovered or has focus. */
export const CARD_GROUP = 'group/card relative'

/** The "Move" button of a card, hidden until the card is hovered or something in it has focus. */
export function CardMoveButton({ name, onClick }: { name: string; onClick: () => void }) {
  const { t } = useTranslation('tree')
  return (
    <button
      type="button"
      aria-label={t('moveButtonLabel', { name })}
      onClick={onClick}
      className="absolute end-2 top-2 rounded-md border border-neutral-300 bg-white px-2 py-0.5 text-xs opacity-0 group-hover/card:opacity-100 group-focus-within/card:opacity-100 focus-visible:opacity-100 hover:bg-neutral-100 focus-visible:outline-2 focus-visible:outline-indigo-500 dark:border-neutral-700 dark:bg-neutral-900 dark:hover:bg-neutral-800"
    >
      {t('moveButton')}
    </button>
  )
}

/** How a card takes part in a selection: whether it is picked, whether selection mode is on, and the way to toggle it. */
export interface CardSelection {
  selected: boolean
  /** Selection mode: a click picks the card instead of opening it. */
  active: boolean
  onToggle: (options: { range: boolean }) => void
}

/** The "select all" of a section: none, some or all of its items picked. */
export interface SectionSelection {
  state: 'none' | 'some' | 'all'
  toggle: () => void
}

const CHECKBOX =
  'size-4 shrink-0 cursor-pointer accent-indigo-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500'

/** The checkbox of a card (or of a file row): always visible in selection mode, otherwise on hover or focus. */
export function SelectCheckbox({
  name,
  selection,
  className = '',
}: {
  name: string
  selection: CardSelection
  className?: string
}) {
  const { t } = useTranslation('tree')
  return (
    <input
      type="checkbox"
      aria-label={t('bulk.selectItem', { name })}
      checked={selection.selected}
      onChange={() => undefined}
      onClick={(event) => selection.onToggle({ range: event.shiftKey })}
      className={`${CHECKBOX} ${
        selection.active
          ? ''
          : 'opacity-0 group-hover/card:opacity-100 group-focus-within/card:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100'
      } ${className}`}
    />
  )
}

/** What a click or Space on a card does while something is being picked (or with Ctrl/Cmd/Shift held). */
export function pickHandlers(selection: CardSelection | undefined) {
  if (!selection) return {}
  return {
    onClick: (event: MouseEvent) => {
      if (selection.active || event.ctrlKey || event.metaKey || event.shiftKey) {
        event.preventDefault()
        selection.onToggle({ range: event.shiftKey })
      }
    },
    onKeyDown: (event: KeyboardEvent) => {
      if (event.key === ' ' && selection.active) {
        event.preventDefault()
        selection.onToggle({ range: event.shiftKey })
      }
    },
  }
}

/** Classes that show a card is picked: a ring and a tint, so it does not depend on colour alone. */
export const PICKED = 'ring-2 ring-indigo-500 bg-indigo-50 dark:bg-indigo-950/40'

/** A titled grid of cards. In selection mode its header has a checkbox that picks the whole section. */
export function CardSection({
  title,
  children,
  selectAll,
}: {
  title: string
  children: ReactNode
  selectAll?: SectionSelection
}) {
  return (
    <section aria-label={title} className="flex flex-col gap-2">
      <h3 className="flex items-center gap-2 text-sm font-semibold tracking-wide text-neutral-600 dark:text-neutral-400 uppercase">
        {selectAll && <SectionCheckbox title={title} selectAll={selectAll} />}
        {title}
      </h3>
      <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{children}</ul>
    </section>
  )
}

/** The checkbox of a section header: checked when all its items are picked, mixed when only some are. */
export function SectionCheckbox({
  title,
  selectAll,
}: {
  title: string
  selectAll: SectionSelection
}) {
  const { t } = useTranslation('tree')
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = selectAll.state === 'some'
  }, [selectAll.state])
  return (
    <input
      ref={ref}
      type="checkbox"
      aria-label={t('bulk.selectSection', { section: title })}
      checked={selectAll.state === 'all'}
      onChange={() => selectAll.toggle()}
      className={CHECKBOX}
    />
  )
}

interface ItemCardProps {
  /** Internal destination. */
  to?: string
  /** External destination (opens in a new tab). */
  href?: string
  icon: string
  title: string
  detail?: string
  /** When given, a "Move" button shows on hover. */
  onMove?: () => void
  /** Right button pressed on the card. */
  onContextMenu?: (event: MouseEvent) => void
  /** When given, the card can be picked together with others. */
  selection?: CardSelection
}

/** A document, folder or link as a card that leads to it. */
export function ItemCard({
  to,
  href,
  icon,
  title,
  detail,
  onMove,
  onContextMenu,
  selection,
}: ItemCardProps) {
  const className = `flex flex-col gap-0.5 rounded-lg border border-neutral-200 p-3 hover:bg-neutral-50 focus-visible:outline-2 focus-visible:outline-indigo-500 dark:border-neutral-800 dark:hover:bg-neutral-900 ${
    selection ? 'ps-9' : ''
  } ${selection?.selected ? PICKED : ''}`
  const pick = pickHandlers(selection)
  const content = (
    <>
      <span className="flex items-center gap-2 font-medium">
        <span aria-hidden="true">{icon}</span>
        <span className="truncate">{title}</span>
      </span>
      {detail && (
        <span className="truncate text-xs text-neutral-600 dark:text-neutral-400">{detail}</span>
      )}
    </>
  )
  return (
    <li className={CARD_GROUP} onContextMenu={onContextMenu}>
      {to ? (
        <Link to={to} className={className} {...pick}>
          {content}
        </Link>
      ) : (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className={className}
          {...pick}
        >
          {content}
        </a>
      )}
      {selection && (
        <SelectCheckbox name={title} selection={selection} className="absolute start-3 top-3.5" />
      )}
      {onMove && !selection?.active && <CardMoveButton name={title} onClick={onMove} />}
    </li>
  )
}
