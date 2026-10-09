import { useTranslation } from 'react-i18next'
import { Alert } from '@/components/Alert'
import { Button } from '@/components/Button'
import { CardSection, ItemCard } from '@/components/ItemCard'
import { errorMessage } from '@/features/auth/errors'
import { siteName } from './hostname'
import { useNewLink } from './NewLinkProvider'
import { useLinks } from './queries'

/** Every saved link, newest first. */
export default function LinksPage() {
  const { t } = useTranslation('links')
  const { open } = useNewLink()
  const query = useLinks()
  const links = query.data?.pages.flatMap((page) => page.items) ?? []

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-2xl font-semibold">{t('list.title')}</h2>
        <Button onClick={() => open()}>{t('new')}</Button>
      </div>

      {query.isError && (
        <div className="flex flex-col items-start gap-2">
          <Alert tone="error">
            {t('list.loadError')} {errorMessage(query.error)}
          </Alert>
          <Button variant="secondary" onClick={() => void query.refetch()}>
            {t('list.retry')}
          </Button>
        </div>
      )}

      {query.isPending && (
        <p role="status" className="text-sm text-neutral-500">
          {t('common:loading')}
        </p>
      )}

      {query.isSuccess && links.length === 0 && (
        <div className="rounded-lg border border-dashed border-neutral-300 p-8 text-center dark:border-neutral-700">
          <p className="font-medium">{t('list.empty')}</p>
          <p className="mt-1 text-sm text-neutral-500">{t('list.emptyHint')}</p>
        </div>
      )}

      {links.length > 0 && (
        <CardSection title={t('list.title')}>
          {links.map((link) => (
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

      {query.hasNextPage && (
        <Button
          variant="secondary"
          className="self-start"
          disabled={query.isFetchingNextPage}
          onClick={() => void query.fetchNextPage()}
        >
          {t('list.loadMore')}
        </Button>
      )}
    </div>
  )
}
