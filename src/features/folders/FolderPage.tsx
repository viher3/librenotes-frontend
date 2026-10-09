import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router-dom'
import { Breadcrumbs } from '@/components/Breadcrumbs'
import { Button } from '@/components/Button'
import { CardSection, ItemCard } from '@/components/ItemCard'
import { isApiError } from '@/data/errors'
import { errorMessage } from '@/features/auth/errors'
import { formatRelativeTime } from '@/lib/format'
import { useNewDocument } from '@/features/documents/useNewDocument'
import { siteName } from '@/features/links/hostname'
import { useNewLink } from '@/features/links/NewLinkProvider'
import { useFolderContents } from '@/features/tree/queries'
import { Alert } from '@/components/Alert'

/** The contents of one folder: its sub-folders, documents and links, with the way back up. */
export default function FolderPage() {
  const { id = '' } = useParams()
  const { t, i18n } = useTranslation('tree')
  const query = useFolderContents(id)
  const { createDocument, pending, error } = useNewDocument()
  const newLink = useNewLink()

  if (query.isPending) {
    return (
      <p role="status" className="text-sm text-neutral-500">
        {t('loading')}
      </p>
    )
  }

  if (query.isError) {
    const missing = isApiError(query.error) && query.error.status === 404
    return (
      <div className="flex max-w-md flex-col items-start gap-3">
        <h2 className="text-xl font-semibold">
          {missing ? t('folderPage.notFoundTitle') : t('folderPage.loadError')}
        </h2>
        <p className="text-sm text-neutral-600 dark:text-neutral-300">
          {missing ? t('folderPage.notFoundBody') : errorMessage(query.error)}
        </p>
        {missing ? (
          <Link
            to="/"
            className="text-sm font-medium text-indigo-600 underline dark:text-indigo-400"
          >
            {t('folderPage.back')}
          </Link>
        ) : (
          <Button variant="secondary" onClick={() => void query.refetch()}>
            {t('retry')}
          </Button>
        )}
      </div>
    )
  }

  const { folder, subfolders, notes, links } = query.data
  if (!folder) return null // the top level is the home page
  const language = i18n.resolvedLanguage ?? 'en'
  const empty = subfolders.length + notes.length + links.length === 0

  return (
    <div className="flex flex-col gap-5">
      <Breadcrumbs path={folder.path} current={folder.name} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-2xl font-semibold">{folder.name}</h2>
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() => createDocument({ type: 'folder', id: folder.id })}
            disabled={pending}
          >
            {t('folderPage.newDocument')}
          </Button>
          <Button
            variant="secondary"
            onClick={() => newLink.open({ type: 'folder', id: folder.id })}
          >
            {t('folderPage.newLink')}
          </Button>
        </div>
      </div>
      {error && <Alert tone="error">{error}</Alert>}

      {empty && (
        <p className="rounded-lg border border-dashed border-neutral-300 p-8 text-center text-sm text-neutral-500 dark:border-neutral-700">
          {t('folderPage.empty')}
        </p>
      )}

      {subfolders.length > 0 && (
        <CardSection title={t('folderPage.folders')}>
          {subfolders.map((sub) => (
            <ItemCard key={sub.id} to={`/folder/${sub.id}`} icon="📁" title={sub.name} />
          ))}
        </CardSection>
      )}
      {notes.length > 0 && (
        <CardSection title={t('folderPage.documents')}>
          {notes.map((note) => (
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
      {links.length > 0 && (
        <CardSection title={t('folderPage.links')}>
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
    </div>
  )
}
