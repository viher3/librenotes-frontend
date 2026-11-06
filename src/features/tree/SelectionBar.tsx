import { useTranslation } from 'react-i18next'
import { Button } from '@/components/Button'
import { MAX_BULK_ITEMS } from '@/data/types'
import type { Selection } from './useSelection'

/** The "Select" / "Done" button of a page header. */
export function SelectionToggle({ selection }: { selection: Selection }) {
  const { t } = useTranslation('tree')
  return (
    <Button
      variant="secondary"
      aria-pressed={selection.active}
      onClick={() => (selection.active ? selection.clear() : selection.start())}
    >
      {selection.active ? t('bulk.done') : t('bulk.select')}
    </Button>
  )
}

/**
 * Shown while something is picked: how many, and what to do with them. It sticks to the top of the page, or to the
 * bottom of the screen on small ones, and announces the count to screen readers.
 */
export function SelectionBar({
  selection,
  onMove,
  onDelete,
}: {
  selection: Selection
  onMove: () => void
  onDelete: () => void
}) {
  const { t } = useTranslation('tree')
  const tooMany = selection.count > MAX_BULK_ITEMS
  return (
    <div className="contents">
      <p role="status" aria-live="polite" className="sr-only">
        {selection.count > 0 ? t('bulk.selectedCount', { count: selection.count }) : ''}
      </p>
      {selection.count > 0 && (
        <div
          role="toolbar"
          aria-label={t('bulk.toolbar')}
          className="fixed inset-x-0 bottom-0 z-30 flex flex-wrap items-center gap-2 border-t border-neutral-200 bg-white px-4 py-2 shadow-lg sm:sticky sm:inset-x-auto sm:top-0 sm:bottom-auto sm:rounded-lg sm:border sm:shadow-sm dark:border-neutral-800 dark:bg-neutral-900"
        >
          <span aria-hidden="true" className="text-sm font-medium">
            {t('bulk.selectedCount', { count: selection.count })}
          </span>
          {tooMany && (
            <span className="text-xs text-red-600 dark:text-red-400">
              {t('bulk.limit', { max: MAX_BULK_ITEMS })}
            </span>
          )}
          <span className="flex-1" />
          <Button variant="secondary" disabled={tooMany} onClick={onMove}>
            {t('bulk.move')}
          </Button>
          <Button variant="danger" disabled={tooMany} onClick={onDelete}>
            {t('bulk.delete')}
          </Button>
          <Button variant="ghost" onClick={selection.clear}>
            {t('bulk.clear')}
          </Button>
        </div>
      )}
    </div>
  )
}
