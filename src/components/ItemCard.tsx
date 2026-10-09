import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

/** A titled grid of cards. */
export function CardSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section aria-label={title} className="flex flex-col gap-2">
      <h3 className="text-sm font-semibold tracking-wide text-neutral-500 uppercase">{title}</h3>
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
}

/** A document, folder or link as a card that leads to it. */
export function ItemCard({ to, href, icon, title, detail }: ItemCardProps) {
  const className =
    'flex flex-col gap-0.5 rounded-lg border border-neutral-200 p-3 hover:bg-neutral-50 focus-visible:outline-2 focus-visible:outline-indigo-500 dark:border-neutral-800 dark:hover:bg-neutral-900'
  const content = (
    <>
      <span className="flex items-center gap-2 font-medium">
        <span aria-hidden="true">{icon}</span>
        <span className="truncate">{title}</span>
      </span>
      {detail && <span className="truncate text-xs text-neutral-500">{detail}</span>}
    </>
  )
  return (
    <li>
      {to ? (
        <Link to={to} className={className}>
          {content}
        </Link>
      ) : (
        <a href={href} target="_blank" rel="noopener noreferrer nofollow" className={className}>
          {content}
        </a>
      )}
    </li>
  )
}
