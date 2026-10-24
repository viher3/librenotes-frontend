// Domain types used by the whole app. They are independent from the wire format (snake_case, optional
// properties in the generated schema): each adapter maps the API to these.

export type ID = string

export const LOCALES = ['en', 'es'] as const
export type Locale = (typeof LOCALES)[number]

export interface User {
  id: ID
  email: string
  username: string
  locale: Locale
  roles: string[]
  active: boolean
  emailValidated: boolean
  createdAt: string
  lastLoginAt: string | null
}

/** A custom emoji, or `null` for the default icon of the item type. */
export type Icon = string | null

export interface Folder {
  id: ID
  name: string
  parentFolderId: ID | null
  icon: Icon
}

/** One step of the way from the root to an item: a folder or a note (for breadcrumbs). */
export interface PathItem {
  type: 'folder' | 'note'
  id: ID
  /** The folder's name, or the note's title. */
  title: string
}

/** A folder with where it sits. */
export interface FolderDetail extends Folder {
  /** Ancestors from the root down to the parent (the folder itself is not included). */
  path: PathItem[]
}

/** Where a note or link is placed: at the root, in a folder, or under a note. Never two places at once. */
export type Destination = { type: 'root' } | { type: 'folder'; id: ID } | { type: 'note'; id: ID }

export interface FolderSummary {
  id: ID
  name: string
  icon: Icon
  createdAt: string
}

export interface NoteSummary {
  id: ID
  title: string
  icon: Icon
  /** The folder it is in; null at the root or when it sits under a note. */
  folderId: ID | null
  /** The note it sits under, if any. */
  parentNoteId: ID | null
  /** How many notes and links are directly under it (what makes it expandable in the tree). */
  childCount: number
  pinned: boolean
  /** The content is ciphertext produced by this app (the server cannot read it). */
  encrypted: boolean
  tags: string[]
  createdAt: string
  updatedAt: string
}

export interface Attachment {
  id: ID
  fileName: string
  mimeType: string
  sizeBytes: number
  createdAt: string
}

/** Attachment metadata with its location: bound to a note or to a folder (never both). */
export interface AttachmentDetail extends Attachment {
  folderId: ID | null
  noteId: ID | null
}

/** Full note (the app calls them "documents"); `content` is Markdown. */
export interface Note extends NoteSummary {
  content: string
  attachments: Attachment[]
  /** Ancestors from the root down to the parent (the note itself is not included). */
  path: PathItem[]
}

export interface Link {
  id: ID
  title: string
  icon: Icon
  url: string
  note: string | null
  folderId: ID | null
  /** The note it sits under, if any. */
  parentNoteId: ID | null
  tags: string[]
  createdAt: string
  updatedAt: string
}

/** A link with where it sits (as returned when one is opened or created). */
export interface LinkDetail extends Link {
  /** Ancestors from the top level down to the parent (the link itself is not included). */
  path: PathItem[]
}

/** What is directly under a note. */
export interface NoteChildren {
  notes: NoteSummary[]
  links: Link[]
}

export interface FolderContents {
  /** The listed folder; null at the root level. */
  folder: FolderDetail | null
  subfolders: FolderSummary[]
  notes: NoteSummary[]
  links: Link[]
  attachments: Attachment[]
}

export interface Page<T> {
  items: T[]
  page: number
  size: number
  total: number
  lastPage: number
}

export interface SearchResult {
  type: 'note' | 'link'
  id: ID
  title: string
  icon: Icon
  /** Plain-text excerpt around the first match; may start/end with an ellipsis. Empty when encrypted. */
  snippet: string
  /** An encrypted note is matched by title and tags only. */
  encrypted: boolean
  folderId: ID | null
  tags: string[]
  updatedAt: string
  /** Only for links. */
  url: string | null
}

export interface TagCount {
  name: string
  count: number
}

export interface Trash {
  folders: { id: ID; name: string; icon: Icon; parentFolderId: ID | null; deletedAt: string }[]
  notes: { id: ID; title: string; icon: Icon; folderId: ID | null; deletedAt: string }[]
  links: {
    id: ID
    title: string
    icon: Icon
    url: string
    folderId: ID | null
    deletedAt: string
  }[]
  /** Attachments of a trashed note are not listed: they travel with it. */
  attachments: {
    id: ID
    fileName: string
    folderId: ID | null
    noteId: ID | null
    deletedAt: string
  }[]
}

export type TrashKind = 'folder' | 'note' | 'link' | 'attachment'

export type OrderDirection = 'asc' | 'desc'
export type OrderBy = 'updatedAt' | 'createdAt' | 'title'

export interface ListParams {
  /** A folder id, or `'root'` for items in no folder and under no note. Omit for all folders. */
  folderId?: ID | 'root'
  /** Only what is directly under this note (ignored when `folderId` is given). */
  parentNoteId?: ID
  tag?: string
  orderBy?: OrderBy
  orderDirection?: OrderDirection
  page?: number
  /** Max 100. */
  size?: number
}

export interface ListNotesParams extends ListParams {
  pinned?: boolean
}

export type ListLinksParams = ListParams

export interface SearchParams {
  /** At least 2 characters. */
  q: string
  types?: ('note' | 'link')[]
  tag?: string
  page?: number
  size?: number
}

export interface UpdateFolderInput {
  name?: string
  /** `null` restores the default icon. */
  icon?: Icon
}

export interface CreateNoteInput {
  title: string
  content?: string
  icon?: Icon
  /** Where to put it: a folder or a parent note (not both); neither means the root. */
  folderId?: ID | null
  parentNoteId?: ID | null
  pinned?: boolean
  tags?: string[]
}

export interface UpdateNoteInput {
  title?: string
  /** `null` restores the default icon. */
  icon?: Icon
  content?: string
  pinned?: boolean
  /** Replaces the whole set. */
  tags?: string[]
}

export interface CreateLinkInput {
  title: string
  /** Absolute http(s) URL. */
  url: string
  note?: string | null
  icon?: Icon
  /** Where to put it: a folder or a parent note (not both); neither means the root. */
  folderId?: ID | null
  parentNoteId?: ID | null
  tags?: string[]
}

export interface UpdateLinkInput {
  title?: string
  /** `null` restores the default icon. */
  icon?: Icon
  url?: string
  /** `null` clears it. */
  note?: string | null
  tags?: string[]
}

export interface SignUpInput {
  email: string
  password: string
  username?: string
}

export interface ChangePasswordInput {
  currentPassword: string
  newPassword: string
}

export interface UpdateProfileInput {
  username?: string
  locale?: Locale
}

export interface UploadOptions {
  /** Called with a fraction between 0 and 1. */
  onProgress?: (fraction: number) => void
  signal?: AbortSignal
}

/** Upper bound enforced by the backend; used to validate before uploading. */
export const MAX_ATTACHMENT_BYTES = 50 * 1024 * 1024
