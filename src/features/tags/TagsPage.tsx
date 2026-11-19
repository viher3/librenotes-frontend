import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { Alert } from '@/components/Alert'
import { Button } from '@/components/Button'
import { errorMessage } from '@/features/auth/errors'
import { useTags } from './queries'

/** Every tag in use, with how many items carry it. */
export default function TagsPage() {
  const { t } = useTranslation('tags')
  const query = useTags()
  const tags = query.data ?? []

  return (
    <div className="flex flex-col gap-5">
      <h2 className="text-2xl font-semibold">{t('list.title')}</h2>
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
      {query.isSuccess && tags.length === 0 && (
        <p className="text-sm text-neutral-600 dark:text-neutral-400">{t('list.empty')}</p>
      )}
      {tags.length > 0 && (
        <ul aria-label={t('title')} className="flex flex-wrap gap-2">
          {tags.map(({ name, count }) => (
            <li key={name}>
              <Link
                to={`/tag/${encodeURIComponent(name)}`}
                aria-label={`${name} (${t('list.itemCount', { count })})`}
                className="flex items-center gap-2 rounded-full border border-neutral-200 px-3 py-1 text-sm hover:bg-neutral-100 dark:border-neutral-800 dark:hover:bg-neutral-900"
              >
                <span>{name}</span>
                <span className="text-xs text-neutral-600 dark:text-neutral-400">{count}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
