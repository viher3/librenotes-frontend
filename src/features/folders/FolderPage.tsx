import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router-dom'
import { Breadcrumbs } from '@/components/Breadcrumbs'
import { Button } from '@/components/Button'
import { isApiError } from '@/data/errors'
import { errorMessage } from '@/features/auth/errors'
import { formatRelativeTime } from '@/lib/format'
import { useNewDocument } from '@/features/documents/useNewDocument'
import { useFolderContents } from '@/features/tree/queries'
import { Alert } from '@/components/Alert'

/** The contents of one folder: its sub-folders, documents and links, with the way back up. */
export default function FolderPage() {
  const { id = '' } = useParams()
  const { t, i18n } = useTranslation('tree')
  const query = useFolderContents(id)
  const { createDocument, pending, error } = useNewDocument()

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
        <Button
          onClick={() => createDocument({ type: 'folder', id: folder.id })}
          disabled={pending}
        >
          {t('folderPage.newDocument')}
        </Button>
      </div>
      {error && <Alert tone="error">{error}</Alert>}

      {empty && (
        <p className="rounded-lg border border-dashed border-neutral-300 p-8 text-center text-sm text-neutral-500 dark:border-neutral-700">
          {t('folderPage.empty')}
        </p>
      )}

      {subfolders.length > 0 && (
        <Section title={t('folderPage.folders')}>
          {subfolders.map((sub) => (
            <Card key={sub.id} to={`/folder/${sub.id}`} icon="📁" title={sub.name} />
          ))}
        </Section>
      )}
      {notes.length > 0 && (
        <Section title={t('folderPage.documents')}>
          {notes.map((note) => (
            <Card
              key={note.id}
              to={`/doc/${note.id}`}
              icon={note.pinned ? '📌' : '📄'}
              title={note.title}
              detail={formatRelativeTime(note.updatedAt, language)}
            />
          ))}
        </Section>
      )}
      {links.length > 0 && (
        <Section title={t('folderPage.links')}>
          {links.map((link) => (
            <Card key={link.id} href={link.url} icon="🔗" title={link.title} detail={link.url} />
          ))}
        </Section>
      )}
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section aria-label={title} className="flex flex-col gap-2">
      <h3 className="text-sm font-semibold tracking-wide text-neutral-500 uppercase">{title}</h3>
      <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{children}</ul>
    </section>
  )
}

function Card({
  to,
  href,
  icon,
  title,
  detail,
}: {
  to?: string
  href?: string
  icon: string
  title: string
  detail?: string
}) {
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
