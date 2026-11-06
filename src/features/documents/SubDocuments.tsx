import { useTranslation } from 'react-i18next'
import { iconFor } from '@/components/itemIcons'
import { Link } from 'react-router-dom'
import { Button } from '@/components/Button'
import { PICKED, SelectCheckbox, pickHandlers } from '@/components/ItemCard'
import type { ID } from '@/data/types'
import { branchKey } from '@/features/tree/expanded'
import { useNoteChildren } from '@/features/tree/queries'
import { SelectionToggle } from '@/features/tree/SelectionBar'
import { cardSelection, type Selection } from '@/features/tree/useSelection'
import type { useBulkActions } from '@/features/tree/useBulkActions'

/** The documents (and links) placed under this one, with a button to add another. Shown only if there are any. */
export function SubDocuments({
  noteId,
  onAdd,
  onAddLink,
  adding,
  selection,
  onItemContextMenu,
}: {
  noteId: ID
  onAdd: () => void
  onAddLink: () => void
  adding: boolean
  /** The page's selection: the sub-documents and links can be picked together with the files. */
  selection: Selection
  onItemContextMenu: ReturnType<typeof useBulkActions>['onContextMenu']
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
      <h3 className="font-medium text-neutral-600 dark:text-neutral-400">
        {t('subDocuments.title')}
      </h3>
      {notes.map((note) => {
        const item = { kind: 'note', id: note.id } as const
        const pick = cardSelection(selection, item)
        return (
          <span
            key={note.id}
            className={`group/card inline-flex items-center gap-1.5 rounded-full border border-neutral-300 ps-3 pe-3 hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800 ${pick.selected ? PICKED : ''}`}
            onContextMenu={onItemContextMenu(item, {
              kind: 'note',
              id: note.id,
              name: note.title,
              pinned: note.pinned,
              childCount: note.childCount,
            })}
          >
            {selection.active && <SelectCheckbox name={note.title} selection={pick} />}
            <Link to={`/doc/${note.id}`} className="py-0.5" {...pickHandlers(pick)}>
              <span aria-hidden="true">
                {iconFor('note', note.icon, note.pinned, note.encrypted)}{' '}
              </span>
              {note.title}
            </Link>
          </span>
        )
      })}
      {links.map((link) => {
        const item = { kind: 'link', id: link.id } as const
        const pick = cardSelection(selection, item)
        return (
          <span
            key={link.id}
            className={`group/card inline-flex items-center gap-1.5 rounded-full border border-neutral-300 ps-3 pe-3 hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800 ${pick.selected ? PICKED : ''}`}
            onContextMenu={onItemContextMenu(item, { kind: 'link', id: link.id, name: link.title })}
          >
            {selection.active && <SelectCheckbox name={link.title} selection={pick} />}
            <Link to={`/link/${link.id}`} className="py-0.5" {...pickHandlers(pick)}>
              <span aria-hidden="true">{iconFor('link', link.icon)} </span>
              {link.title}
            </Link>
          </span>
        )
      })}
      {!hasChildren && !query.isPending && (
        <span className="text-neutral-600 dark:text-neutral-400">{t('subDocuments.none')}</span>
      )}
      <Button variant="ghost" className="px-2 py-0.5 text-xs" onClick={onAdd} disabled={adding}>
        {t('subDocuments.add')}
      </Button>
      <Button variant="ghost" className="px-2 py-0.5 text-xs" onClick={onAddLink}>
        {t('subDocuments.addLink')}
      </Button>
      {(hasChildren || selection.active) && <SelectionToggle selection={selection} />}
    </section>
  )
}
