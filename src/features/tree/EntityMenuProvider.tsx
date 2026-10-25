import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type MouseEvent,
  type ReactNode,
} from 'react'
import { useTranslation } from 'react-i18next'
import { useMatch, useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Alert } from '@/components/Alert'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { ContextMenu, type ContextMenuItem } from '@/components/ContextMenu'
import { useRepositories } from '@/data/DataProvider'
import type { ID, LinkDetail, Note } from '@/data/types'
import { errorMessage } from '@/features/auth/errors'
import { invalidateStructure, linkKeys, noteKeys } from '@/lib/queryKeys'
import { MoveDialog } from './MoveDialog'
import { useTreeActions, type NodeRef } from './queries'

/** A document or link a context menu can be opened on. */
export interface MenuEntity {
  kind: 'note' | 'link'
  id: ID
  name: string
  /** Documents only: links cannot be pinned. */
  pinned?: boolean
  /** Documents only: how many items sit under it (the delete warning mentions them). */
  childCount?: number
}

interface EntityMenuValue {
  /** Opens the menu at the pointer; use it as the `onContextMenu` of a card or row. */
  open: (event: MouseEvent, entity: MenuEntity) => void
}

const EntityMenuContext = createContext<EntityMenuValue | null>(null)

export function useEntityMenu(): EntityMenuValue {
  const value = useContext(EntityMenuContext)
  if (!value) throw new Error('useEntityMenu must be used inside EntityMenuProvider')
  return value
}

type Dialog = { type: 'move' | 'delete'; entity: MenuEntity }

/**
 * The right-click menu of documents and links (Pin, Edit, Move, Delete), available from anywhere inside the
 * signed-in area. It owns the dialogs its actions need, so every list and the tree behave the same.
 */
export function EntityMenuProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation('tree')
  const { t: tDocs } = useTranslation('documents')
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { notes } = useRepositories()
  const actions = useTreeActions()
  const [menu, setMenu] = useState<{ entity: MenuEntity; x: number; y: number } | null>(null)
  const [dialog, setDialog] = useState<Dialog | null>(null)
  const [problem, setProblem] = useState<string | null>(null)

  const documentId = useMatch('/doc/:id')?.params.id ?? ''
  const linkId = useMatch('/link/:id')?.params.id ?? ''

  const pin = useMutation({
    mutationFn: ({ id, pinned }: { id: ID; pinned: boolean }) => notes.updateNote(id, { pinned }),
    onSuccess: async (_result, { id, pinned }) => {
      // The open document keeps its own copy: tell it, so its Pin button does not show the old state.
      queryClient.setQueryData<Note>(noteKeys.detail(id), (old) => (old ? { ...old, pinned } : old))
      await invalidateStructure(queryClient)
    },
    onError: (error) => setProblem(errorMessage(error)),
  })

  /** After removing something the page may be showing it (or something inside it): go home then. */
  const leaveIfShowing = (node: NodeRef) => {
    const openNote = documentId
      ? queryClient.getQueryData<Note>(noteKeys.detail(documentId))
      : undefined
    const openLink = linkId
      ? queryClient.getQueryData<LinkDetail>(linkKeys.detail(linkId))
      : undefined
    const path = openNote?.path ?? openLink?.path ?? []
    const insideRemoved = path.some((item) => item.type === node.kind && item.id === node.id)
    const isRemoved =
      (node.kind === 'note' && documentId === node.id) ||
      (node.kind === 'link' && linkId === node.id)
    if (insideRemoved || isRemoved) navigate('/', { replace: true })
  }

  const close = useCallback(() => setMenu(null), [])

  const value = useMemo<EntityMenuValue>(
    () => ({
      open: (event, entity) => {
        event.preventDefault()
        event.stopPropagation()
        setProblem(null)
        setMenu({ entity, x: event.clientX, y: event.clientY })
      },
    }),
    [],
  )

  const itemsFor = (entity: MenuEntity): ContextMenuItem[] => {
    const items: ContextMenuItem[] = []
    if (entity.kind === 'note') {
      const pinned = entity.pinned === true
      items.push({
        id: 'pin',
        label: pinned ? t('actions.unpin') : t('actions.pin'),
        onSelect: () => pin.mutate({ id: entity.id, pinned: !pinned }),
      })
    }
    items.push(
      {
        id: 'edit',
        label: t('actions.edit'),
        onSelect: () =>
          entity.kind === 'note'
            ? navigate(`/doc/${entity.id}`, { state: { edit: true } })
            : navigate(`/link/${entity.id}`),
      },
      {
        id: 'move',
        label: t('actions.move'),
        onSelect: () => setDialog({ type: 'move', entity }),
      },
      {
        id: 'delete',
        label: t('actions.delete'),
        destructive: true,
        onSelect: () => setDialog({ type: 'delete', entity }),
      },
    )
    return items
  }

  const closeDialog = () => {
    actions.remove.reset()
    setDialog(null)
  }

  let dialogView = null
  if (dialog?.type === 'move') {
    const { entity } = dialog
    dialogView = (
      <MoveDialog
        node={{ kind: entity.kind, id: entity.id }}
        name={entity.name}
        onClose={closeDialog}
        onMove={async (destination) => {
          await actions.move.mutateAsync({
            node: { kind: entity.kind, id: entity.id },
            destination,
          })
          closeDialog()
        }}
      />
    )
  } else if (dialog?.type === 'delete') {
    const { entity } = dialog
    const node: NodeRef = { kind: entity.kind, id: entity.id }
    const isNote = entity.kind === 'note'
    const body = !isNote
      ? t('deleteLink.body', { name: entity.name })
      : (entity.childCount ?? 0) > 0
        ? t('deleteNote.bodyWithChildren', { name: entity.name })
        : t('deleteNote.body', { name: entity.name })
    dialogView = (
      <ConfirmDialog
        title={isNote ? t('deleteNote.title') : t('deleteLink.title')}
        confirmLabel={tDocs('deleteDialog.confirm')}
        cancelLabel={tDocs('deleteDialog.cancel')}
        destructive
        busy={actions.remove.isPending}
        onCancel={closeDialog}
        onConfirm={() =>
          actions.remove.mutate(node, {
            onSuccess: () => {
              leaveIfShowing(node)
              closeDialog()
            },
          })
        }
      >
        <p>{body}</p>
        {actions.remove.isError && (
          <div className="mt-3">
            <Alert tone="error">{errorMessage(actions.remove.error)}</Alert>
          </div>
        )}
      </ConfirmDialog>
    )
  }

  return (
    <EntityMenuContext.Provider value={value}>
      {children}
      {menu && (
        <ContextMenu
          label={t('actions.open', { name: menu.entity.name })}
          x={menu.x}
          y={menu.y}
          items={itemsFor(menu.entity)}
          onClose={close}
        />
      )}
      {problem && (
        <div role="alert" className="fixed end-4 bottom-4 z-50 max-w-sm">
          <Alert tone="error">{problem}</Alert>
        </div>
      )}
      {dialogView}
    </EntityMenuContext.Provider>
  )
}
