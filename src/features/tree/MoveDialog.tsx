import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Alert } from '@/components/Alert'
import { Button } from '@/components/Button'
import { Modal } from '@/components/Modal'
import { CHEVRON } from '@/components/glyphs'
import type { Destination } from '@/data/types'
import { errorMessage } from '@/features/auth/errors'
import { useFolderContents, useNoteChildren, type NodeRef } from './queries'

interface MoveDialogProps {
  node: NodeRef
  name: string
  /** Moves the item; rejects with the reason it could not. */
  onMove: (destination: Destination) => Promise<void>
  onClose: () => void
}

/**
 * Lets the user pick where an item goes without dragging. Folders can only go into folders or the top level;
 * notes and links can also go under a note. The item being moved cannot be chosen, and nothing inside it is
 * offered (a note cannot end up inside itself).
 */
export function MoveDialog({ node, name, onMove, onClose }: MoveDialogProps) {
  const { t } = useTranslation('tree')
  const [open, setOpen] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)

  const toggle = (key: string) =>
    setOpen((current) => {
      const next = new Set(current)
      if (!next.delete(key)) next.add(key)
      return next
    })

  const pick = async (destination: Destination) => {
    setBusy(true)
    setFailure(null)
    try {
      await onMove(destination)
    } catch (error) {
      setFailure(errorMessage(error))
      setBusy(false)
    }
  }

  return (
    <Modal title={t('moveDialog.title', { name })} width="md" busy={busy} onClose={onClose}>
      <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">{t('moveDialog.hint')}</p>
      {failure && (
        <div className="mt-3">
          <Alert tone="error">{failure}</Alert>
        </div>
      )}
      <ul className="mt-3 flex flex-col gap-0.5" aria-busy={busy}>
        <li>
          <div className="flex items-center gap-2 rounded-md px-2 py-1">
            <span className="size-5" aria-hidden="true" />
            <span className="flex-1 font-medium">{t('moveDialog.topLevel')}</span>
            <PickButton
              target={t('moveDialog.topLevel')}
              disabled={busy}
              onClick={() => void pick({ type: 'root' })}
            />
          </div>
          <ul className="flex flex-col gap-0.5">
            <PickerBranch
              parent={{ type: 'root' }}
              level={1}
              node={node}
              open={open}
              toggle={toggle}
              busy={busy}
              pick={pick}
            />
          </ul>
        </li>
      </ul>
      <div className="mt-4 flex justify-end">
        <Button variant="secondary" onClick={onClose} disabled={busy}>
          {t('moveDialog.cancel')}
        </Button>
      </div>
    </Modal>
  )
}

type Parent = { type: 'root' } | { type: 'folder'; id: string } | { type: 'note'; id: string }

interface PickerProps {
  node: NodeRef
  open: Set<string>
  toggle: (key: string) => void
  busy: boolean
  pick: (destination: Destination) => Promise<void>
}

function PickButton({
  target,
  disabled,
  onClick,
}: {
  target: string
  disabled: boolean
  onClick: () => void
}) {
  const { t } = useTranslation('tree')
  return (
    <Button
      variant="secondary"
      className="px-2 py-0.5 text-xs"
      disabled={disabled}
      aria-label={t('moveDialog.moveTo', { target })}
      onClick={onClick}
    >
      {t('moveDialog.moveHere')}
    </Button>
  )
}

function PickerBranch({ parent, level, ...rest }: PickerProps & { parent: Parent; level: number }) {
  const { t } = useTranslation('tree')
  const { node } = rest
  const folderQuery = useFolderContents(
    parent.type === 'folder' ? parent.id : null,
    parent.type !== 'note',
  )
  const noteQuery = useNoteChildren(parent.type === 'note' ? parent.id : '', parent.type === 'note')
  const query = parent.type === 'note' ? noteQuery : folderQuery
  const pad = { paddingInlineStart: `${level * 16}px` }

  if (query.isPending) {
    return (
      <li className="px-2 py-1 text-xs text-neutral-600 dark:text-neutral-400" style={pad}>
        <span role="status">{t('loading')}</span>
      </li>
    )
  }
  if (query.isError) {
    return (
      <li className="px-2 py-1 text-xs text-red-600 dark:text-red-400" style={pad}>
        {t('moveDialog.loadError')}
      </li>
    )
  }

  const folders =
    parent.type === 'note'
      ? []
      : [...(folderQuery.data?.subfolders ?? [])].sort((a, b) => a.name.localeCompare(b.name))
  // Only notes can hold notes and links; a folder being moved can only go into folders.
  const notes =
    node.kind === 'folder'
      ? []
      : [...(query.data?.notes ?? [])].sort((a, b) => a.title.localeCompare(b.title))

  return (
    <>
      {folders.map((folder) => (
        <PickerRow
          key={`folder:${folder.id}`}
          rowKey={`folder:${folder.id}`}
          label={folder.name}
          icon="📁"
          expandable
          isSelf={node.kind === 'folder' && node.id === folder.id}
          destination={{ type: 'folder', id: folder.id }}
          branch={{ type: 'folder', id: folder.id }}
          level={level}
          {...rest}
        />
      ))}
      {notes.map((note) => (
        <PickerRow
          key={`note:${note.id}`}
          rowKey={`note:${note.id}`}
          label={note.title}
          icon="📄"
          expandable={note.childCount > 0}
          isSelf={node.kind === 'note' && node.id === note.id}
          destination={{ type: 'note', id: note.id }}
          branch={{ type: 'note', id: note.id }}
          level={level}
          {...rest}
        />
      ))}
    </>
  )
}

function PickerRow({
  rowKey,
  label,
  icon,
  expandable,
  isSelf,
  destination,
  branch,
  level,
  ...rest
}: PickerProps & {
  rowKey: string
  label: string
  icon: string
  expandable: boolean
  isSelf: boolean
  destination: Destination
  branch: Parent
  level: number
}) {
  const { t } = useTranslation('tree')
  const isOpen = rest.open.has(rowKey) && !isSelf // nothing inside the moved item is offered
  return (
    <li>
      <div
        className="flex items-center gap-2 rounded-md px-2 py-1 hover:bg-neutral-100 dark:hover:bg-neutral-800"
        style={{ paddingInlineStart: `${level * 16}px` }}
      >
        {expandable && !isSelf ? (
          <button
            type="button"
            aria-label={isOpen ? t('collapse', { name: label }) : t('expand', { name: label })}
            onClick={() => rest.toggle(rowKey)}
            className="grid size-5 place-items-center rounded text-xs text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-700"
          >
            <span aria-hidden="true" className={isOpen ? 'rotate-90' : ''}>
              {CHEVRON}
            </span>
          </button>
        ) : (
          <span className="size-5" aria-hidden="true" />
        )}
        <span aria-hidden="true">{icon}</span>
        <span className="min-w-0 flex-1 truncate">{label}</span>
        {isSelf ? (
          <span className="text-xs text-neutral-600 dark:text-neutral-400">
            {t('moveDialog.itself')}
          </span>
        ) : (
          <PickButton
            target={label}
            disabled={rest.busy}
            onClick={() => void rest.pick(destination)}
          />
        )}
      </div>
      {isOpen && (
        <ul className="flex flex-col gap-0.5">
          <PickerBranch parent={branch} level={level + 1} {...rest} />
        </ul>
      )}
    </li>
  )
}
