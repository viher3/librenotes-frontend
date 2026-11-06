import { useState, type MouseEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Alert } from '@/components/Alert'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import type { ContextMenuItem } from '@/components/ContextMenu'
import type { BulkItem } from '@/data/types'
import { errorMessage } from '@/features/auth/errors'
import { useEntityMenu, type MenuEntity } from './EntityMenuProvider'
import { useTreeActions } from './queries'
import type { Selection } from './useSelection'
import { useMoveDialog } from './useMoveDialog'

/** "2 folders, 3 documents, 1 link": what a group of picked items is made of. */
function describeItems(items: BulkItem[], t: (key: string, options: { count: number }) => string) {
  const counts = (kind: BulkItem['kind']) => items.filter((item) => item.kind === kind).length
  return (['folder', 'note', 'link', 'attachment'] as const)
    .map((kind) => [kind, counts(kind)] as const)
    .filter(([, count]) => count > 0)
    .map(([kind, count]) => t(`bulk.counts.${kind}`, { count }))
    .join(', ')
}

/**
 * What can be done with the items picked on a page: move them, delete them, or open the right-click menu for the
 * selection. `dialogs` is what the page renders for it. The page's own selection is cleared when an action
 * succeeds.
 */
export function useBulkActions(selection: Selection) {
  const { t } = useTranslation('tree')
  const { t: tDocs } = useTranslation('documents')
  const entityMenu = useEntityMenu()
  const { bulkRemove } = useTreeActions()
  const { openMoveMany, dialog: moveDialog } = useMoveDialog()
  const [deleting, setDeleting] = useState(false)

  const moveSelected = () => openMoveMany(selection.items, selection.clear)
  const deleteSelected = () => {
    bulkRemove.reset()
    setDeleting(true)
  }
  const closeDelete = () => {
    bulkRemove.reset()
    setDeleting(false)
  }

  /**
   * The right-click handler for one item: on an item that is part of a selection of several it opens the menu of
   * the whole selection, anywhere else the item's own menu (when it has one).
   */
  const onContextMenu = (item: BulkItem, entity?: MenuEntity) => (event: MouseEvent) => {
    if (selection.isSelected(item) && selection.count > 1) {
      const items: ContextMenuItem[] = [
        {
          id: 'move',
          label: t('bulk.moveMenu', { count: selection.count }),
          onSelect: moveSelected,
        },
        {
          id: 'delete',
          label: t('bulk.deleteMenu', { count: selection.count }),
          destructive: true,
          onSelect: deleteSelected,
        },
        { id: 'clear', label: t('bulk.clear'), onSelect: selection.clear },
      ]
      entityMenu.openCustom(event, t('bulk.menuLabel', { count: selection.count }), items)
    } else if (entity) {
      entityMenu.open(event, entity)
    }
  }

  const dialogs = (
    <>
      {moveDialog}
      {deleting && (
        <ConfirmDialog
          title={t('bulk.deleteTitle', { count: selection.count })}
          confirmLabel={tDocs('deleteDialog.confirm')}
          cancelLabel={tDocs('deleteDialog.cancel')}
          destructive
          busy={bulkRemove.isPending}
          onCancel={closeDelete}
          onConfirm={() =>
            bulkRemove.mutate(selection.items, {
              onSuccess: () => {
                selection.clear()
                closeDelete()
              },
            })
          }
        >
          <p>{t('bulk.deleteBody', { items: describeItems(selection.items, t as never) })}</p>
          {selection.items.some((item) => item.kind === 'folder' || item.kind === 'note') && (
            <p className="mt-2">{t('bulk.deleteNested')}</p>
          )}
          {bulkRemove.isError && (
            <div className="mt-3">
              <Alert tone="error">{errorMessage(bulkRemove.error)}</Alert>
            </div>
          )}
        </ConfirmDialog>
      )}
    </>
  )

  return { moveSelected, deleteSelected, onContextMenu, dialogs, busy: bulkRemove.isPending }
}
