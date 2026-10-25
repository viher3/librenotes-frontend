import type { MouseEvent, ReactNode } from 'react'
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

/** A titled grid of cards. */
export function CardSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section aria-label={title} className="flex flex-col gap-2">
      <h3 className="text-sm font-semibold tracking-wide text-neutral-600 dark:text-neutral-400 uppercase">
        {title}
      </h3>
      <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{children}</ul>
    </section>
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
}

/** A document, folder or link as a card that leads to it. */
export function ItemCard({ to, href, icon, title, detail, onMove, onContextMenu }: ItemCardProps) {
  const className =
    'flex flex-col gap-0.5 rounded-lg border border-neutral-200 p-3 hover:bg-neutral-50 focus-visible:outline-2 focus-visible:outline-indigo-500 dark:border-neutral-800 dark:hover:bg-neutral-900'
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
        <Link to={to} className={className}>
          {content}
        </Link>
      ) : (
        <a href={href} target="_blank" rel="noopener noreferrer nofollow" className={className}>
          {content}
        </a>
      )}
      {onMove && <CardMoveButton name={title} onClick={onMove} />}
    </li>
  )
}
