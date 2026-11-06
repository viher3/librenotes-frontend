import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import {
  CARD_GROUP,
  CardMoveButton,
  CardSection,
  ItemCard,
  PICKED,
  SectionCheckbox,
  SelectCheckbox,
  pickHandlers,
  type CardSelection,
  type SectionSelection,
} from '@/components/ItemCard'
import { iconFor } from '@/components/itemIcons'
import { Alert } from '@/components/Alert'
import { Button } from '@/components/Button'
import type { BulkItem, NoteSummary } from '@/data/types'
import { errorMessage } from '@/features/auth/errors'
import { formatRelativeTime } from '@/lib/format'
import { siteName } from '@/features/links/hostname'
import { useRootLinks } from '@/features/links/queries'
import { useFolderContents } from '@/features/tree/queries'
import { SelectionBar, SelectionToggle } from '@/features/tree/SelectionBar'
import { cardSelection, useSelection, type Selection } from '@/features/tree/useSelection'
import { useBulkActions } from '@/features/tree/useBulkActions'
import { useMoveDialog } from '@/features/tree/useMoveDialog'
import { useNotesList, useRootNotes } from './queries'

interface Picking {
  selection: Selection
  onContextMenu: ReturnType<typeof useBulkActions>['onContextMenu']
}

const noteItem = (note: NoteSummary): BulkItem => ({ kind: 'note', id: note.id })

function DocumentCard({
  note,
  onMove,
  picking,
}: {
  note: NoteSummary
  onMove: () => void
  picking: Picking
}) {
  const { t, i18n } = useTranslation('documents')
  const selection: CardSelection = cardSelection(picking.selection, noteItem(note))
  return (
    <li
      className={CARD_GROUP}
      onContextMenu={picking.onContextMenu(noteItem(note), {
        kind: 'note',
        id: note.id,
        name: note.title,
        pinned: note.pinned,
        childCount: note.childCount,
      })}
    >
      <Link
        to={`/doc/${note.id}`}
        className={`flex flex-col gap-1 rounded-lg border border-neutral-200 p-3 ps-9 hover:bg-neutral-50 focus-visible:outline-2 focus-visible:outline-indigo-500 dark:border-neutral-800 dark:hover:bg-neutral-900 ${
          selection.selected ? PICKED : ''
        }`}
        {...pickHandlers(selection)}
      >
        <span className="flex items-center gap-2 font-medium">
          {note.icon && <span aria-hidden="true">{note.icon}</span>}
          {note.pinned && (
            <span role="img" aria-label={t('home.pinnedLabel')} title={t('home.pinnedLabel')}>
              📌
            </span>
          )}
          {note.encrypted && (
            <span role="img" aria-label={t('home.encryptedLabel')} title={t('home.encryptedLabel')}>
              🔒
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
      <SelectCheckbox
        name={note.title}
        selection={selection}
        className="absolute start-3 top-3.5"
      />
      {!selection.active && <CardMoveButton name={note.title} onClick={onMove} />}
    </li>
  )
}

function Section({
  title,
  notes,
  onMove,
  picking,
}: {
  title: string
  notes: NoteSummary[]
  onMove: (note: NoteSummary) => void
  picking: Picking
}) {
  if (notes.length === 0) return null
  const selectAll: SectionSelection | undefined = picking.selection.active
    ? picking.selection.section(notes.map(noteItem))
    : undefined
  return (
    <section aria-label={title} className="flex flex-col gap-2">
      <h3 className="flex items-center gap-2 text-sm font-semibold tracking-wide text-neutral-600 dark:text-neutral-400 uppercase">
        {selectAll && <SectionCheckbox title={title} selectAll={selectAll} />}
        {title}
      </h3>
      <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {notes.map((note) => (
          <DocumentCard key={note.id} note={note} onMove={() => onMove(note)} picking={picking} />
        ))}
      </ul>
    </section>
  )
}

const FOLDER_PAGE_SIZE = 12

function MoreButton({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  const { t } = useTranslation('documents')
  return (
    <Button variant="secondary" className="self-start" disabled={disabled} onClick={onClick}>
      {t('home.loadMore')}
    </Button>
  )
}

export function HomePage() {
  const { t } = useTranslation('documents')
  const { t: tTree } = useTranslation('tree')
  const { openMove, dialog } = useMoveDialog()
  const moveNote = (note: NoteSummary) => openMove({ kind: 'note', id: note.id }, note.title)
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
    size: 6,
  })

  const root = useRootNotes()
  const rootFolders = useFolderContents(null)
  const rootLinks = useRootLinks()
  const [shownFolders, setShownFolders] = useState(FOLDER_PAGE_SIZE)
  const allFolders = rootFolders.data?.subfolders ?? []
  const folderItems = allFolders.slice(0, shownFolders)
  const linkItems = rootLinks.data?.pages.flatMap((page) => page.items) ?? []
  const rootItems = root.data?.pages.flatMap((page) => page.items) ?? []

  // Everything the page shows, in the order it is shown.
  const folderPicks: BulkItem[] = folderItems.map((f) => ({ kind: 'folder', id: f.id }))
  const linkPicks: BulkItem[] = linkItems.map((l) => ({ kind: 'link', id: l.id }))
  const selection = useSelection([
    ...(pinned.data?.items ?? []).map(noteItem),
    ...(recent.data?.items ?? []).map(noteItem),
    ...folderPicks,
    ...rootItems.map(noteItem),
    ...linkPicks,
  ])
  const bulk = useBulkActions(selection)
  const picking: Picking = { selection, onContextMenu: bulk.onContextMenu }

  const loading =
    pinned.isPending ||
    recent.isPending ||
    root.isPending ||
    rootFolders.isPending ||
    rootLinks.isPending
  const failure = pinned.error ?? recent.error ?? root.error ?? rootFolders.error ?? rootLinks.error
  const isEmpty =
    !loading &&
    !failure &&
    pinned.data?.total === 0 &&
    recent.data?.total === 0 &&
    rootItems.length === 0 &&
    allFolders.length === 0 &&
    linkItems.length === 0

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-2xl font-semibold">{t('home.title')}</h2>
        <SelectionToggle selection={selection} />
      </div>
      <SelectionBar
        selection={selection}
        onMove={bulk.moveSelected}
        onDelete={bulk.deleteSelected}
      />

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
              void root.refetch()
              void rootFolders.refetch()
              void rootLinks.refetch()
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

      <Section
        title={t('home.pinned')}
        notes={pinned.data?.items ?? []}
        onMove={moveNote}
        picking={picking}
      />
      <Section
        title={t('home.recent')}
        notes={recent.data?.items ?? []}
        onMove={moveNote}
        picking={picking}
      />
      {(allFolders.length > 0 || rootItems.length > 0 || linkItems.length > 0) && (
        <section aria-label={t('home.root')} className="flex flex-col gap-4">
          <h3 className="text-sm font-semibold tracking-wide text-neutral-600 dark:text-neutral-400 uppercase">
            {t('home.root')}
          </h3>
          {folderItems.length > 0 && (
            <CardSection
              title={tTree('folderPage.folders')}
              selectAll={selection.active ? selection.section(folderPicks) : undefined}
            >
              {folderItems.map((folder) => (
                <ItemCard
                  key={folder.id}
                  to={`/folder/${folder.id}`}
                  icon={iconFor('folder', folder.icon)}
                  title={folder.name}
                  selection={cardSelection(selection, { kind: 'folder', id: folder.id })}
                  onContextMenu={bulk.onContextMenu(
                    { kind: 'folder', id: folder.id },
                    { kind: 'folder', id: folder.id, name: folder.name },
                  )}
                />
              ))}
            </CardSection>
          )}
          {allFolders.length > shownFolders && (
            <MoreButton onClick={() => setShownFolders((n) => n + FOLDER_PAGE_SIZE)} />
          )}
          <Section
            title={tTree('folderPage.documents')}
            notes={rootItems}
            onMove={moveNote}
            picking={picking}
          />
          {root.hasNextPage && (
            <MoreButton
              disabled={root.isFetchingNextPage}
              onClick={() => void root.fetchNextPage()}
            />
          )}
          {linkItems.length > 0 && (
            <CardSection
              title={tTree('folderPage.links')}
              selectAll={selection.active ? selection.section(linkPicks) : undefined}
            >
              {linkItems.map((link) => (
                <ItemCard
                  key={link.id}
                  to={`/link/${link.id}`}
                  icon={iconFor('link', link.icon)}
                  title={link.title}
                  detail={siteName(link.url)}
                  onMove={() => openMove({ kind: 'link', id: link.id }, link.title)}
                  selection={cardSelection(selection, { kind: 'link', id: link.id })}
                  onContextMenu={bulk.onContextMenu(
                    { kind: 'link', id: link.id },
                    { kind: 'link', id: link.id, name: link.title },
                  )}
                />
              ))}
            </CardSection>
          )}
          {rootLinks.hasNextPage && (
            <MoreButton
              disabled={rootLinks.isFetchingNextPage}
              onClick={() => void rootLinks.fetchNextPage()}
            />
          )}
        </section>
      )}
      {dialog}
      {bulk.dialogs}
    </div>
  )
}
