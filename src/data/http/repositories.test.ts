import { describe, expect, it } from 'vitest'
import { apiError, createFakeServer, json, memorySession } from '@/test/fakeServer'
import { FakeXhr, createFakeXhr, lastXhr } from '@/test/fakeXhr'
import { MAX_ATTACHMENT_BYTES } from '../types'
import { createHttpRepositories } from './repositories'

const file = (name: string, content: string) => new File([content], name, { type: 'text/plain' })

const ME = {
  id: 'u1',
  email: 'ada@example.com',
  username: 'ada',
  locale: 'es',
  roles: ['ROLE_USER'],
  active: true,
  email_validated: true,
  created_at: '2026-10-01T10:00:00+00:00',
  last_login_at: null,
}

function setup(routes: Parameters<typeof createFakeServer>[0], refresh?: string) {
  const server = createFakeServer(routes)
  const { session, storage } = memorySession(refresh)
  const repos = createHttpRepositories({
    baseUrl: 'http://api.test',
    session,
    fetch: server.fetch,
    createXhr: createFakeXhr,
  })
  return { server, session, storage, ...repos }
}

describe('auth', () => {
  it('logs in, stores the session and returns the mapped user', async () => {
    const { auth, session, server, storage } = setup({
      'POST /login': () => json({ accessToken: 'a1', refreshToken: 'r1' }),
      'GET /me': () => json(ME),
    })

    const user = await auth.login('ada@example.com', 'secret123')

    expect(user).toEqual({
      id: 'u1',
      email: 'ada@example.com',
      username: 'ada',
      locale: 'es',
      roles: ['ROLE_USER'],
      active: true,
      emailValidated: true,
      createdAt: '2026-10-01T10:00:00+00:00',
      lastLoginAt: null,
    })
    expect(server.callsTo('POST /login')[0].body).toEqual({
      email: 'ada@example.com',
      password: 'secret123',
    })
    expect(server.callsTo('GET /me')[0].headers.get('Authorization')).toBe('Bearer a1')
    expect(session.accessToken).toBe('a1')
    expect(storage.get('librenotes.refreshToken')).toBe('r1')
  })

  it('does not leave a session behind when the login fails or the profile cannot be read', async () => {
    const bad = setup({ 'POST /login': () => apiError(401, 'security.bad_credentials') })
    await expect(bad.auth.login('a@b.co', 'x')).rejects.toMatchObject({
      code: 'security.bad_credentials',
    })
    expect(bad.session.hasSession).toBe(false)

    const half = setup({
      'POST /login': () => json({ accessToken: 'a1', refreshToken: 'r1' }),
      'GET /me': () => apiError(500, 'internal_error'),
    })
    await expect(half.auth.login('a@b.co', 'x')).rejects.toMatchObject({ status: 500 })
    expect(half.session.hasSession).toBe(false)
  })

  it('reports an inactive account distinctly', async () => {
    const { auth } = setup({ 'POST /login': () => apiError(403, 'security.inactive_user') })

    await expect(auth.login('a@b.co', 'x')).rejects.toMatchObject({
      status: 403,
      code: 'security.inactive_user',
    })
  })

  it('signs up and activates', async () => {
    const { auth, server } = setup({
      'POST /signup': () => json([], 201),
      'POST /users/activate': () => json([]),
    })

    await auth.signUp({ email: 'ada@example.com', password: 'secret123', username: 'ada' })
    await auth.activate('tok-1')

    expect(server.callsTo('POST /signup')[0].body).toEqual({
      email: 'ada@example.com',
      password: 'secret123',
      username: 'ada',
    })
    expect(server.callsTo('POST /users/activate')[0].body).toEqual({ token: 'tok-1' })
  })

  it('logs out: revokes the refresh token and clears the session, even if the server fails', async () => {
    const ok = setup({ 'DELETE /token-renew': () => json([]) }, 'r1')
    await ok.auth.logout()
    expect(ok.server.callsTo('DELETE /token-renew')[0].body).toEqual({ token: 'r1' })
    expect(ok.session.hasSession).toBe(false)

    const down = setup({ 'DELETE /token-renew': () => apiError(500, 'internal_error') }, 'r1')
    await expect(down.auth.logout()).resolves.toBeUndefined()
    expect(down.session.hasSession).toBe(false)
  })

  it('restores a session from the stored refresh token', async () => {
    const { auth, session } = setup(
      {
        'PUT /token-renew': () => json({ accessToken: 'a2', refreshToken: 'r2' }),
        'GET /me': () => json(ME),
      },
      'r1',
    )

    const user = await auth.restoreSession()

    expect(user?.email).toBe('ada@example.com')
    expect(session.accessToken).toBe('a2')
    expect(session.refreshToken).toBe('r2')
  })

  it('restoreSession resolves null when there is nothing to restore or the token is no longer valid', async () => {
    const none = setup({})
    expect(await none.auth.restoreSession()).toBeNull()

    const expired = setup(
      { 'PUT /token-renew': () => apiError(401, 'security.invalid_token') },
      'r1',
    )
    expect(await expired.auth.restoreSession()).toBeNull()
    expect(expired.session.hasSession).toBe(false)
  })

  it('restoreSession keeps the session and fails when the server cannot be reached', async () => {
    const { auth, session } = setup(
      { 'PUT /token-renew': () => Promise.reject(new TypeError('Failed to fetch')) },
      'r1',
    )

    expect(await auth.restoreSession()).toBeNull() // renewal failed transiently: nothing to show yet
    expect(session.refreshToken).toBe('r1') // but the user is not logged out
  })

  it('updates the profile and returns the refreshed user', async () => {
    const { auth, server } = setup(
      { 'PATCH /me': () => json([]), 'GET /me': () => json({ ...ME, locale: 'en' }) },
      undefined,
    )

    const user = await auth.updateProfile({ locale: 'en' })

    expect(server.callsTo('PATCH /me')[0].body).toEqual({ locale: 'en' })
    expect(user.locale).toBe('en')
  })

  it('falls back to English for a locale it does not know', async () => {
    const { auth } = setup({ 'GET /me': () => json({ ...ME, locale: 'fr' }) })

    expect((await auth.me()).locale).toBe('en')
  })

  it('fails loudly when the API stops sending a field it relies on', async () => {
    const { auth } = setup({ 'GET /me': () => json({ ...ME, email: undefined }) })

    await expect(auth.me()).rejects.toMatchObject({ code: 'invalid_response' })
  })
})

describe('notes repository', () => {
  const NOTE = {
    id: 'n1',
    title: 'Plan',
    content: '# Hi',
    folder_id: 'f1',
    parent_note_id: null,
    child_count: 2,
    path: [
      { type: 'folder', id: 'f0', title: 'Root folder' },
      { type: 'folder', id: 'f1', title: 'Work' },
    ],
    pinned: true,
    tags: ['work'],
    created_at: '2026-10-01T10:00:00+00:00',
    updated_at: '2026-10-02T10:00:00+00:00',
    attachments: [
      {
        id: 'a1',
        file_name: 'doc.txt',
        mime_type: 'text/plain',
        size_bytes: 5,
        created_at: '2026-10-01T10:00:00+00:00',
      },
    ],
  }

  it('creates a note sending snake_case and returns it mapped', async () => {
    const { notes, server } = setup({
      'POST /notes': () => json({ id: 'n1' }, 201),
      'GET /notes/n1': () => json(NOTE),
    })

    const note = await notes.createNote({
      title: 'Plan',
      content: '# Hi',
      folderId: 'f1',
      pinned: true,
      tags: ['work'],
    })

    expect(server.callsTo('POST /notes')[0].body).toEqual({
      title: 'Plan',
      content: '# Hi',
      folder_id: 'f1',
      pinned: true,
      tags: ['work'],
    })
    expect(note).toEqual({
      id: 'n1',
      title: 'Plan',
      content: '# Hi',
      folderId: 'f1',
      parentNoteId: null,
      childCount: 2,
      pinned: true,
      tags: ['work'],
      createdAt: '2026-10-01T10:00:00+00:00',
      updatedAt: '2026-10-02T10:00:00+00:00',
      path: [
        { type: 'folder', id: 'f0', title: 'Root folder' },
        { type: 'folder', id: 'f1', title: 'Work' },
      ],
      attachments: [
        {
          id: 'a1',
          fileName: 'doc.txt',
          mimeType: 'text/plain',
          sizeBytes: 5,
          createdAt: '2026-10-01T10:00:00+00:00',
        },
      ],
    })
  })

  it('lists notes with query parameters and maps the pagination envelope', async () => {
    const { notes, server } = setup({
      'GET /notes': () =>
        json({
          meta: { page: 2, size: 10, total: 25, last_page: 3 },
          data: [
            {
              id: 'n1',
              title: 'Plan',
              folder_id: null,
              parent_note_id: 'p1',
              child_count: 3,
              pinned: false,
              tags: [],
              created_at: 'c',
              updated_at: 'u',
            },
          ],
        }),
    })

    const page = await notes.listNotes({
      folderId: 'root',
      parentNoteId: 'p1',
      tag: 'work',
      pinned: true,
      orderBy: 'updatedAt',
      orderDirection: 'desc',
      page: 2,
      size: 10,
    })

    const query = Object.fromEntries(server.calls[0].query)
    expect(query).toEqual({
      folder_id: 'root',
      parent_note_id: 'p1',
      tag: 'work',
      pinned: 'true',
      orderBy: 'updated_at',
      orderDirection: 'desc',
      page: '2',
      size: '10',
    })
    expect(page).toEqual({
      items: [
        {
          id: 'n1',
          title: 'Plan',
          folderId: null,
          parentNoteId: 'p1',
          childCount: 3,
          pinned: false,
          tags: [],
          createdAt: 'c',
          updatedAt: 'u',
        },
      ],
      page: 2,
      size: 10,
      total: 25,
      lastPage: 3,
    })
  })

  it('does not send undefined filters', async () => {
    const { notes, server } = setup({
      'GET /notes': () => json({ meta: { page: 1, size: 20, total: 0, last_page: 0 }, data: [] }),
    })

    await notes.listNotes()

    expect([...server.calls[0].query.keys()]).toEqual([])
  })

  it('maps folder contents, giving contained items the folder id', async () => {
    const { notes, server } = setup({
      'GET /folders/contents': () =>
        json({
          folder: {
            id: 'f1',
            name: 'Work',
            parent_folder_id: 'f0',
            path: [{ type: 'folder', id: 'f0', title: 'Top' }],
          },
          subfolders: [{ id: 'f2', name: 'Sub', created_at: 'c' }],
          notes: [
            {
              id: 'n1',
              title: 'T',
              pinned: true,
              tags: ['x'],
              child_count: 4,
              created_at: 'c',
              updated_at: 'u',
            },
          ],
          links: [
            {
              id: 'l1',
              title: 'L',
              url: 'https://a.co',
              note: null,
              tags: [],
              created_at: 'c',
              updated_at: 'u',
            },
          ],
          attachments: [
            {
              id: 'a1',
              file_name: 'a.txt',
              mime_type: 'text/plain',
              size_bytes: 1,
              created_at: 'c',
            },
          ],
        }),
    })

    const contents = await notes.folderContents('f1')

    expect(server.calls[0].query.get('folder_id')).toBe('f1')
    expect(contents.folder).toEqual({
      id: 'f1',
      name: 'Work',
      parentFolderId: 'f0',
      path: [{ type: 'folder', id: 'f0', title: 'Top' }],
    })
    expect(contents.notes[0]).toMatchObject({
      id: 'n1',
      folderId: 'f1',
      parentNoteId: null,
      childCount: 4,
      pinned: true,
    })
    expect(contents.links[0]).toMatchObject({
      id: 'l1',
      folderId: 'f1',
      parentNoteId: null,
      note: null,
    })
    expect(contents.subfolders[0]).toEqual({ id: 'f2', name: 'Sub', createdAt: 'c' })
  })

  it('lists the root level when no folder is given', async () => {
    const { notes, server } = setup({
      'GET /folders/contents': () =>
        json({ folder: null, subfolders: [], notes: [], links: [], attachments: [] }),
    })

    const contents = await notes.folderContents()

    expect(server.calls[0].query.has('folder_id')).toBe(false)
    expect(contents.folder).toBeNull()
  })

  it('creates a note or a link under another note', async () => {
    const { notes, server } = setup({
      'POST /notes': () => json({ id: 'n2' }, 201),
      'GET /notes/n2': () => json({ ...NOTE, id: 'n2', folder_id: null, parent_note_id: 'n1' }),
      'POST /links': () => json({ id: 'l2' }, 201),
      'GET /links/l2': () =>
        json({
          id: 'l2',
          title: 'Docs',
          url: 'https://a.co',
          note: null,
          folder_id: null,
          parent_note_id: 'n1',
          tags: [],
          created_at: 'c',
          updated_at: 'u',
        }),
    })

    const note = await notes.createNote({ title: 'Task', parentNoteId: 'n1' })
    const link = await notes.createLink({ title: 'Docs', url: 'https://a.co', parentNoteId: 'n1' })

    expect(server.callsTo('POST /notes')[0].body).toMatchObject({
      title: 'Task',
      parent_note_id: 'n1',
    })
    expect(server.callsTo('POST /links')[0].body).toMatchObject({ parent_note_id: 'n1' })
    expect(note).toMatchObject({ parentNoteId: 'n1', folderId: null })
    expect(link).toMatchObject({ parentNoteId: 'n1', folderId: null })
  })

  it('lists what is under a note, giving the children their parent', async () => {
    const { notes, server } = setup({
      'GET /notes/n1/children': () =>
        json({
          notes: [
            {
              id: 'n2',
              title: 'B',
              pinned: false,
              tags: [],
              child_count: 2,
              created_at: 'c',
              updated_at: 'u',
            },
          ],
          links: [
            {
              id: 'l1',
              title: 'L',
              url: 'https://a.co',
              note: null,
              tags: [],
              created_at: 'c',
              updated_at: 'u',
            },
          ],
        }),
    })

    const children = await notes.noteChildren('n1')

    expect(server.calls[0].path).toBe('/notes/n1/children')
    expect(children.notes).toEqual([
      {
        id: 'n2',
        title: 'B',
        folderId: null,
        parentNoteId: 'n1',
        childCount: 2,
        pinned: false,
        tags: [],
        createdAt: 'c',
        updatedAt: 'u',
      },
    ])
    expect(children.links[0]).toMatchObject({ id: 'l1', parentNoteId: 'n1', folderId: null })
  })

  it.each([
    ['the root', { type: 'root' }, { folder_id: null, parent_note_id: null }],
    ['a folder', { type: 'folder', id: 'f1' }, { folder_id: 'f1', parent_note_id: null }],
    ['a note', { type: 'note', id: 'n9' }, { folder_id: null, parent_note_id: 'n9' }],
  ] as const)('moves notes and links to %s', async (_name, destination, body) => {
    const { notes, server } = setup({
      'PATCH /notes/n1/move': () => json([]),
      'PATCH /links/l1/move': () => json([]),
    })

    await notes.moveNote('n1', destination)
    await notes.moveLink('l1', destination)

    expect(server.callsTo('PATCH /notes/n1/move')[0].body).toEqual(body)
    expect(server.callsTo('PATCH /links/l1/move')[0].body).toEqual(body)
  })

  it('reports a cycle when moving a note under its own descendant', async () => {
    const { notes } = setup({
      'PATCH /notes/n1/move': () => apiError(422, 'note.cycle_detected'),
    })

    await expect(notes.moveNote('n1', { type: 'note', id: 'n2' })).rejects.toMatchObject({
      status: 422,
      code: 'note.cycle_detected',
    })
  })

  it('creates, renames, moves and deletes folders', async () => {
    const { notes, server } = setup({
      'POST /folders': () => json({ id: 'f9' }, 201),
      'PATCH /folders/f9': () => json([]),
      'PATCH /folders/f9/move': () => json([]),
      'DELETE /folders/f9': () => json([]),
    })

    expect(await notes.createFolder('Ideas', 'f1')).toEqual({
      id: 'f9',
      name: 'Ideas',
      parentFolderId: 'f1',
    })
    await notes.renameFolder('f9', 'Ideas 2')
    await notes.moveFolder('f9', null)
    await notes.deleteFolder('f9')

    expect(server.callsTo('POST /folders')[0].body).toEqual({
      name: 'Ideas',
      parent_folder_id: 'f1',
    })
    expect(server.callsTo('PATCH /folders/f9')[0].body).toEqual({ name: 'Ideas 2' })
    expect(server.callsTo('PATCH /folders/f9/move')[0].body).toEqual({ parent_folder_id: null })
  })

  it('sends partial updates and clears a link note with null', async () => {
    const { notes, server } = setup({
      'PATCH /notes/n1': () => json([]),
      'PATCH /links/l1': () => json([]),
    })

    await notes.updateNote('n1', { tags: [], pinned: false })
    await notes.updateLink('l1', { note: null })

    expect(server.callsTo('PATCH /notes/n1')[0].body).toEqual({ tags: [], pinned: false })
    expect(server.callsTo('PATCH /links/l1')[0].body).toEqual({ note: null })
  })

  it('searches, joining the types, and lists tags', async () => {
    const { notes, server } = setup({
      'GET /search': () =>
        json({
          meta: { page: 1, size: 20, total: 1, last_page: 1 },
          data: [
            {
              type: 'link',
              id: 'l1',
              title: 'Docs',
              snippet: '…docs…',
              folder_id: null,
              tags: ['dev'],
              updated_at: 'u',
              url: 'https://a.co',
            },
          ],
        }),
      'GET /tags': () => json({ data: [{ name: 'work', count: 3 }] }),
    })

    const results = await notes.search({ q: 'docs', types: ['note', 'link'], tag: 'dev' })
    const tags = await notes.listTags()

    expect(Object.fromEntries(server.callsTo('GET /search')[0].query)).toEqual({
      q: 'docs',
      type: 'note,link',
      tag: 'dev',
    })
    expect(results.items[0]).toEqual({
      type: 'link',
      id: 'l1',
      title: 'Docs',
      snippet: '…docs…',
      folderId: null,
      tags: ['dev'],
      updatedAt: 'u',
      url: 'https://a.co',
    })
    expect(tags).toEqual([{ name: 'work', count: 3 }])
  })

  it('maps the trash and routes restore / permanent deletion by kind', async () => {
    const { notes, server } = setup({
      'GET /trash': () =>
        json({
          folders: [{ id: 'f1', name: 'Old', parent_folder_id: null, deleted_at: 'd' }],
          notes: [{ id: 'n1', title: 'N', folder_id: 'f1', deleted_at: 'd' }],
          links: [{ id: 'l1', title: 'L', url: 'https://a.co', folder_id: null, deleted_at: 'd' }],
          attachments: [
            { id: 'a1', file_name: 'a.txt', folder_id: null, note_id: 'n2', deleted_at: 'd' },
          ],
        }),
      'POST /trash/folders/f1/restore': () => json([]),
      'POST /trash/notes/n1/restore': () => json([]),
      'POST /trash/links/l1/restore': () => json([]),
      'POST /trash/attachments/a1/restore': () => json([]),
      'DELETE /trash/links/l1': () => json([]),
      'DELETE /trash': () => json([]),
    })

    const trash = await notes.listTrash()
    await notes.restore('folder', 'f1')
    await notes.restore('note', 'n1')
    await notes.restore('link', 'l1')
    await notes.restore('attachment', 'a1')
    await notes.deletePermanently('link', 'l1')
    await notes.emptyTrash()

    expect(trash.attachments[0]).toEqual({
      id: 'a1',
      fileName: 'a.txt',
      folderId: null,
      noteId: 'n2',
      deletedAt: 'd',
    })
    expect(trash.notes[0]).toMatchObject({ folderId: 'f1' })
    expect(server.calls.filter((c) => c.method === 'POST').map((c) => c.path)).toEqual([
      '/trash/folders/f1/restore',
      '/trash/notes/n1/restore',
      '/trash/links/l1/restore',
      '/trash/attachments/a1/restore',
    ])
  })

  it('downloads an attachment as a Blob', async () => {
    const { notes, server } = setup({
      'GET /attachments/a1/content': () =>
        new Response('file body', { headers: { 'Content-Type': 'text/plain' } }),
    })
    const blob = await notes.downloadAttachment('a1')

    expect(await blob.text()).toBe('file body')
    expect(server.calls[0].path).toBe('/attachments/a1/content')
  })

  it('validates attachments before uploading them', async () => {
    const { notes, server } = setup({})
    const empty = new File([], 'empty.txt')
    const huge = new File(['x'], 'huge.bin')
    Object.defineProperty(huge, 'size', { value: MAX_ATTACHMENT_BYTES + 1 })

    await expect(notes.uploadNoteAttachment('n1', empty)).rejects.toMatchObject({
      code: 'attachment.empty',
      status: 422,
    })
    await expect(notes.uploadFolderAttachment('f1', huge)).rejects.toMatchObject({
      code: 'attachment.too_large',
      params: { max_bytes: MAX_ATTACHMENT_BYTES },
    })
    expect(server.calls).toHaveLength(0)
  })

  it('surfaces backend errors as ApiError with their code', async () => {
    const { notes } = setup({ 'GET /notes/missing': () => apiError(404, 'note.not_found') })

    await expect(notes.getNote('missing')).rejects.toMatchObject({
      status: 404,
      code: 'note.not_found',
    })
  })

  const ATTACHMENT = {
    id: 'a1',
    folder_id: null,
    note_id: 'n1',
    file_name: 'doc.txt',
    mime_type: 'text/plain',
    size_bytes: 5,
    created_at: 'c',
  }

  it('uploads a file to a note and returns its metadata without the location', async () => {
    FakeXhr.instances = []
    const { notes, server, session } = setup({ 'GET /attachments/a1': () => json(ATTACHMENT) })
    session.setTokens({ accessToken: 'tok', refreshToken: 'r' })
    const progress: number[] = []

    const pending = notes.uploadNoteAttachment('n1', file('doc.txt', 'hello'), {
      onProgress: (f) => progress.push(f),
    })
    const xhr = lastXhr()
    xhr.upload.onprogress?.({ lengthComputable: true, loaded: 1, total: 2 })
    xhr.respond(201, { id: 'a1' })
    const attachment = await pending

    expect(xhr.url).toBe('http://api.test/notes/n1/attachments')
    expect(xhr.headers.Authorization).toBe('Bearer tok')
    expect(attachment).toEqual({
      id: 'a1',
      fileName: 'doc.txt',
      mimeType: 'text/plain',
      sizeBytes: 5,
      createdAt: 'c',
    })
    expect(progress).toEqual([0.5, 1])
    expect(server.callsTo('GET /attachments/a1')).toHaveLength(1)
  })

  it('uploads a file to a folder', async () => {
    FakeXhr.instances = []
    const { notes } = setup({
      'GET /attachments/a1': () => json({ ...ATTACHMENT, folder_id: 'f1', note_id: null }),
    })

    const pending = notes.uploadFolderAttachment('f 1', file('doc.txt', 'hello'))
    const xhr = lastXhr()
    xhr.respond(201, { id: 'a1' })

    expect((await pending).fileName).toBe('doc.txt')
    expect(xhr.url).toBe('http://api.test/folders/f%201/attachments')
  })

  it('surfaces upload errors from the server', async () => {
    FakeXhr.instances = []
    const { notes } = setup({})

    const pending = notes.uploadNoteAttachment('n1', file('doc.txt', 'hello'))
    lastXhr().respond(404, { code: 'note.not_found', message: 'x', params: [], status: 404 })

    await expect(pending).rejects.toMatchObject({ status: 404, code: 'note.not_found' })
  })
})
