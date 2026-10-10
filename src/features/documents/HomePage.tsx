import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { Alert } from '@/components/Alert'
import { Button } from '@/components/Button'
import type { NoteSummary } from '@/data/types'
import { errorMessage } from '@/features/auth/errors'
import { formatRelativeTime } from '@/lib/format'
import { useNotesList } from './queries'

function DocumentCard({ note }: { note: NoteSummary }) {
  const { t, i18n } = useTranslation('documents')
  return (
    <li>
      <Link
        to={`/doc/${note.id}`}
        className="flex flex-col gap-1 rounded-lg border border-neutral-200 p-3 hover:bg-neutral-50 focus-visible:outline-2 focus-visible:outline-indigo-500 dark:border-neutral-800 dark:hover:bg-neutral-900"
      >
        <span className="flex items-center gap-2 font-medium">
          {note.pinned && (
            <span role="img" aria-label={t('home.pinnedLabel')} title={t('home.pinnedLabel')}>
              📌
            </span>
          )}
          <span className="truncate">{note.title}</span>
        </span>
        <span className="text-xs text-neutral-600 dark:text-neutral-400">
          {t('home.updated', {
            when: formatRelativeTime(note.updatedAt, i18n.resolvedLanguage ?? 'en'),
          })}
        </span>
        {note.tags.length > 0 && (
          <span className="flex flex-wrap gap-1">
            {note.tags.map((tag) => (
              <span
                key={tag}
                className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs dark:bg-neutral-800"
              >
                {tag}
              </span>
            ))}
          </span>
        )}
      </Link>
    </li>
  )
}

function Section({ title, notes }: { title: string; notes: NoteSummary[] }) {
  if (notes.length === 0) return null
  return (
    <section aria-label={title} className="flex flex-col gap-2">
      <h3 className="text-sm font-semibold tracking-wide text-neutral-600 dark:text-neutral-400 uppercase">
        {title}
      </h3>
      <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {notes.map((note) => (
          <DocumentCard key={note.id} note={note} />
        ))}
      </ul>
    </section>
  )
}

export function HomePage() {
  const { t } = useTranslation('documents')
  const pinned = useNotesList({
    pinned: true,
    orderBy: 'updatedAt',
    orderDirection: 'desc',
    size: 50,
  })
  const recent = useNotesList({
    pinned: false,
    orderBy: 'updatedAt',
    orderDirection: 'desc',
    size: 20,
  })

  const loading = pinned.isPending || recent.isPending
  const failure = pinned.error ?? recent.error
  const isEmpty = !loading && !failure && pinned.data?.total === 0 && recent.data?.total === 0

  return (
    <div className="flex flex-col gap-6">
      <h2 className="text-2xl font-semibold">{t('home.title')}</h2>

      {failure && (
        <div className="flex flex-col items-start gap-2">
          <Alert tone="error">
            {t('home.loadError')} {errorMessage(failure)}
          </Alert>
          <Button
            variant="secondary"
            onClick={() => {
              void pinned.refetch()
              void recent.refetch()
            }}
          >
            {t('home.retry')}
          </Button>
        </div>
      )}

      {isEmpty && (
        <div className="rounded-lg border border-dashed border-neutral-300 p-8 text-center dark:border-neutral-700">
          <p className="font-medium">{t('home.empty')}</p>
          <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
            {t('home.emptyHint')}
          </p>
        </div>
      )}

      <Section title={t('home.pinned')} notes={pinned.data?.items ?? []} />
      <Section title={t('home.recent')} notes={recent.data?.items ?? []} />
    </div>
  )
}
