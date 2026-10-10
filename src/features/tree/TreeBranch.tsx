import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { Button } from '@/components/Button'
import { CHEVRON } from '@/components/glyphs'
import type { FolderSummary, Link as LinkItem, NoteSummary } from '@/data/types'
import { DRAG_TYPE, type DropTarget } from './dnd'
import { NodeMenu, type MenuItem } from './NodeMenu'
import { branchKey } from './expanded'
import { useFolderContents, useNoteChildren, type NodeRef } from './queries'
import { useTree } from './TreeContext'

export type BranchParent =
  { type: 'root' } | { type: 'folder'; id: string } | { type: 'note'; id: string }

const byText = (a: string, b: string) => a.localeCompare(b)

/** The rows under one parent. The data is fetched only while the branch is open (the root is always open). */
export function TreeBranch({ parent, level }: { parent: BranchParent; level: number }) {
  const { t } = useTranslation('tree')
  const folderQuery = useFolderContents(
    parent.type === 'folder' ? parent.id : null,
    parent.type !== 'note',
  )
  const noteQuery = useNoteChildren(parent.type === 'note' ? parent.id : '', parent.type === 'note')
  const query = parent.type === 'note' ? noteQuery : folderQuery

  if (query.isPending) {
    return (
      <li
        role="none"
        className="px-2 py-1 text-xs text-neutral-600 dark:text-neutral-400"
        style={indent(level)}
      >
        <span role="status">{t('loading')}</span>
      </li>
    )
  }

  if (query.isError) {
    return (
      <li role="none" className="flex items-center gap-2 px-2 py-1 text-xs" style={indent(level)}>
        <span className="text-red-600 dark:text-red-400">{t('loadError')}</span>
        <Button
          variant="ghost"
          className="px-2 py-0.5 text-xs"
          onClick={() => void query.refetch()}
        >
          {t('retry')}
        </Button>
      </li>
    )
  }

  const data = query.data
  const folders: FolderSummary[] =
    parent.type === 'note' ? [] : [...(folderQuery.data?.subfolders ?? [])]
  const notes: NoteSummary[] = [...(data?.notes ?? [])]
  const links: LinkItem[] = [...(data?.links ?? [])]
  folders.sort((a, b) => byText(a.name, b.name))
  notes.sort((a, b) => byText(a.title, b.title))
  links.sort((a, b) => byText(a.title, b.title))

  if (folders.length + notes.length + links.length === 0) {
    return (
      <li
        role="none"
        className="px-2 py-1 text-xs text-neutral-600 dark:text-neutral-400"
        style={indent(level)}
      >
        {t('empty')}
      </li>
    )
  }

  return (
    <>
      {folders.map((folder) => (
        <FolderRow key={folder.id} folder={folder} level={level} />
      ))}
      {notes.map((note) => (
        <NoteRow key={note.id} note={note} level={level} />
      ))}
      {links.map((link) => (
        <LinkRow key={link.id} link={link} level={level} />
      ))}
    </>
  )
}

const indent = (level: number) => ({ paddingInlineStart: `${(level - 1) * 14 + 8}px` })

function FolderRow({ folder, level }: { folder: FolderSummary; level: number }) {
  const { t } = useTranslation('tree')
  const { onAction } = useTree()
  const node: NodeRef = { kind: 'folder', id: folder.id }
  const items: MenuItem[] = [
    {
      id: 'doc',
      label: t('actions.newDocumentInside'),
      onSelect: () =>
        onAction({ type: 'newDocument', destination: { type: 'folder', id: folder.id } }),
    },
    {
      id: 'folder',
      label: t('actions.newFolderInside'),
      onSelect: () => onAction({ type: 'newFolder', parentFolderId: folder.id }),
    },
    {
      id: 'link',
      label: t('actions.newLinkInside'),
      onSelect: () => onAction({ type: 'newLink', destination: { type: 'folder', id: folder.id } }),
    },
    {
      id: 'rename',
      label: t('actions.rename'),
      onSelect: () => onAction({ type: 'renameFolder', id: folder.id, name: folder.name }),
    },
    {
      id: 'move',
      label: t('actions.move'),
      onSelect: () => onAction({ type: 'move', node, name: folder.name }),
    },
    {
      id: 'delete',
      label: t('actions.delete'),
      destructive: true,
      onSelect: () => onAction({ type: 'delete', node, name: folder.name, childCount: 0 }),
    },
  ]
  return (
    <TreeItem
      node={node}
      level={level}
      label={folder.name}
      icon="📁"
      to={`/folder/${folder.id}`}
      expandable
      items={items}
      dropTarget={{ type: 'folder', id: folder.id }}
      branch={{ type: 'folder', id: folder.id }}
      openOnActivate
    />
  )
}

function NoteRow({ note, level }: { note: NoteSummary; level: number }) {
  const { t } = useTranslation('tree')
  const { onAction } = useTree()
  const node: NodeRef = { kind: 'note', id: note.id }
  const items: MenuItem[] = [
    {
      id: 'sub',
      label: t('actions.newSubDocument'),
      onSelect: () => onAction({ type: 'newDocument', destination: { type: 'note', id: note.id } }),
    },
    {
      id: 'addLink',
      label: t('actions.addLink'),
      onSelect: () => onAction({ type: 'newLink', destination: { type: 'note', id: note.id } }),
    },
    {
      id: 'move',
      label: t('actions.move'),
      onSelect: () => onAction({ type: 'move', node, name: note.title }),
    },
    {
      id: 'delete',
      label: t('actions.delete'),
      destructive: true,
      onSelect: () =>
        onAction({ type: 'delete', node, name: note.title, childCount: note.childCount }),
    },
  ]
  return (
    <TreeItem
      node={node}
      level={level}
      label={note.title}
      icon="📄"
      to={`/doc/${note.id}`}
      expandable={note.childCount > 0}
      items={items}
      dropTarget={{ type: 'note', id: note.id }}
      branch={{ type: 'note', id: note.id }}
    />
  )
}

function LinkRow({ link, level }: { link: LinkItem; level: number }) {
  const { t } = useTranslation('tree')
  const { onAction } = useTree()
  const node: NodeRef = { kind: 'link', id: link.id }
  const items: MenuItem[] = [
    {
      id: 'open',
      label: t('actions.openLink'),
      onSelect: () => window.open(link.url, '_blank', 'noopener,noreferrer'),
    },
    {
      id: 'move',
      label: t('actions.move'),
      onSelect: () => onAction({ type: 'move', node, name: link.title }),
    },
    {
      id: 'delete',
      label: t('actions.delete'),
      destructive: true,
      onSelect: () => onAction({ type: 'delete', node, name: link.title, childCount: 0 }),
    },
  ]
  return (
    <TreeItem
      node={node}
      level={level}
      label={link.title}
      icon="🔗"
      to={`/link/${link.id}`}
      items={items}
    />
  )
}

interface TreeItemProps {
  node: NodeRef
  level: number
  label: string
  icon: string
  /** Where the row leads. */
  to: string
  expandable?: boolean
  items: MenuItem[]
  /** Set when other items can be dropped on this row. */
  dropTarget?: DropTarget
  /** What this row contains, rendered when it is open. */
  branch?: BranchParent
  /** Open the row when its name is activated (folders behave like in a file explorer). */
  openOnActivate?: boolean
}

function TreeItem({
  node,
  level,
  label,
  icon,
  to,
  expandable = false,
  items,
  dropTarget,
  branch,
  openOnActivate = false,
}: TreeItemProps) {
  const { t } = useTranslation('tree')
  const tree = useTree()
  const key = node.kind === 'link' ? `link:${node.id}` : branchKey(node.kind, node.id)
  const open = expandable && tree.isOpen(key)
  const selected = tree.currentKey === key
  const dropping = tree.drag.overKey === key
  const rowClass = `group/row flex items-center gap-1 rounded-md pe-1 text-sm group-focus-visible/item:ring-2 group-focus-visible/item:ring-indigo-500 ${
    dropping
      ? 'bg-indigo-100 ring-2 ring-indigo-500 dark:bg-indigo-950'
      : selected
        ? 'bg-neutral-200 font-medium dark:bg-neutral-800'
        : 'hover:bg-neutral-100 dark:hover:bg-neutral-900'
  }`

  return (
    <li
      role="treeitem"
      data-key={key}
      aria-level={level}
      aria-expanded={expandable ? open : undefined}
      aria-selected={selected}
      tabIndex={tree.activeKey === key ? 0 : -1}
      onFocus={(event) => event.target === event.currentTarget && tree.setActiveKey(key)}
      className="group/item outline-none"
    >
      <div
        className={rowClass}
        style={{ paddingInlineStart: `${(level - 1) * 14 + 4}px` }}
        draggable
        onDragStart={(event) => {
          event.stopPropagation()
          event.dataTransfer.setData(DRAG_TYPE, JSON.stringify(node))
          tree.drag.start(node, event)
        }}
        onDragEnd={() => tree.drag.end()}
        onDragOver={dropTarget ? (event) => tree.drag.over(dropTarget, key, event) : undefined}
        onDragLeave={dropTarget ? () => tree.drag.leave(key) : undefined}
        onDrop={dropTarget ? (event) => tree.drag.drop(dropTarget, event) : undefined}
      >
        {expandable ? (
          <button
            type="button"
            tabIndex={-1}
            aria-label={open ? t('collapse', { name: label }) : t('expand', { name: label })}
            onClick={() => tree.toggle(key)}
            className="grid size-5 shrink-0 place-items-center rounded text-xs text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-700"
          >
            <span aria-hidden="true" className={open ? 'rotate-90' : ''}>
              {CHEVRON}
            </span>
          </button>
        ) : (
          <span className="size-5 shrink-0" aria-hidden="true" />
        )}
        <Link
          to={to}
          data-primary
          tabIndex={-1}
          draggable={false}
          onClick={() => openOnActivate && tree.expand(key)}
          aria-current={selected ? 'page' : undefined}
          className="flex min-w-0 flex-1 items-center gap-1.5 py-1"
        >
          <span aria-hidden="true">{icon}</span>
          <span className="truncate">{label}</span>
        </Link>
        <NodeMenu name={label} items={items} />
      </div>
      {open && branch && (
        <ul role="group">
          <TreeBranch parent={branch} level={level + 1} />
        </ul>
      )}
    </li>
  )
}
