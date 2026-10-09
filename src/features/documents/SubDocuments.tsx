import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { Button } from '@/components/Button'
import type { ID } from '@/data/types'
import { branchKey } from '@/features/tree/expanded'
import { useNoteChildren } from '@/features/tree/queries'

/** The documents (and links) placed under this one, with a button to add another. Shown only if there are any. */
export function SubDocuments({
  noteId,
  onAdd,
  adding,
}: {
  noteId: ID
  onAdd: () => void
  adding: boolean
}) {
  const { t } = useTranslation('tree')
  const query = useNoteChildren(noteId)
  const notes = query.data?.notes ?? []
  const links = query.data?.links ?? []
  const hasChildren = notes.length + links.length > 0

  return (
    <section
      aria-label={t('subDocuments.title')}
      className="flex flex-wrap items-center gap-2 text-sm"
      data-branch={branchKey('note', noteId)}
    >
      <h3 className="font-medium text-neutral-500">{t('subDocuments.title')}</h3>
      {notes.map((note) => (
        <Link
          key={note.id}
          to={`/doc/${note.id}`}
          className="rounded-full border border-neutral-300 px-3 py-0.5 hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
        >
          <span aria-hidden="true">📄 </span>
          {note.title}
        </Link>
      ))}
      {links.map((link) => (
        <a
          key={link.id}
          href={link.url}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className="rounded-full border border-neutral-300 px-3 py-0.5 hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
        >
          <span aria-hidden="true">🔗 </span>
          {link.title}
        </a>
      ))}
      {!hasChildren && !query.isPending && (
        <span className="text-neutral-500">{t('subDocuments.none')}</span>
      )}
      <Button variant="ghost" className="px-2 py-0.5 text-xs" onClick={onAdd} disabled={adding}>
        {t('subDocuments.add')}
      </Button>
    </section>
  )
}
