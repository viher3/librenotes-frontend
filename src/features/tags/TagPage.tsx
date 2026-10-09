import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router-dom'
import { Alert } from '@/components/Alert'
import { Button } from '@/components/Button'
import { CardSection, ItemCard } from '@/components/ItemCard'
import { errorMessage } from '@/features/auth/errors'
import { siteName } from '@/features/links/hostname'
import { formatRelativeTime } from '@/lib/format'
import { normalizeTag } from '@/data/rules'
import { useTaggedLinks, useTaggedNotes } from './queries'

/** Everything that carries one tag: documents and links, a page at a time. */
export default function TagPage() {
  const { name: rawName = '' } = useParams()
  const name = normalizeTag(rawName)
  const { t, i18n } = useTranslation('tags')
  const notes = useTaggedNotes(name)
  const links = useTaggedLinks(name)
  const language = i18n.resolvedLanguage ?? 'en'

  const failure = notes.error ?? links.error
  if (failure) {
    return (
      <div className="flex max-w-md flex-col items-start gap-3">
        <Alert tone="error">
          {t('page.loadError')} {errorMessage(failure)}
        </Alert>
        <Button
          variant="secondary"
          onClick={() => {
            void notes.refetch()
            void links.refetch()
          }}
        >
          {t('page.retry')}
        </Button>
      </div>
    )
  }

  if (notes.isPending || links.isPending) {
    return (
      <p role="status" className="text-sm text-neutral-500">
        {t('common:loading')}
      </p>
    )
  }

  const noteItems = notes.data.pages.flatMap((page) => page.items)
  const linkItems = links.data.pages.flatMap((page) => page.items)

  return (
    <div className="flex flex-col gap-5">
      <h2 className="text-2xl font-semibold">{t('page.title', { name })}</h2>

      {noteItems.length + linkItems.length === 0 && (
        <div className="flex flex-col items-start gap-3">
          <p className="rounded-lg border border-dashed border-neutral-300 p-8 text-sm text-neutral-500 dark:border-neutral-700">
            {t('page.empty', { name })}
          </p>
          <Link
            to="/"
            className="text-sm font-medium text-indigo-600 underline dark:text-indigo-400"
          >
            {t('page.back')}
          </Link>
        </div>
      )}

      {noteItems.length > 0 && (
        <CardSection title={t('page.documents')}>
          {noteItems.map((note) => (
            <ItemCard
              key={note.id}
              to={`/doc/${note.id}`}
              icon={note.pinned ? '📌' : '📄'}
              title={note.title}
              detail={formatRelativeTime(note.updatedAt, language)}
            />
          ))}
        </CardSection>
      )}
      {notes.hasNextPage && (
        <Button
          variant="secondary"
          className="self-start"
          disabled={notes.isFetchingNextPage}
          onClick={() => void notes.fetchNextPage()}
        >
          {t('page.loadMore')}
        </Button>
      )}

      {linkItems.length > 0 && (
        <CardSection title={t('page.links')}>
          {linkItems.map((link) => (
            <ItemCard
              key={link.id}
              to={`/link/${link.id}`}
              icon="🔗"
              title={link.title}
              detail={siteName(link.url)}
            />
          ))}
        </CardSection>
      )}
      {links.hasNextPage && (
        <Button
          variant="secondary"
          className="self-start"
          disabled={links.isFetchingNextPage}
          onClick={() => void links.fetchNextPage()}
        >
          {t('page.loadMore')}
        </Button>
      )}
    </div>
  )
}
