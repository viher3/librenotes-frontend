import type { components } from '../api/schema'
import { ApiError } from '../errors'
import {
  LOCALES,
  type Attachment,
  type AttachmentDetail,
  type FolderContents,
  type FolderDetail,
  type FolderSummary,
  type Link,
  type Locale,
  type Note,
  type NoteChildren,
  type NoteSummary,
  type Page,
  type PathItem,
  type SearchResult,
  type TagCount,
  type Trash,
  type User,
} from '../types'

type S = components['schemas']

// The generated schema marks every response property as optional (the backend does not declare
// `required`), so each mapper checks what it needs and fails loudly if the contract drifts.

function req<T>(value: T | null | undefined, field: string): T {
  if (value === undefined || value === null) {
    throw ApiError.invalidResponse(`missing "${field}" in the response`)
  }
  return value
}

export function toUser(dto: S['CurrentUserResponse']): User {
  const locale = req(dto.locale, 'locale')
  return {
    id: req(dto.id, 'id'),
    email: req(dto.email, 'email'),
    username: req(dto.username, 'username'),
    locale: (LOCALES as readonly string[]).includes(locale) ? (locale as Locale) : 'en',
    roles: dto.roles ?? [],
    active: req(dto.active, 'active'),
    emailValidated: req(dto.email_validated, 'email_validated'),
    createdAt: req(dto.created_at, 'created_at'),
    lastLoginAt: dto.last_login_at ?? null,
  }
}

export function toAttachment(dto: S['AttachmentSummary']): Attachment {
  return {
    id: req(dto.id, 'id'),
    fileName: req(dto.file_name, 'file_name'),
    mimeType: req(dto.mime_type, 'mime_type'),
    sizeBytes: req(dto.size_bytes, 'size_bytes'),
    createdAt: req(dto.created_at, 'created_at'),
  }
}

export function toAttachmentDetail(dto: S['AttachmentDetailResponse']): AttachmentDetail {
  return {
    ...toAttachment(dto),
    folderId: dto.folder_id ?? null,
    noteId: dto.note_id ?? null,
  }
}

/** Where an item was listed from, for responses that do not repeat it on every item. */
interface Placement {
  folderId?: string | null
  parentNoteId?: string | null
}

export function toNoteSummary(
  dto: S['NoteListItem'] | S['NoteSummary'] | S['NoteDetailResponse'],
  placement: Placement = {},
): NoteSummary {
  return {
    id: req(dto.id, 'id'),
    title: req(dto.title, 'title'),
    folderId: 'folder_id' in dto ? (dto.folder_id ?? null) : (placement.folderId ?? null),
    parentNoteId:
      'parent_note_id' in dto ? (dto.parent_note_id ?? null) : (placement.parentNoteId ?? null),
    childCount: dto.child_count ?? 0,
    pinned: dto.pinned ?? false,
    tags: dto.tags ?? [],
    createdAt: req(dto.created_at, 'created_at'),
    updatedAt: req(dto.updated_at, 'updated_at'),
  }
}

export function toPath(dto: S['AncestorPath'] | undefined): PathItem[] {
  return (dto ?? []).map((item) => ({
    type: req(item.type, 'path.type'),
    id: req(item.id, 'path.id'),
    title: req(item.title, 'path.title'),
  }))
}

export function toNote(dto: S['NoteDetailResponse']): Note {
  return {
    ...toNoteSummary(dto),
    content: dto.content ?? '',
    attachments: (dto.attachments ?? []).map(toAttachment),
    path: toPath(dto.path),
  }
}

export function toLink(
  dto: S['LinkDetailResponse'] | S['LinkSummary'],
  placement: Placement = {},
): Link {
  return {
    id: req(dto.id, 'id'),
    title: req(dto.title, 'title'),
    url: req(dto.url, 'url'),
    note: dto.note ?? null,
    folderId: 'folder_id' in dto ? (dto.folder_id ?? null) : (placement.folderId ?? null),
    parentNoteId:
      'parent_note_id' in dto ? (dto.parent_note_id ?? null) : (placement.parentNoteId ?? null),
    tags: dto.tags ?? [],
    createdAt: req(dto.created_at, 'created_at'),
    updatedAt: req(dto.updated_at, 'updated_at'),
  }
}

function toFolderSummary(dto: S['FolderSummary']): FolderSummary {
  return {
    id: req(dto.id, 'id'),
    name: req(dto.name, 'name'),
    createdAt: req(dto.created_at, 'created_at'),
  }
}

export function toFolderContents(dto: S['FolderContentsResponse']): FolderContents {
  const folder: FolderDetail | null = dto.folder
    ? {
        id: req(dto.folder.id, 'folder.id'),
        name: req(dto.folder.name, 'folder.name'),
        parentFolderId: dto.folder.parent_folder_id ?? null,
        path: toPath(dto.folder.path),
      }
    : null
  // Items listed inside a folder do not repeat their folder id.
  const placement = { folderId: folder?.id ?? null }
  return {
    folder,
    subfolders: (dto.subfolders ?? []).map(toFolderSummary),
    notes: (dto.notes ?? []).map((n) => toNoteSummary(n, placement)),
    links: (dto.links ?? []).map((l) => toLink(l, placement)),
    attachments: (dto.attachments ?? []).map(toAttachment),
  }
}

export function toNoteChildren(dto: S['NoteChildrenResponse'], parentNoteId: string): NoteChildren {
  const placement = { parentNoteId }
  return {
    notes: (dto.notes ?? []).map((n) => toNoteSummary(n, placement)),
    links: (dto.links ?? []).map((l) => toLink(l, placement)),
  }
}

export function toPage<D, T>(
  dto: { meta?: S['PageMeta']; data?: D[] },
  map: (item: D) => T,
): Page<T> {
  const meta = req(dto.meta, 'meta')
  return {
    items: (dto.data ?? []).map(map),
    page: req(meta.page, 'meta.page'),
    size: req(meta.size, 'meta.size'),
    total: req(meta.total, 'meta.total'),
    lastPage: req(meta.last_page, 'meta.last_page'),
  }
}

export function toSearchResult(dto: S['SearchResult']): SearchResult {
  return {
    type: req(dto.type, 'type'),
    id: req(dto.id, 'id'),
    title: req(dto.title, 'title'),
    snippet: dto.snippet ?? '',
    folderId: dto.folder_id ?? null,
    tags: dto.tags ?? [],
    updatedAt: req(dto.updated_at, 'updated_at'),
    url: dto.url ?? null,
  }
}

export function toTagCount(dto: S['TagCount']): TagCount {
  return { name: req(dto.name, 'name'), count: req(dto.count, 'count') }
}

export function toTrash(dto: S['TrashResponse']): Trash {
  return {
    folders: (dto.folders ?? []).map((f) => ({
      id: req(f.id, 'id'),
      name: req(f.name, 'name'),
      parentFolderId: f.parent_folder_id ?? null,
      deletedAt: req(f.deleted_at, 'deleted_at'),
    })),
    notes: (dto.notes ?? []).map((n) => ({
      id: req(n.id, 'id'),
      title: req(n.title, 'title'),
      folderId: n.folder_id ?? null,
      deletedAt: req(n.deleted_at, 'deleted_at'),
    })),
    links: (dto.links ?? []).map((l) => ({
      id: req(l.id, 'id'),
      title: req(l.title, 'title'),
      url: req(l.url, 'url'),
      folderId: l.folder_id ?? null,
      deletedAt: req(l.deleted_at, 'deleted_at'),
    })),
    attachments: (dto.attachments ?? []).map((a) => ({
      id: req(a.id, 'id'),
      fileName: req(a.file_name, 'file_name'),
      folderId: a.folder_id ?? null,
      noteId: a.note_id ?? null,
      deletedAt: req(a.deleted_at, 'deleted_at'),
    })),
  }
}

export { req }
