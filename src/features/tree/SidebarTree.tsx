import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type KeyboardEvent,
} from 'react'
import { useTranslation } from 'react-i18next'
import { useMatch, useNavigate } from 'react-router-dom'
import { Alert } from '@/components/Alert'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { PromptDialog } from '@/components/PromptDialog'
import type { Destination, ID, PathItem } from '@/data/types'
import { errorMessage } from '@/features/auth/errors'
import { useNote } from '@/features/documents/queries'
import { useNewDocument } from '@/features/documents/useNewDocument'
import { useLink } from '@/features/links/queries'
import { useNewLink } from '@/features/links/NewLinkProvider'
import { DRAG_TYPE, canDrop, destinationOf, parseNode, type DropTarget } from './dnd'
import { branchKey, useExpandedBranches } from './expanded'
import { MoveDialog } from './MoveDialog'
import { NodeMenu } from './NodeMenu'
import { useFolderContents, useTreeActions, type NodeRef } from './queries'
import { TreeContext, type TreeAction, type TreeContextValue } from './TreeContext'
import { TreeBranch } from './TreeBranch'

type Dialog = Exclude<TreeAction, { type: 'newDocument' } | { type: 'newLink' }>

/** The key of the row for a path item or destination. */
const keyOfPathItem = (item: PathItem) => branchKey(item.type, item.id)

export function SidebarTree() {
  const { t } = useTranslation('tree')
  const { t: tDocs } = useTranslation('documents')
  const navigate = useNavigate()
  const expanded = useExpandedBranches()
  const actions = useTreeActions()
  const { createDocument, error: createError } = useNewDocument()
  const { t: tLinks } = useTranslation('links')
  const newLink = useNewLink()
  const [activeKey, setActiveKey] = useState<string | null>(null)
  const [dialog, setDialog] = useState<Dialog | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const [overKey, setOverKey] = useState<string | null>(null)
  const dragged = useRef<NodeRef | null>(null)
  const treeRef = useRef<HTMLUListElement>(null)

  // The page being shown, if it is part of the tree: its row is highlighted and its ancestors are opened.
  const documentId = useMatch('/doc/:id')?.params.id ?? ''
  const folderId = useMatch('/folder/:id')?.params.id ?? ''
  const linkId = useMatch('/link/:id')?.params.id ?? ''
  const openNote = useNote(documentId, documentId !== '')
  const openFolder = useFolderContents(folderId || null, folderId !== '')
  const openLink = useLink(linkId, linkId !== '')
  const currentKey = documentId
    ? branchKey('note', documentId)
    : folderId
      ? branchKey('folder', folderId)
      : linkId
        ? `link:${linkId}`
        : null
  const currentPath: PathItem[] = useMemo(
    () =>
      documentId
        ? (openNote.data?.path ?? [])
        : linkId
          ? (openLink.data?.path ?? [])
          : (openFolder.data?.folder?.path ?? []),
    [documentId, linkId, openNote.data?.path, openLink.data?.path, openFolder.data?.folder?.path],
  )

  const { expand } = expanded
  useEffect(() => {
    if (currentPath.length > 0) expand(...currentPath.map(keyOfPathItem))
  }, [currentPath, expand])

  // ---- actions from the rows' menus
  const onAction = useCallback(
    (action: TreeAction) => {
      setProblem(null)
      if (action.type === 'newDocument') {
        if (action.destination.type !== 'root')
          expand(branchKey(action.destination.type, action.destination.id))
        createDocument(action.destination)
        return
      }
      if (action.type === 'newLink') {
        newLink.open(action.destination)
        return
      }
      setDialog(action)
    },
    [createDocument, expand, newLink],
  )

  const expandDestination = useCallback(
    (destination: Destination) => {
      if (destination.type !== 'root') expand(branchKey(destination.type, destination.id))
    },
    [expand],
  )

  /** After removing something the page may be showing it (or something inside it): go home then. */
  const leaveIfShowing = (node: NodeRef) => {
    const insideRemoved = currentPath.some((item) => item.type === node.kind && item.id === node.id)
    const isRemoved =
      (node.kind === 'note' && documentId === node.id) ||
      (node.kind === 'folder' && folderId === node.id) ||
      (node.kind === 'link' && linkId === node.id)
    if (insideRemoved || isRemoved) navigate('/', { replace: true })
  }

  // ---- drag & drop
  const moveByDrop = useCallback(
    (node: NodeRef, target: DropTarget) => {
      const destination = destinationOf(target)
      actions.move.mutate(
        { node, destination },
        {
          onSuccess: () => expandDestination(destination),
          onError: (error) => setProblem(errorMessage(error)),
        },
      )
    },
    [actions.move, expandDestination],
  )

  const drag: TreeContextValue['drag'] = {
    overKey,
    start: (node, event) => {
      dragged.current = node
      event.dataTransfer.effectAllowed = 'move'
      setProblem(null)
    },
    over: (target, key, event) => {
      const node = dragged.current
      if (!node || !canDrop(node, target)) return
      event.preventDefault() // this row accepts the item
      event.stopPropagation()
      event.dataTransfer.dropEffect = 'move'
      setOverKey(key)
    },
    leave: (key) => setOverKey((current) => (current === key ? null : current)),
    drop: (target, event) => {
      const node = dragged.current ?? parseNode(event.dataTransfer.getData(DRAG_TYPE))
      setOverKey(null)
      dragged.current = null
      if (!node || !canDrop(node, target)) return
      event.preventDefault()
      event.stopPropagation()
      moveByDrop(node, target)
    },
    end: () => {
      dragged.current = null
      setOverKey(null)
    },
  }

  // Dropping on the empty space around the rows (or on the heading) sends the item to the top level.
  const rootTarget: DropTarget = { type: 'root' }
  // A row that refuses the item must not hand it on to the top level: only the space between rows counts.
  const overRow = (event: DragEvent) =>
    (event.target as HTMLElement).closest('[role=treeitem]') !== null
  const onRootDragOver = (event: DragEvent) => {
    if (!overRow(event)) drag.over(rootTarget, 'root', event)
  }

  // ---- keyboard (WAI-ARIA tree pattern)
  const onKeyDown = (event: KeyboardEvent<HTMLUListElement>) => {
    const target = event.target as HTMLElement
    const item = target.closest<HTMLElement>('[role=treeitem]')
    if (!item || !treeRef.current) return
    const items = [...treeRef.current.querySelectorAll<HTMLElement>('[role=treeitem]')]
    const index = items.indexOf(item)
    const focusItem = (el: HTMLElement | undefined) => {
      if (!el) return
      event.preventDefault()
      el.focus()
    }
    const onItem = target === item // Enter/Space on a button inside the row belong to that button
    const key = item.dataset.key ?? ''

    switch (event.key) {
      case 'ArrowDown':
        return focusItem(items[index + 1])
      case 'ArrowUp':
        return focusItem(items[index - 1])
      case 'Home':
        return focusItem(items[0])
      case 'End':
        return focusItem(items[items.length - 1])
      case 'ArrowRight': {
        const state = item.getAttribute('aria-expanded')
        if (state === 'false') {
          event.preventDefault()
          expanded.toggle(key)
        } else if (state === 'true') {
          focusItem(item.querySelector<HTMLElement>(':scope > ul > [role=treeitem]') ?? undefined)
        }
        return
      }
      case 'ArrowLeft': {
        if (item.getAttribute('aria-expanded') === 'true') {
          event.preventDefault()
          expanded.toggle(key)
        } else {
          focusItem(item.parentElement?.closest<HTMLElement>('[role=treeitem]') ?? undefined)
        }
        return
      }
      case 'Enter':
      case ' ':
        if (!onItem) return
        event.preventDefault()
        item.querySelector<HTMLElement>(':scope > div [data-primary]')?.click()
        return
      case 'ContextMenu':
        event.preventDefault()
        item.querySelector<HTMLElement>(':scope > div [data-menu-button]')?.click()
        return
      case 'F10':
        if (!event.shiftKey) return
        event.preventDefault()
        item.querySelector<HTMLElement>(':scope > div [data-menu-button]')?.click()
        return
    }
  }

  // The tree is one tab stop: entering it lands on the current page's row (or the first one).
  const onTreeFocus = (event: React.FocusEvent<HTMLUListElement>) => {
    if (event.target !== event.currentTarget || !treeRef.current) return
    const rows = treeRef.current.querySelectorAll<HTMLElement>('[role=treeitem]')
    const preferred = [...rows].find((row) => row.dataset.key === (activeKey ?? currentKey))
    ;(preferred ?? rows[0])?.focus()
  }

  const context: TreeContextValue = {
    isOpen: expanded.isOpen,
    toggle: expanded.toggle,
    expand: expanded.expand,
    activeKey,
    setActiveKey,
    currentKey,
    onAction,
    drag,
  }

  // ---- dialogs
  const closeDialog = () => {
    actions.remove.reset()
    setDialog(null)
  }
  const describeError = errorMessage
  let dialogView = null
  if (dialog?.type === 'newFolder') {
    dialogView = (
      <PromptDialog
        title={t('folderDialog.newTitle')}
        label={t('folderDialog.label')}
        submitLabel={t('folderDialog.create')}
        cancelLabel={t('folderDialog.cancel')}
        requiredMessage={t('folderDialog.required')}
        describeError={describeError}
        onCancel={closeDialog}
        onSubmit={async (name) => {
          await actions.createFolder.mutateAsync({ name, parentFolderId: dialog.parentFolderId })
          if (dialog.parentFolderId) expand(branchKey('folder', dialog.parentFolderId))
          closeDialog()
        }}
      />
    )
  } else if (dialog?.type === 'renameFolder') {
    dialogView = (
      <PromptDialog
        title={t('folderDialog.renameTitle')}
        label={t('folderDialog.label')}
        initialValue={dialog.name}
        submitLabel={t('folderDialog.save')}
        cancelLabel={t('folderDialog.cancel')}
        requiredMessage={t('folderDialog.required')}
        describeError={describeError}
        onCancel={closeDialog}
        onSubmit={async (name) => {
          await actions.renameFolder.mutateAsync({ id: dialog.id, name })
          closeDialog()
        }}
      />
    )
  } else if (dialog?.type === 'move') {
    dialogView = (
      <MoveDialog
        node={dialog.node}
        name={dialog.name}
        onClose={closeDialog}
        onMove={async (destination) => {
          await actions.move.mutateAsync({ node: dialog.node, destination })
          expandDestination(destination)
          closeDialog()
        }}
      />
    )
  } else if (dialog?.type === 'delete') {
    const { node, name, childCount } = dialog
    const copy =
      node.kind === 'folder'
        ? {
            title: t('deleteFolder.title'),
            body: t('deleteFolder.body', { name }),
            confirm: t('deleteFolder.confirm'),
            cancel: t('deleteFolder.cancel'),
          }
        : node.kind === 'note'
          ? {
              title: t('deleteNote.title'),
              body:
                childCount > 0
                  ? t('deleteNote.bodyWithChildren', { name })
                  : t('deleteNote.body', { name }),
              confirm: tDocs('deleteDialog.confirm'),
              cancel: tDocs('deleteDialog.cancel'),
            }
          : {
              title: t('deleteLink.title'),
              body: t('deleteLink.body', { name }),
              confirm: tDocs('deleteDialog.confirm'),
              cancel: tDocs('deleteDialog.cancel'),
            }
    dialogView = (
      <ConfirmDialog
        title={copy.title}
        confirmLabel={copy.confirm}
        cancelLabel={copy.cancel}
        destructive
        busy={actions.remove.isPending}
        onCancel={closeDialog}
        onConfirm={() =>
          actions.remove.mutate(node, {
            onSuccess: () => {
              leaveIfShowing(node)
              setActiveKey(null)
              closeDialog()
            },
          })
        }
      >
        <p>{copy.body}</p>
        {actions.remove.isError && (
          <div className="mt-3">
            <Alert tone="error">{errorMessage(actions.remove.error)}</Alert>
          </div>
        )}
      </ConfirmDialog>
    )
  }

  return (
    <TreeContext.Provider value={context}>
      <section aria-labelledby="tree-title" className="flex min-h-0 flex-1 flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <h2
            id="tree-title"
            className="text-xs font-semibold tracking-wide text-neutral-600 dark:text-neutral-400 uppercase"
          >
            {t('title')}
          </h2>
          <NodeMenu
            name={t('title')}
            trigger={{
              label: t('create.open'),
              content: <span aria-hidden="true">+</span>,
              className:
                'rounded px-2 py-0.5 text-base leading-none text-neutral-600 hover:bg-neutral-200 aria-expanded:bg-neutral-200 dark:text-neutral-400 dark:hover:bg-neutral-700 dark:aria-expanded:bg-neutral-700',
            }}
            items={[
              {
                id: 'new-document',
                label: tDocs('new'),
                onSelect: () => onAction({ type: 'newDocument', destination: { type: 'root' } }),
              },
              {
                id: 'new-link',
                label: tLinks('new'),
                onSelect: () => onAction({ type: 'newLink', destination: { type: 'root' } }),
              },
              {
                id: 'new-folder',
                label: t('newFolder'),
                onSelect: () => {
                  setProblem(null)
                  setDialog({ type: 'newFolder', parentFolderId: null as ID | null })
                },
              },
            ]}
          />
        </div>

        {(problem ?? createError) && <Alert tone="error">{problem ?? createError}</Alert>}

        <div
          className={`min-h-0 flex-1 overflow-y-auto rounded-md ${overKey === 'root' ? 'bg-indigo-50 ring-2 ring-indigo-500 dark:bg-indigo-950' : ''}`}
          onDragOver={onRootDragOver}
          onDragLeave={() => drag.leave('root')}
          onDrop={(event) => {
            if (!overRow(event)) drag.drop(rootTarget, event)
          }}
        >
          <ul
            ref={treeRef}
            role="tree"
            aria-label={t('title')}
            tabIndex={activeKey ? -1 : 0}
            onFocus={onTreeFocus}
            onKeyDown={onKeyDown}
            className="min-h-8 outline-none"
          >
            <TreeBranch parent={{ type: 'root' }} level={1} />
          </ul>
        </div>
      </section>
      {dialogView}
    </TreeContext.Provider>
  )
}
