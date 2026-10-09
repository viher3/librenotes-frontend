import { ApiError } from '../errors'
import type { AuthRepository, NotesRepository } from '../repositories'
import {
  MAX_TITLE_LENGTH,
  MIN_PASSWORD_LENGTH,
  MIN_SEARCH_LENGTH,
  USERNAME_LENGTH,
  foldForSearch,
  isEmail,
  isHttpUrl,
  normalizeTag,
  normalizeTags,
} from '../rules'
import { SessionStore } from '../session'
import {
  LOCALES,
  MAX_ATTACHMENT_BYTES,
  type Attachment,
  type AttachmentDetail,
  type Destination,
  type FolderContents,
  type ID,
  type Link,
  type ListParams,
  type Locale,
  type Note,
  type NoteSummary,
  type Page,
  type PathItem,
  type SearchResult,
  type Trash,
  type TrashKind,
  type User,
} from '../types'

/**
 * In-memory implementation of the data layer that behaves like the real backend (same error codes,
 * ownership, trash cascades, pagination, search). It exists so the UI can be developed and tested without
 * a server. Data is lost on reload. Never part of the production build (see `createRepositories`).
 */
export interface MockOptions {
  session?: SessionStore
  /** Simulated latency per call, in milliseconds. */
  latencyMs?: number
  /** Start with a demo account and some content. */
  seed?: boolean
}

export const DEMO_ACCOUNT = { email: 'demo@example.com', password: 'demo12345' } as const

/** The activation token the mock "emails" for an address: deterministic so it can be typed in dev. */
export const activationTokenFor = (email: string): string => `activate-${email.toLowerCase()}`

interface UserRecord {
  id: ID
  email: string
  password: string
  username: string
  locale: Locale
  active: boolean
  createdAt: string
  lastLoginAt: string | null
}

interface Owned {
  ownerId: ID
  deletedAt: string | null
}

interface FolderRecord extends Owned {
  id: ID
  name: string
  parentFolderId: ID | null
  createdAt: string
}

interface NoteRecord extends Owned {
  id: ID
  title: string
  content: string
  folderId: ID | null
  parentNoteId: ID | null
  pinned: boolean
  tags: string[]
  createdAt: string
  updatedAt: string
}

interface LinkRecord extends Owned {
  id: ID
  title: string
  url: string
  note: string | null
  folderId: ID | null
  parentNoteId: ID | null
  tags: string[]
  createdAt: string
  updatedAt: string
}

interface AttachmentRecord extends Owned {
  id: ID
  fileName: string
  mimeType: string
  sizeBytes: number
  createdAt: string
  folderId: ID | null
  noteId: ID | null
  blob: Blob
}

const MAX_PAGE_SIZE = 100
const DEFAULT_PAGE_SIZE = 20
const SNIPPET_LENGTH = 160
const SNIPPET_LEAD = 50

export function createMockRepositories(options: MockOptions = {}): {
  auth: AuthRepository
  notes: NotesRepository
  session: SessionStore
  /** Wipes everything and restores the initial state. */
  reset: () => void
} {
  const session = options.session ?? new SessionStore(null)
  const latencyMs = options.latencyMs ?? 0

  let users = new Map<ID, UserRecord>()
  let folders = new Map<ID, FolderRecord>()
  let notes = new Map<ID, NoteRecord>()
  let links = new Map<ID, LinkRecord>()
  let attachments = new Map<ID, AttachmentRecord>()

  const now = () => new Date().toISOString()
  const newId = () => crypto.randomUUID()
  // Every notes call starts by checking the session (the real API answers 401 even for empty results).
  const begin = async () => {
    await wait()
    owner()
  }
  const wait = () =>
    latencyMs > 0 ? new Promise<void>((r) => setTimeout(r, latencyMs)) : Promise.resolve()
  const fail = (status: number, code: string, params?: Record<string, unknown>): never => {
    throw new ApiError({ status, code, params })
  }
  const invalid = (...errors: string[]): never => {
    throw new ApiError({ status: 400, code: 'validation_error', errors })
  }

  // ---- session helpers
  const currentUser = (): UserRecord => {
    const id = /^mock-access-(.+)$/.exec(session.accessToken ?? '')?.[1]
    const user = id ? users.get(id) : undefined
    if (!user) return fail(401, 'security.unauthenticated')
    return user
  }
  const owner = () => currentUser().id
  const toUser = (u: UserRecord): User => ({
    id: u.id,
    email: u.email,
    username: u.username,
    locale: u.locale,
    roles: ['ROLE_USER'],
    active: u.active,
    emailValidated: u.active,
    createdAt: u.createdAt,
    lastLoginAt: u.lastLoginAt,
  })

  // ---- lookups scoped to the signed-in user (foreign data looks like it does not exist)
  const own = <T extends Owned>(
    map: Map<ID, T>,
    id: ID,
    notFound: string,
    includeTrashed = false,
  ): T => {
    const item = map.get(id)
    if (!item || item.ownerId !== owner() || (!includeTrashed && item.deletedAt))
      return fail(404, notFound)
    return item
  }
  const folderOf = (id: ID, includeTrashed = false) =>
    own(folders, id, 'folder.not_found', includeTrashed)
  const noteOf = (id: ID, includeTrashed = false) =>
    own(notes, id, 'note.not_found', includeTrashed)
  const linkOf = (id: ID, includeTrashed = false) =>
    own(links, id, 'link.not_found', includeTrashed)
  const attachmentOf = (id: ID, includeTrashed = false) =>
    own(attachments, id, 'attachment.not_found', includeTrashed)

  /** A target folder for creating/moving: must exist, be the user's and not be trashed (422 otherwise). */
  const targetFolder = (id: ID | null | undefined): ID | null => {
    if (id == null) return null
    const folder = folders.get(id)
    if (!folder || folder.ownerId !== owner() || folder.deletedAt)
      return fail(422, 'folder.not_found')
    return id
  }

  /**
   * Where a note or link goes: a folder, a parent note, or the root. Both at once is refused; the target must be
   * the user's and not in the trash (422 otherwise, like the real API).
   */
  const placementOf = (
    folderId: ID | null | undefined,
    parentNoteId: ID | null | undefined,
  ): { folderId: ID | null; parentNoteId: ID | null } => {
    if (folderId != null && parentNoteId != null) return fail(422, 'notes.invalid_location')
    if (parentNoteId != null) {
      const parent = notes.get(parentNoteId)
      if (!parent || parent.ownerId !== owner() || parent.deletedAt) {
        return fail(422, 'note.parent_not_found')
      }
      return { folderId: null, parentNoteId }
    }
    return { folderId: targetFolder(folderId), parentNoteId: null }
  }

  /** The way a move is expressed in the API: ids of the destination, or neither for the root. */
  const destinationIds = (destination: Destination) => ({
    folderId: destination.type === 'folder' ? destination.id : null,
    parentNoteId: destination.type === 'note' ? destination.id : null,
  })

  const checkTags = (names: string[] | undefined): string[] => {
    const { tags, problem } = normalizeTags(names ?? [])
    if (problem) fail(422, 'tag.invalid', { reason: problem })
    return tags
  }
  const checkTitle = (title: string, field = 'title') => {
    if (title.length < 1 || title.length > MAX_TITLE_LENGTH)
      invalid(`[${field}] Must have between 1 and ${MAX_TITLE_LENGTH} characters`)
  }
  const checkUrl = (url: string) => {
    if (!isHttpUrl(url)) fail(422, 'link.invalid_url')
  }

  // ---- DTO mappers
  const attachmentsOfNote = (noteId: ID) =>
    [...attachments.values()].filter((a) => a.noteId === noteId && !a.deletedAt)
  const toAttachment = (a: AttachmentRecord): Attachment => ({
    id: a.id,
    fileName: a.fileName,
    mimeType: a.mimeType,
    sizeBytes: a.sizeBytes,
    createdAt: a.createdAt,
  })
  const childNotes = (noteId: ID, includeTrashed = false) =>
    [...notes.values()].filter(
      (n) => n.parentNoteId === noteId && n.ownerId === owner() && (includeTrashed || !n.deletedAt),
    )
  const childLinks = (noteId: ID, includeTrashed = false) =>
    [...links.values()].filter(
      (l) => l.parentNoteId === noteId && l.ownerId === owner() && (includeTrashed || !l.deletedAt),
    )
  const childCount = (noteId: ID) => childNotes(noteId).length + childLinks(noteId).length
  /** Every note below another one, at any depth. */
  const descendantNotes = (noteId: ID): NoteRecord[] =>
    childNotes(noteId, true).flatMap((child) => [child, ...descendantNotes(child.id)])

  const folderChain = (folder: FolderRecord | undefined): PathItem[] => {
    const chain: PathItem[] = []
    for (
      let current = folder;
      current && chain.length < 100;
      current = current.parentFolderId ? folders.get(current.parentFolderId) : undefined
    ) {
      chain.unshift({ type: 'folder', id: current.id, title: current.name })
    }
    return chain
  }
  const pathOfFolder = (folder: FolderRecord): PathItem[] =>
    folderChain(folder.parentFolderId ? folders.get(folder.parentFolderId) : undefined)
  /** Where a link sits: the note it is under (and that note's ancestors), or the chain of folders it is in. */
  const pathOfLink = (link: LinkRecord): PathItem[] => {
    if (link.parentNoteId) {
      const parent = notes.get(link.parentNoteId)
      return parent
        ? [...pathOfNote(parent), { type: 'note', id: parent.id, title: parent.title }]
        : []
    }
    return folderChain(link.folderId ? folders.get(link.folderId) : undefined)
  }
  const pathOfNote = (note: NoteRecord): PathItem[] => {
    const path: PathItem[] = []
    let current = note
    while (current.parentNoteId && path.length < 100) {
      const parent = notes.get(current.parentNoteId)
      if (!parent) break
      path.unshift({ type: 'note', id: parent.id, title: parent.title })
      current = parent
    }
    return [...folderChain(current.folderId ? folders.get(current.folderId) : undefined), ...path]
  }

  const toNoteSummary = (n: NoteRecord): NoteSummary => ({
    id: n.id,
    title: n.title,
    folderId: n.folderId,
    parentNoteId: n.parentNoteId,
    childCount: childCount(n.id),
    pinned: n.pinned,
    tags: [...n.tags],
    createdAt: n.createdAt,
    updatedAt: n.updatedAt,
  })
  const toNote = (n: NoteRecord): Note => ({
    ...toNoteSummary(n),
    content: n.content,
    attachments: attachmentsOfNote(n.id).map(toAttachment),
    path: pathOfNote(n),
  })
  const toLink = (l: LinkRecord): Link => ({
    id: l.id,
    title: l.title,
    url: l.url,
    note: l.note,
    folderId: l.folderId,
    parentNoteId: l.parentNoteId,
    tags: [...l.tags],
    createdAt: l.createdAt,
    updatedAt: l.updatedAt,
  })

  // ---- generic listing
  const mine = <T extends Owned>(map: Map<ID, T>) =>
    [...map.values()].filter((item) => item.ownerId === owner() && !item.deletedAt)

  function page<T, R>(
    items: T[],
    params: { page?: number; size?: number },
    map: (item: T) => R,
  ): Page<R> {
    const size = Math.max(1, Math.min(params.size ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE))
    const current = Math.max(1, params.page ?? 1)
    return {
      items: items.slice((current - 1) * size, current * size).map(map),
      page: current,
      size,
      total: items.length,
      lastPage: Math.ceil(items.length / size),
    }
  }

  function listFilter<
    T extends {
      folderId: ID | null
      parentNoteId: ID | null
      tags: string[]
      title: string
      createdAt: string
      updatedAt: string
    },
  >(items: T[], params: ListParams): T[] {
    const orderBy = params.orderBy ?? 'updatedAt'
    const direction = params.orderDirection === 'asc' ? 1 : -1
    if (params.size !== undefined && params.size < 1) invalid('[size] Must be a positive integer')
    if (params.page !== undefined && params.page < 1) invalid('[page] Must be a positive integer')
    const tag = params.tag === undefined ? undefined : normalizeTag(params.tag)
    return items
      .filter((item) => {
        if (params.folderId === 'root') return item.folderId === null && item.parentNoteId === null
        if (params.folderId) return item.folderId === params.folderId
        if (params.parentNoteId) return item.parentNoteId === params.parentNoteId
        return true
      })
      .filter((item) => tag === undefined || item.tags.includes(tag))
      .sort((a, b) => {
        const order = String(a[orderBy]).localeCompare(String(b[orderBy]))
        return order !== 0 ? order * direction : a.title.localeCompare(b.title)
      })
  }

  // ---- trash helpers
  const subfolderIds = (id: ID): ID[] => {
    const children = [...folders.values()].filter(
      (f) => f.parentFolderId === id && f.ownerId === owner(),
    )
    return children.flatMap((c) => [c.id, ...subfolderIds(c.id)])
  }
  const withinFolders = (ids: ID[]) => new Set(ids)

  /** A note, its attachments and everything under it go to the trash (or come back) together. */
  function setNoteTreeTrashed(note: NoteRecord, deletedAt: string | null) {
    const mark = <T extends Owned>(item: T) => {
      // Something trashed earlier keeps its own date; restoring clears it.
      item.deletedAt = deletedAt === null ? null : (item.deletedAt ?? deletedAt)
    }
    mark(note)
    for (const a of attachments.values()) if (a.noteId === note.id) mark(a)
    for (const link of childLinks(note.id, true)) mark(link)
    for (const child of childNotes(note.id, true)) setNoteTreeTrashed(child, deletedAt)
  }

  function setTrashed(deletedAt: string | null, folderIds: Set<ID>) {
    for (const f of folders.values()) if (folderIds.has(f.id)) f.deletedAt = deletedAt
    for (const n of [...notes.values()]) {
      if (n.folderId && folderIds.has(n.folderId)) setNoteTreeTrashed(n, deletedAt)
    }
    for (const l of links.values())
      if (l.folderId && folderIds.has(l.folderId)) l.deletedAt = deletedAt
    for (const a of attachments.values())
      if (a.folderId && folderIds.has(a.folderId)) a.deletedAt = deletedAt
  }

  const removeNoteForever = (note: NoteRecord) => {
    for (const child of childNotes(note.id, true)) removeNoteForever(child)
    for (const link of childLinks(note.id, true)) links.delete(link.id)
    for (const a of [...attachments.values()]) if (a.noteId === note.id) attachments.delete(a.id)
    notes.delete(note.id)
  }
  function removeFolderForever(id: ID) {
    const ids = withinFolders([id, ...subfolderIds(id)])
    for (const n of [...notes.values()])
      if (n.folderId && ids.has(n.folderId) && notes.has(n.id)) removeNoteForever(n)
    for (const l of [...links.values()]) if (l.folderId && ids.has(l.folderId)) links.delete(l.id)
    for (const a of [...attachments.values()])
      if (a.folderId && ids.has(a.folderId)) attachments.delete(a.id)
    for (const folderId of ids) folders.delete(folderId)
  }

  const mustBeTrashed = (item: Owned, id: ID) => {
    if (!item.deletedAt) fail(409, 'notes.not_in_trash', { value: id })
  }

  // ---- search
  function snippetOf(body: string, term: string): string {
    const folded = foldForSearch(body)
    const position = term ? folded.indexOf(foldForSearch(term)) : -1
    const start = position > 0 ? Math.max(0, position - SNIPPET_LEAD) : 0
    const slice = body
      .slice(start, start + SNIPPET_LENGTH)
      .replace(/\s+/g, ' ')
      .trim()
    if (slice === '') return ''
    return `${start > 0 ? '…' : ''}${slice}${start + SNIPPET_LENGTH < body.length ? '…' : ''}`
  }

  // ---- repositories
  const auth: AuthRepository = {
    async signUp(input) {
      await wait()
      const errors: string[] = []
      if (!isEmail(input.email)) errors.push('[email] Invalid email')
      if (input.password.length < MIN_PASSWORD_LENGTH) {
        errors.push(`[password] Must be at least ${MIN_PASSWORD_LENGTH} characters long`)
      }
      if (
        input.username !== undefined &&
        (input.username.length < USERNAME_LENGTH.min || input.username.length > USERNAME_LENGTH.max)
      ) {
        errors.push(
          `[username] Must have between ${USERNAME_LENGTH.min} and ${USERNAME_LENGTH.max} characters`,
        )
      }
      if (errors.length) invalid(...errors)
      const email = input.email.toLowerCase()
      if ([...users.values()].some((u) => u.email === email))
        fail(409, 'user.email_already_exists', { value: email })
      const id = newId()
      users.set(id, {
        id,
        email,
        password: input.password,
        username: input.username ?? email.split('@')[0],
        locale: 'en',
        active: false,
        createdAt: now(),
        lastLoginAt: null,
      })
    },

    async activate(token) {
      await wait()
      const user = [...users.values()].find((u) => activationTokenFor(u.email) === token)
      if (!user) return fail(404, 'user.invalid_activation_token')
      user.active = true
    },

    async login(email, password) {
      await wait()
      const user = [...users.values()].find((u) => u.email === email.toLowerCase())
      if (!user || user.password !== password) return fail(401, 'security.bad_credentials')
      if (!user.active) return fail(403, 'security.inactive_user')
      user.lastLoginAt = now()
      session.setTokens({
        accessToken: `mock-access-${user.id}`,
        refreshToken: `mock-refresh-${user.id}`,
      })
      return toUser(user)
    },

    async logout() {
      await wait()
      session.clear()
    },

    async restoreSession() {
      await wait()
      const id = /^mock-refresh-(.+)$/.exec(session.refreshToken ?? '')?.[1]
      const user = id ? users.get(id) : undefined
      if (!user) {
        session.clear()
        return null
      }
      session.setTokens({
        accessToken: `mock-access-${user.id}`,
        refreshToken: `mock-refresh-${user.id}`,
      })
      return toUser(user)
    },

    async me() {
      await wait()
      return toUser(currentUser())
    },

    async updateProfile(input) {
      await wait()
      const user = currentUser()
      if (input.username !== undefined) {
        if (
          input.username.length < USERNAME_LENGTH.min ||
          input.username.length > USERNAME_LENGTH.max
        ) {
          invalid(
            `[username] Must have between ${USERNAME_LENGTH.min} and ${USERNAME_LENGTH.max} characters`,
          )
        }
        user.username = input.username
      }
      if (input.locale !== undefined) {
        if (!(LOCALES as readonly string[]).includes(input.locale))
          invalid('[locale] Does not have a value in the enumeration')
        user.locale = input.locale
      }
      return toUser(user)
    },
  }

  const notesRepository: NotesRepository = {
    // ---- folders
    async folderContents(folderId) {
      await begin()
      const folder = folderId ? folderOf(folderId) : null
      const id = folder?.id ?? null
      const byRecent = <T extends { updatedAt?: string; createdAt: string }>(a: T, b: T) =>
        (b.updatedAt ?? b.createdAt).localeCompare(a.updatedAt ?? a.createdAt)
      const contents: FolderContents = {
        folder: folder
          ? {
              id: folder.id,
              name: folder.name,
              parentFolderId: folder.parentFolderId,
              path: pathOfFolder(folder),
            }
          : null,
        subfolders: mine(folders)
          .filter((f) => f.parentFolderId === id)
          .sort((a, b) => a.name.localeCompare(b.name))
          .map((f) => ({ id: f.id, name: f.name, createdAt: f.createdAt })),
        notes: mine(notes)
          .filter((n) => n.folderId === id && n.parentNoteId === null)
          .sort(byRecent)
          .map(toNoteSummary),
        links: mine(links)
          .filter((l) => l.folderId === id && l.parentNoteId === null)
          .sort(byRecent)
          .map(toLink),
        attachments: id
          ? mine(attachments)
              .filter((a) => a.folderId === id)
              .sort(byRecent)
              .map(toAttachment)
          : [],
      }
      return contents
    },

    async createFolder(name, parentFolderId = null) {
      await begin()
      checkTitle(name, 'name')
      const parent = targetFolder(parentFolderId)
      const folder: FolderRecord = {
        id: newId(),
        name,
        parentFolderId: parent,
        ownerId: owner(),
        createdAt: now(),
        deletedAt: null,
      }
      folders.set(folder.id, folder)
      return { id: folder.id, name, parentFolderId: parent }
    },

    async renameFolder(id, name) {
      await begin()
      checkTitle(name, 'name')
      folderOf(id).name = name
    },

    async moveFolder(id, parentFolderId) {
      await begin()
      const folder = folderOf(id)
      const target = targetFolder(parentFolderId)
      if (target && (target === id || subfolderIds(id).includes(target)))
        fail(422, 'folder.cycle_detected')
      folder.parentFolderId = target
    },

    async deleteFolder(id) {
      await begin()
      const folder = folderOf(id, true)
      setTrashed(folder.deletedAt ?? now(), withinFolders([id, ...subfolderIds(id)]))
    },

    // ---- notes
    async listNotes(params = {}) {
      await begin()
      const items = listFilter(mine(notes), params).filter(
        (n) => params.pinned === undefined || n.pinned === params.pinned,
      )
      return page(items, params, toNoteSummary)
    },

    async getNote(id) {
      await begin()
      return toNote(noteOf(id, true))
    },

    async createNote(input) {
      await begin()
      checkTitle(input.title)
      const { folderId, parentNoteId } = placementOf(input.folderId, input.parentNoteId)
      const tags = checkTags(input.tags)
      const timestamp = now()
      const note: NoteRecord = {
        id: newId(),
        title: input.title,
        content: input.content ?? '',
        folderId,
        parentNoteId,
        pinned: input.pinned ?? false,
        tags,
        createdAt: timestamp,
        updatedAt: timestamp,
        ownerId: owner(),
        deletedAt: null,
      }
      notes.set(note.id, note)
      return toNote(note)
    },

    async updateNote(id, input) {
      await begin()
      const note = noteOf(id, true)
      if (input.title !== undefined) checkTitle(input.title)
      const tags = input.tags === undefined ? undefined : checkTags(input.tags)
      if (input.title !== undefined) note.title = input.title
      if (input.content !== undefined) note.content = input.content
      if (input.pinned !== undefined) note.pinned = input.pinned
      if (tags !== undefined) note.tags = tags
      note.updatedAt = now()
    },

    async moveNote(id, destination) {
      await begin()
      const note = noteOf(id, true)
      const target = placementOf(
        destinationIds(destination).folderId,
        destinationIds(destination).parentNoteId,
      )
      if (
        target.parentNoteId &&
        (target.parentNoteId === id ||
          descendantNotes(id).some((d) => d.id === target.parentNoteId))
      ) {
        fail(422, 'note.cycle_detected', { note_id: id, target_id: target.parentNoteId })
      }
      note.folderId = target.folderId
      note.parentNoteId = target.parentNoteId
      note.updatedAt = now()
    },

    async deleteNote(id) {
      await begin()
      setNoteTreeTrashed(noteOf(id, true), now())
    },

    async noteChildren(id) {
      await begin()
      const note = noteOf(id)
      const byTitle = (a: { title: string }, b: { title: string }) => a.title.localeCompare(b.title)
      return {
        notes: childNotes(note.id).sort(byTitle).map(toNoteSummary),
        links: childLinks(note.id).sort(byTitle).map(toLink),
      }
    },

    // ---- links
    async listLinks(params = {}) {
      await begin()
      return page(listFilter(mine(links), params), params, toLink)
    },

    async getLink(id) {
      await begin()
      const link = linkOf(id, true)
      return { ...toLink(link), path: pathOfLink(link) }
    },

    async createLink(input) {
      await begin()
      checkTitle(input.title)
      checkUrl(input.url)
      const { folderId, parentNoteId } = placementOf(input.folderId, input.parentNoteId)
      const tags = checkTags(input.tags)
      const timestamp = now()
      const link: LinkRecord = {
        id: newId(),
        title: input.title,
        url: input.url.trim(),
        note: input.note ? input.note : null,
        folderId,
        parentNoteId,
        tags,
        createdAt: timestamp,
        updatedAt: timestamp,
        ownerId: owner(),
        deletedAt: null,
      }
      links.set(link.id, link)
      return { ...toLink(link), path: pathOfLink(link) }
    },

    async updateLink(id, input) {
      await begin()
      const link = linkOf(id)
      if (input.title !== undefined) checkTitle(input.title)
      if (input.url !== undefined) checkUrl(input.url)
      const tags = input.tags === undefined ? undefined : checkTags(input.tags)
      if (input.title !== undefined) link.title = input.title
      if (input.url !== undefined) link.url = input.url.trim()
      if (input.note !== undefined) link.note = input.note ? input.note : null
      if (tags !== undefined) link.tags = tags
      link.updatedAt = now()
    },

    async moveLink(id, destination) {
      await begin()
      const link = linkOf(id)
      const target = placementOf(
        destinationIds(destination).folderId,
        destinationIds(destination).parentNoteId,
      )
      link.folderId = target.folderId
      link.parentNoteId = target.parentNoteId
      link.updatedAt = now()
    },

    async deleteLink(id) {
      await begin()
      const link = linkOf(id, true)
      link.deletedAt ??= now()
    },

    // ---- attachments
    async uploadNoteAttachment(noteId, file, uploadOptions) {
      await begin()
      const note = noteOf(noteId)
      return store(file, { noteId: note.id, folderId: null }, uploadOptions?.onProgress)
    },

    async uploadFolderAttachment(folderId, file, uploadOptions) {
      await begin()
      const folder = folderOf(folderId)
      return store(file, { noteId: null, folderId: folder.id }, uploadOptions?.onProgress)
    },

    async getAttachment(id) {
      await begin()
      const a = attachmentOf(id, true)
      const detail: AttachmentDetail = {
        ...toAttachment(a),
        folderId: a.folderId,
        noteId: a.noteId,
      }
      return detail
    },

    async downloadAttachment(id) {
      await begin()
      return attachmentOf(id).blob
    },

    async deleteAttachment(id) {
      await begin()
      const a = attachmentOf(id, true)
      a.deletedAt ??= now()
    },

    // ---- search and tags
    async search(params) {
      await begin()
      const query = params.q.trim()
      if (query.length < MIN_SEARCH_LENGTH)
        fail(422, 'search.query_too_short', { min_length: MIN_SEARCH_LENGTH })
      const terms = [...new Set(foldForSearch(query).split(/\s+/).filter(Boolean))].slice(0, 8)
      const types = params.types?.length ? params.types : (['note', 'link'] as const)
      const tag = params.tag === undefined ? undefined : normalizeTag(params.tag)
      if (params.page !== undefined && params.page < 1) invalid('[page] Must be a positive integer')

      type Candidate = {
        type: 'note' | 'link'
        id: ID
        title: string
        body: string
        url: string | null
        folderId: ID | null
        tags: string[]
        updatedAt: string
      }
      const candidates: Candidate[] = [
        ...(types.includes('note')
          ? mine(notes).map((n): Candidate => ({
              type: 'note',
              id: n.id,
              title: n.title,
              body: n.content,
              url: null,
              folderId: n.folderId,
              tags: n.tags,
              updatedAt: n.updatedAt,
            }))
          : []),
        ...(types.includes('link')
          ? mine(links).map((l): Candidate => ({
              type: 'link',
              id: l.id,
              title: l.title,
              body: l.note ?? '',
              url: l.url,
              folderId: l.folderId,
              tags: l.tags,
              updatedAt: l.updatedAt,
            }))
          : []),
      ]

      const matches = candidates
        .filter((c) => tag === undefined || c.tags.includes(tag))
        .filter((c) => {
          const haystack = foldForSearch(`${c.title}\n${c.body}\n${c.url ?? ''}`)
          return terms.every((term) => haystack.includes(term))
        })
        .map((c) => ({
          c,
          titleRank: terms.every((t) => foldForSearch(c.title).includes(t)) ? 0 : 1,
        }))
        .sort(
          (a, b) =>
            a.titleRank - b.titleRank ||
            b.c.updatedAt.localeCompare(a.c.updatedAt) ||
            a.c.id.localeCompare(b.c.id),
        )

      return page(matches, params, ({ c }): SearchResult => ({
        type: c.type,
        id: c.id,
        title: c.title,
        snippet: snippetOf(c.body, terms.find((t) => foldForSearch(c.body).includes(t)) ?? ''),
        folderId: c.folderId,
        tags: [...c.tags],
        updatedAt: c.updatedAt,
        url: c.url,
      }))
    },

    async listTags() {
      await begin()
      const counts = new Map<string, number>()
      for (const item of [...mine(notes), ...mine(links)]) {
        for (const tag of item.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1)
      }
      return [...counts]
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    },

    // ---- trash
    async listTrash() {
      await begin()
      const trashed = <T extends Owned>(map: Map<ID, T>) =>
        [...map.values()]
          .filter((x) => x.ownerId === owner() && x.deletedAt)
          .sort((a, b) => String(b.deletedAt).localeCompare(String(a.deletedAt)))
      const trash: Trash = {
        folders: trashed(folders).map((f) => ({
          id: f.id,
          name: f.name,
          parentFolderId: f.parentFolderId,
          deletedAt: f.deletedAt!,
        })),
        notes: trashed(notes)
          .filter((n) => !n.parentNoteId || !notes.get(n.parentNoteId)?.deletedAt)
          .map((n) => ({
            id: n.id,
            title: n.title,
            folderId: n.folderId,
            deletedAt: n.deletedAt!,
          })),
        links: trashed(links)
          .filter((l) => !l.parentNoteId || !notes.get(l.parentNoteId)?.deletedAt)
          .map((l) => ({
            id: l.id,
            title: l.title,
            url: l.url,
            folderId: l.folderId,
            deletedAt: l.deletedAt!,
          })),
        attachments: trashed(attachments)
          .filter((a) => !a.noteId || !notes.get(a.noteId)?.deletedAt)
          .map((a) => ({
            id: a.id,
            fileName: a.fileName,
            folderId: a.folderId,
            noteId: a.noteId,
            deletedAt: a.deletedAt!,
          })),
      }
      return trash
    },

    async restore(kind, id) {
      await begin()
      const item = trashItem(kind, id)
      mustBeTrashed(item, id)
      if (kind === 'folder') {
        setTrashed(null, withinFolders([id, ...subfolderIds(id)]))
        return
      }
      const parentFolder =
        'folderId' in item && item.folderId ? folders.get(item.folderId as ID) : undefined
      if (parentFolder?.deletedAt)
        fail(409, 'notes.parent_folder_in_trash', { value: parentFolder.id })
      const parentNoteId = 'parentNoteId' in item ? (item.parentNoteId as ID | null) : null
      if (parentNoteId && notes.get(parentNoteId)?.deletedAt) {
        fail(409, 'notes.parent_note_in_trash', { value: parentNoteId })
      }
      if (kind === 'attachment') {
        const parentNote = (item as AttachmentRecord).noteId
          ? notes.get((item as AttachmentRecord).noteId!)
          : undefined
        if (parentNote?.deletedAt) fail(409, 'notes.parent_note_in_trash', { value: parentNote.id })
      }
      if (kind === 'note') setNoteTreeTrashed(item as NoteRecord, null)
      else item.deletedAt = null
    },

    async deletePermanently(kind, id) {
      await begin()
      const item = trashItem(kind, id)
      mustBeTrashed(item, id)
      if (kind === 'folder') removeFolderForever(id)
      else if (kind === 'note') removeNoteForever(item as NoteRecord)
      else if (kind === 'link') links.delete(id)
      else attachments.delete(id)
    },

    async emptyTrash() {
      await begin()
      for (const f of [...folders.values()]) {
        if (f.ownerId === owner() && f.deletedAt && folders.has(f.id)) removeFolderForever(f.id)
      }
      for (const n of [...notes.values()]) {
        // A note under another trashed note is gone already.
        if (n.ownerId === owner() && n.deletedAt && notes.has(n.id)) removeNoteForever(n)
      }
      for (const l of [...links.values()])
        if (l.ownerId === owner() && l.deletedAt) links.delete(l.id)
      for (const a of [...attachments.values()])
        if (a.ownerId === owner() && a.deletedAt) attachments.delete(a.id)
    },
  }

  function trashItem(kind: TrashKind, id: ID): Owned & { id: ID } {
    switch (kind) {
      case 'folder':
        return folderOf(id, true)
      case 'note':
        return noteOf(id, true)
      case 'link':
        return linkOf(id, true)
      case 'attachment':
        return attachmentOf(id, true)
    }
  }

  async function store(
    file: File,
    location: { noteId: ID | null; folderId: ID | null },
    onProgress?: (fraction: number) => void,
  ): Promise<Attachment> {
    if (file.size === 0) fail(422, 'attachment.empty')
    if (file.size > MAX_ATTACHMENT_BYTES)
      fail(422, 'attachment.too_large', { max_bytes: MAX_ATTACHMENT_BYTES })
    onProgress?.(0.5)
    const record: AttachmentRecord = {
      id: newId(),
      fileName: file.name,
      mimeType: file.type || 'application/octet-stream',
      sizeBytes: file.size,
      createdAt: now(),
      ...location,
      blob: file,
      ownerId: owner(),
      deletedAt: null,
    }
    attachments.set(record.id, record)
    onProgress?.(1)
    return toAttachment(record)
  }

  function seed() {
    const id = 'demo-user'
    users.set(id, {
      id,
      email: DEMO_ACCOUNT.email,
      password: DEMO_ACCOUNT.password,
      username: 'demo',
      locale: 'en',
      active: true,
      createdAt: '2026-01-01T09:00:00+00:00',
      lastLoginAt: null,
    })
    const stamp = (n: number) => `2026-10-0${n}T10:00:00+00:00`
    const folder = (name: string, parentFolderId: ID | null = null): FolderRecord => {
      const f: FolderRecord = {
        id: newId(),
        name,
        parentFolderId,
        ownerId: id,
        createdAt: stamp(1),
        deletedAt: null,
      }
      folders.set(f.id, f)
      return f
    }
    const work = folder('Work')
    folder('Ideas')
    const note = (
      title: string,
      content: string,
      folderId: ID | null,
      tags: string[],
      pinned = false,
      day = 2,
      parentNoteId: ID | null = null,
    ) => {
      const n: NoteRecord = {
        id: newId(),
        title,
        content,
        folderId,
        parentNoteId,
        pinned,
        tags,
        createdAt: stamp(1),
        updatedAt: stamp(day),
        ownerId: id,
        deletedAt: null,
      }
      notes.set(n.id, n)
      return n
    }
    note(
      'Welcome to LibreNotes',
      '# Welcome\n\nWrite **Markdown** notes, save links and attach files.\n\n- [x] Try the editor\n- [ ] Create your first folder\n',
      null,
      ['start'],
      true,
      3,
    )
    const plan = note(
      'Quarterly plan',
      '## Goals\n\n1. Ship the MVP\n2. Collect feedback\n',
      work.id,
      ['work', 'planning'],
    )
    // A document can hold documents, like a page with sub-pages.
    const mvp = note(
      'MVP checklist',
      '- [x] Sign in\n- [x] Documents\n- [ ] Folders and tags\n',
      null,
      ['work'],
      false,
      3,
      plan.id,
    )
    note('Open questions', 'What to build after the MVP?', null, ['work'], false, 2, mvp.id)
    note('Meeting notes', 'Kick-off on Monday.', null, [], false, 2, plan.id)
    note('Reading list', 'Books to read this year.', null, ['personal'], false, 1)
    const link: LinkRecord = {
      id: newId(),
      title: 'Markdown guide',
      url: 'https://www.markdownguide.org',
      note: 'Cheat sheet',
      folderId: null,
      parentNoteId: null,
      tags: ['reference'],
      createdAt: stamp(1),
      updatedAt: stamp(2),
      ownerId: id,
      deletedAt: null,
    }
    links.set(link.id, link)
  }

  const populate = () => {
    users = new Map()
    folders = new Map()
    notes = new Map()
    links = new Map()
    attachments = new Map()
    if (options.seed) seed()
  }
  // Creating the mock keeps a stored session (so a page reload resumes it); `reset()` also signs out.
  const reset = () => {
    populate()
    session.clear()
  }
  populate()

  return { auth, notes: notesRepository, session, reset }
}
