import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Alert } from '@/components/Alert'
import { Button } from '@/components/Button'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import type { ID, TrashKind } from '@/data/types'
import { errorMessage } from '@/features/auth/errors'
import { formatRelativeTime } from '@/lib/format'
import { useDeleteForever, useEmptyTrash, useRestore, useTrash } from './queries'

interface Row {
  kind: TrashKind
  id: ID
  name: string
  icon: string
  deletedAt: string
}

/** What was deleted, with the way back (restore) and the way out (delete for good, or empty everything). */
export default function TrashPage() {
  const { t, i18n } = useTranslation('trash')
  const language = i18n.resolvedLanguage ?? 'en'
  const query = useTrash()
  const restore = useRestore()
  const remove = useDeleteForever()
  const empty = useEmptyTrash()
  const [deleting, setDeleting] = useState<Row | null>(null)
  const [emptying, setEmptying] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)

  if (query.isPending) {
    return (
      <p role="status" className="text-sm text-neutral-600 dark:text-neutral-400">
        {t('common:loading')}
      </p>
    )
  }
  if (query.isError) {
    return (
      <div className="flex max-w-md flex-col items-start gap-3">
        <Alert tone="error">{t('loadError')}</Alert>
        <Button variant="secondary" onClick={() => void query.refetch()}>
          {t('retry')}
        </Button>
      </div>
    )
  }

  const { folders, notes, links, attachments } = query.data
  const sections: { key: string; rows: Row[] }[] = [
    {
      key: 'folders',
      rows: folders.map((f) => ({
        kind: 'folder',
        id: f.id,
        name: f.name,
        icon: '📁',
        deletedAt: f.deletedAt,
      })),
    },
    {
      key: 'notes',
      rows: notes.map((n) => ({
        kind: 'note',
        id: n.id,
        name: n.title,
        icon: '📄',
        deletedAt: n.deletedAt,
      })),
    },
    {
      key: 'links',
      rows: links.map((l) => ({
        kind: 'link',
        id: l.id,
        name: l.title,
        icon: '🔗',
        deletedAt: l.deletedAt,
      })),
    },
    {
      key: 'attachments',
      rows: attachments.map((a) => ({
        kind: 'attachment',
        id: a.id,
        name: a.fileName,
        icon: '📎',
        deletedAt: a.deletedAt,
      })),
    },
  ]
  const visible = sections.filter((section) => section.rows.length > 0)

  const onRestore = (row: Row) => {
    setProblem(null)
    restore.mutate(
      { kind: row.kind, id: row.id },
      { onError: (error) => setProblem(errorMessage(error)) },
    )
  }

  return (
    <div className="flex max-w-3xl flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-2xl font-semibold">{t('title')}</h2>
        {visible.length > 0 && (
          <Button
            variant="secondary"
            onClick={() => {
              empty.reset()
              setEmptying(true)
            }}
          >
            {t('emptyTrash')}
          </Button>
        )}
      </div>
      <p className="text-sm text-neutral-600 dark:text-neutral-400">{t('intro')}</p>
      {problem && <Alert tone="error">{problem}</Alert>}

      {visible.length === 0 && (
        <p className="rounded-lg border border-dashed border-neutral-300 p-8 text-center text-sm text-neutral-600 dark:border-neutral-700 dark:text-neutral-400">
          {t('empty')}
        </p>
      )}

      {visible.map((section) => (
        <section key={section.key} aria-label={t(`sections.${section.key}` as 'sections.folders')}>
          <h3 className="mb-1 text-sm font-medium text-neutral-600 dark:text-neutral-400">
            {t(`sections.${section.key}` as 'sections.folders')}
          </h3>
          <ul className="divide-y divide-neutral-200 rounded-md border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
            {section.rows.map((row) => (
              <li
                key={`${row.kind}:${row.id}`}
                className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm"
              >
                <span aria-hidden="true">{row.icon}</span>
                <span className="min-w-0 flex-1 truncate" title={row.name}>
                  {row.name}
                </span>
                <span className="text-xs text-neutral-600 dark:text-neutral-400">
                  {t('deleted', { when: formatRelativeTime(row.deletedAt, language) })}
                </span>
                <Button
                  variant="secondary"
                  className="px-2 py-0.5 text-xs"
                  aria-label={t('restoreLabel', { name: row.name })}
                  disabled={restore.isPending}
                  onClick={() => onRestore(row)}
                >
                  {t('restore')}
                </Button>
                <Button
                  variant="ghost"
                  className="px-2 py-0.5 text-xs"
                  aria-label={t('deleteForeverLabel', { name: row.name })}
                  onClick={() => {
                    remove.reset()
                    setDeleting(row)
                  }}
                >
                  {t('deleteForever')}
                </Button>
              </li>
            ))}
          </ul>
        </section>
      ))}

      {deleting && (
        <ConfirmDialog
          title={t('confirmDelete.title')}
          confirmLabel={t('confirmDelete.confirm')}
          cancelLabel={t('confirmDelete.cancel')}
          destructive
          busy={remove.isPending}
          onConfirm={() =>
            remove.mutate(
              { kind: deleting.kind, id: deleting.id },
              { onSuccess: () => setDeleting(null) },
            )
          }
          onCancel={() => setDeleting(null)}
        >
          <p>{t('confirmDelete.body', { name: deleting.name })}</p>
          {remove.isError && (
            <div className="mt-3">
              <Alert tone="error">{errorMessage(remove.error)}</Alert>
            </div>
          )}
        </ConfirmDialog>
      )}

      {emptying && (
        <ConfirmDialog
          title={t('confirmEmpty.title')}
          confirmLabel={t('confirmEmpty.confirm')}
          cancelLabel={t('confirmEmpty.cancel')}
          destructive
          busy={empty.isPending}
          onConfirm={() => empty.mutate(undefined, { onSuccess: () => setEmptying(false) })}
          onCancel={() => setEmptying(false)}
        >
          <p>{t('confirmEmpty.body')}</p>
          {empty.isError && (
            <div className="mt-3">
              <Alert tone="error">{errorMessage(empty.error)}</Alert>
            </div>
          )}
        </ConfirmDialog>
      )}
    </div>
  )
}
