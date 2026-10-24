import { ApiError } from '../errors'
import type { AuthRepository, NotesRepository } from '../repositories'
import type { SessionStore } from '../session'
import {
  MAX_ATTACHMENT_BYTES,
  type Attachment,
  type AttachmentDetail,
  type Destination,
  type ID,
  type ListParams,
  type OrderBy,
  type TrashKind,
  type UploadOptions,
} from '../types'
import { createHttpClient, unwrap, type HttpClient, type HttpClientOptions } from './client'
import {
  req,
  toAttachmentDetail,
  toFolderContents,
  toLink,
  toLinkDetail,
  toNote,
  toNoteChildren,
  toNoteSummary,
  toPage,
  toSearchResults,
  toTagCount,
  toTrash,
  toUser,
} from './mappers'
import { uploadFile } from './upload'

const ORDER_FIELDS: Record<OrderBy, 'updated_at' | 'created_at' | 'title'> = {
  updatedAt: 'updated_at',
  createdAt: 'created_at',
  title: 'title',
}

export interface HttpRepositories {
  auth: AuthRepository
  notes: NotesRepository
  client: HttpClient
}

export interface HttpRepositoriesOptions extends HttpClientOptions {
  /** Replaceable in tests (uploads use XMLHttpRequest to report progress). */
  createXhr?: () => XMLHttpRequest
}

export function createHttpRepositories(options: HttpRepositoriesOptions): HttpRepositories {
  const client = createHttpClient(options)
  return {
    auth: createAuthRepository(client, options.session),
    notes: createNotesRepository(client, options.createXhr),
    client,
  }
}

function createAuthRepository(client: HttpClient, session: SessionStore): AuthRepository {
  const { api } = client

  const me = async () => toUser(await unwrap(api.GET('/me')))

  return {
    async registrationEnabled() {
      let response: Response
      try {
        response = await client.fetch(
          new Request(client.url('/'), { headers: { Accept: 'application/json' } }),
        )
      } catch (cause) {
        throw ApiError.network(cause)
      }
      if (!response.ok) throw ApiError.fromResponse(response.status, undefined)
      const body: unknown = await response.json().catch(() => null)
      return (body as { registration_enabled?: unknown } | null)?.registration_enabled !== false
    },

    async signUp(input) {
      await unwrap(api.POST('/signup', { body: input }))
    },

    async activate(token) {
      await unwrap(api.POST('/users/activate', { body: { token } }))
    },

    async login(email, password) {
      const tokens = await unwrap(api.POST('/login', { body: { email, password } }))
      session.setTokens({
        accessToken: req(tokens.accessToken, 'accessToken'),
        refreshToken: req(tokens.refreshToken, 'refreshToken'),
      })
      try {
        return await me()
      } catch (error) {
        session.clear() // a half-open session would be worse than a failed login
        throw error
      }
    },

    async logout() {
      const token = session.refreshToken
      session.clear()
      if (!token) return
      try {
        await unwrap(api.DELETE('/token-renew', { body: { token } }))
      } catch {
        // The server could not revoke it (offline...): the local session is gone either way.
      }
    },

    async restoreSession() {
      if (!session.refreshToken) return null
      if (!session.accessToken && !(await client.renew())) return null
      try {
        return await me()
      } catch (error) {
        if (error instanceof ApiError && error.status === 0) throw error // offline: keep the session
        session.clear()
        return null
      }
    },

    me,

    async updateProfile(input) {
      await unwrap(api.PATCH('/me', { body: input }))
      return me()
    },

    async changePassword({ currentPassword, newPassword }) {
      await unwrap(
        api.PATCH('/me/password', {
          body: { current_password: currentPassword, new_password: newPassword },
        }),
      )
      // Every token was revoked server-side: do not try to renew or log out with them.
      session.clear()
    },
  }
}

function createNotesRepository(
  client: HttpClient,
  createXhr?: () => XMLHttpRequest,
): NotesRepository {
  const { api } = client
  const path = (id: ID) => ({ params: { path: { id } } })

  const upload = async (url: string, file: File, options?: UploadOptions) => {
    if (file.size === 0) throw new ApiError({ status: 422, code: 'attachment.empty' })
    if (file.size > MAX_ATTACHMENT_BYTES) {
      throw new ApiError({
        status: 422,
        code: 'attachment.too_large',
        params: { max_bytes: MAX_ATTACHMENT_BYTES },
      })
    }
    const body = (await uploadFile(
      url,
      file,
      { getAccessToken: client.getAccessToken, renew: client.renew, createXhr },
      options,
    )) as { id?: string } | null
    return { id: req(body?.id, 'id') }
  }

  const listQuery = (params: ListParams = {}) => ({
    folder_id: params.folderId,
    parent_note_id: params.parentNoteId,
    tag: params.tag,
    orderBy: params.orderBy ? ORDER_FIELDS[params.orderBy] : undefined,
    orderDirection: params.orderDirection,
    page: params.page,
    size: params.size,
  })

  const getAttachment = async (id: ID) =>
    toAttachmentDetail(await unwrap(api.GET('/attachments/{id}', path(id))))

  return {
    // Folders
    async folderContents(folderId) {
      const dto = await unwrap(
        api.GET('/folders/contents', { params: { query: { folder_id: folderId ?? undefined } } }),
      )
      return toFolderContents(dto)
    },
    async createFolder(name, parentFolderId = null) {
      const { id } = await unwrap(
        api.POST('/folders', { body: { name, parent_folder_id: parentFolderId } }),
      )
      return { id: req(id, 'id'), name, parentFolderId, icon: null }
    },
    async renameFolder(id, name) {
      await unwrap(api.PATCH('/folders/{id}', { ...path(id), body: { name } }))
    },
    async updateFolder(id, input) {
      await unwrap(api.PATCH('/folders/{id}', { ...path(id), body: input }))
    },
    async moveFolder(id, parentFolderId) {
      await unwrap(
        api.PATCH('/folders/{id}/move', {
          ...path(id),
          body: { parent_folder_id: parentFolderId },
        }),
      )
    },
    async deleteFolder(id) {
      await unwrap(api.DELETE('/folders/{id}', path(id)))
    },

    // Notes
    async listNotes(params) {
      const query = { ...listQuery(params), pinned: params?.pinned }
      const dto = await unwrap(api.GET('/notes', { params: { query } }))
      return toPage(dto, (item) => toNoteSummary(item))
    },
    async getNote(id) {
      return toNote(await unwrap(api.GET('/notes/{id}', path(id))))
    },
    async createNote(input) {
      const { id } = await unwrap(
        api.POST('/notes', {
          body: {
            title: input.title,
            content: input.content,
            icon: input.icon,
            folder_id: input.folderId,
            parent_note_id: input.parentNoteId,
            pinned: input.pinned,
            tags: input.tags,
          },
        }),
      )
      return toNote(await unwrap(api.GET('/notes/{id}', path(req(id, 'id')))))
    },
    async updateNote(id, input) {
      await unwrap(api.PATCH('/notes/{id}', { ...path(id), body: input }))
    },
    async moveNote(id, destination) {
      await unwrap(
        api.PATCH('/notes/{id}/move', { ...path(id), body: destinationBody(destination) }),
      )
    },
    async noteChildren(id) {
      return toNoteChildren(await unwrap(api.GET('/notes/{id}/children', path(id))), id)
    },
    async deleteNote(id) {
      await unwrap(api.DELETE('/notes/{id}', path(id)))
    },

    // Links
    async listLinks(params) {
      const dto = await unwrap(api.GET('/links', { params: { query: listQuery(params) } }))
      return toPage(dto, (item) => toLink(item))
    },
    async getLink(id) {
      return toLinkDetail(await unwrap(api.GET('/links/{id}', path(id))))
    },
    async createLink(input) {
      const { id } = await unwrap(
        api.POST('/links', {
          body: {
            title: input.title,
            url: input.url,
            note: input.note,
            icon: input.icon,
            folder_id: input.folderId,
            parent_note_id: input.parentNoteId,
            tags: input.tags,
          },
        }),
      )
      return toLinkDetail(await unwrap(api.GET('/links/{id}', path(req(id, 'id')))))
    },
    async updateLink(id, input) {
      await unwrap(api.PATCH('/links/{id}', { ...path(id), body: input }))
    },
    async moveLink(id, destination) {
      await unwrap(
        api.PATCH('/links/{id}/move', { ...path(id), body: destinationBody(destination) }),
      )
    },
    async deleteLink(id) {
      await unwrap(api.DELETE('/links/{id}', path(id)))
    },

    // Attachments
    async uploadNoteAttachment(noteId, file, options) {
      const { id } = await upload(
        client.url(`/notes/${encodeURIComponent(noteId)}/attachments`),
        file,
        options,
      )
      return withoutLocation(await getAttachment(id))
    },
    async uploadFolderAttachment(folderId, file, options) {
      const { id } = await upload(
        client.url(`/folders/${encodeURIComponent(folderId)}/attachments`),
        file,
        options,
      )
      return withoutLocation(await getAttachment(id))
    },
    getAttachment,
    async downloadAttachment(id) {
      return unwrap(
        api.GET('/attachments/{id}/content', { ...path(id), parseAs: 'blob' }),
      ) as Promise<Blob>
    },
    async deleteAttachment(id) {
      await unwrap(api.DELETE('/attachments/{id}', path(id)))
    },

    // Search and tags
    async search(params) {
      const dto = await unwrap(
        api.GET('/search', {
          params: {
            query: {
              q: params.q,
              type: params.types?.join(','),
              page: params.page,
              size: params.size,
            },
          },
        }),
      )
      return toSearchResults(dto, params.q)
    },
    async listTags() {
      const dto = await unwrap(api.GET('/tags'))
      return (dto.data ?? []).map(toTagCount)
    },

    // Trash
    async listTrash() {
      return toTrash(await unwrap(api.GET('/trash')))
    },
    async restore(kind, id) {
      await unwrap(restoreCall(api, kind, id))
    },
    async deletePermanently(kind, id) {
      await unwrap(deleteCall(api, kind, id))
    },
    async emptyTrash() {
      await unwrap(api.DELETE('/trash'))
    },
  }
}

/** The request body that places an item: exactly one of the two ids, or neither for the root. */
function destinationBody(destination: Destination) {
  return {
    folder_id: destination.type === 'folder' ? destination.id : null,
    parent_note_id: destination.type === 'note' ? destination.id : null,
  }
}

/** An uploaded file is returned without the location it was uploaded to. */
function withoutLocation({
  id,
  fileName,
  mimeType,
  sizeBytes,
  createdAt,
}: AttachmentDetail): Attachment {
  return { id, fileName, mimeType, sizeBytes, createdAt }
}

function restoreCall(api: HttpClient['api'], kind: TrashKind, id: ID) {
  const p = { params: { path: { id } } }
  switch (kind) {
    case 'folder':
      return api.POST('/trash/folders/{id}/restore', p)
    case 'note':
      return api.POST('/trash/notes/{id}/restore', p)
    case 'link':
      return api.POST('/trash/links/{id}/restore', p)
    case 'attachment':
      return api.POST('/trash/attachments/{id}/restore', p)
  }
}

function deleteCall(api: HttpClient['api'], kind: TrashKind, id: ID) {
  const p = { params: { path: { id } } }
  switch (kind) {
    case 'folder':
      return api.DELETE('/trash/folders/{id}', p)
    case 'note':
      return api.DELETE('/trash/notes/{id}', p)
    case 'link':
      return api.DELETE('/trash/links/{id}', p)
    case 'attachment':
      return api.DELETE('/trash/attachments/{id}', p)
  }
}
