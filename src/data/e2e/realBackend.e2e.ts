// Smoke test of the real data layer against a running backend. Opt-in: `npm run test:e2e`.
//
// It creates ONE throwaway account (the backend allows only 5 logins per 15 minutes per IP, so the full
// repository contract cannot run here), exercises every endpoint through the HTTP adapter and removes
// everything it created. Needs `docker` to read the activation token from the backend's MySQL container,
// since the activation email is not delivered. Configure with E2E_API_URL, E2E_MYSQL_CONTAINER, E2E_MYSQL_DATABASE and E2E_PHP_CONTAINER.
import { execFileSync } from 'node:child_process'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createHttpRepositories } from '../http/repositories'
import { SessionStore } from '../session'

const API = process.env.E2E_API_URL ?? 'http://localhost'
const MYSQL = process.env.E2E_MYSQL_CONTAINER ?? 'symfony-ddd-core-mysql'
const DATABASE = process.env.E2E_MYSQL_DATABASE ?? 'symfony-ddd-core'
const PHP = process.env.E2E_PHP_CONTAINER ?? 'symfony-ddd-core-api-php'

const email = `e2e-${Date.now()}@example.test`
const password = 'e2e-password-123'
const file = (name: string, content: string, type = 'text/plain') =>
  new File([content], name, { type })
const ids = (items: { id: string }[]) => items.map((i) => i.id)

function sql(statement: string): string {
  return execFileSync(
    'docker',
    ['exec', MYSQL, 'mysql', '-uroot', '-proot', '-N', '-B', DATABASE, '-e', statement],
    {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    },
  ).trim()
}

const session = new SessionStore(null)
const { auth, notes, client } = createHttpRepositories({ baseUrl: API, session })
let userId = ''

beforeAll(async () => {
  await auth.signUp({ email, password, username: 'e2e_user' })
  const token = sql(`SELECT activation_token FROM user WHERE email='${email}'`)
  expect(token).not.toBe('')
  await auth.activate(token)
  const user = await auth.login(email, password)
  userId = user.id
})

afterAll(() => {
  // Cleanup does not depend on the session (a test signs out): it removes the account's rows, its stored
  // files and its tokens straight from the backend's database, then checks nothing is left behind.
  if (!userId) return
  const files = sql(`SELECT storage_key FROM attachment WHERE owner_id='${userId}'`)
    .split('\n')
    .filter(Boolean)
  for (const key of files) {
    execFileSync('docker', ['exec', PHP, 'rm', '-f', `/app/var/storage/attachments/${key}`], {
      stdio: 'ignore',
    })
  }
  for (const table of ['attachment', 'note', 'link', 'folder'])
    sql(`DELETE FROM ${table} WHERE owner_id='${userId}'`)
  sql(`DELETE FROM refresh_tokens WHERE user_id='${userId}'`)
  sql(`DELETE FROM user WHERE id='${userId}'`)

  const left = ['attachment', 'note', 'link', 'folder']
    .map((table) => `(SELECT COUNT(*) FROM ${table} WHERE owner_id='${userId}')`)
    .concat(
      `(SELECT COUNT(*) FROM refresh_tokens WHERE user_id='${userId}')`,
      `(SELECT COUNT(*) FROM user WHERE id='${userId}')`,
    )
    .join(' + ')
  expect(sql(`SELECT ${left}`)).toBe('0')
})

describe('real backend', () => {
  it('knows the signed-in user and updates the profile', async () => {
    expect(await auth.me()).toMatchObject({
      id: userId,
      email,
      username: 'e2e_user',
      locale: 'en',
      active: true,
    })

    expect(await auth.updateProfile({ locale: 'es' })).toMatchObject({ locale: 'es' })
    await expect(auth.updateProfile({ username: 'x' })).rejects.toMatchObject({
      status: 400,
      code: 'validation_error',
    })
  })

  it('transparently renews an expired access token and rotates the refresh token', async () => {
    const before = session.refreshToken
    session.setTokens({ accessToken: 'not-a-valid-jwt', refreshToken: before! })

    const me = await auth.me() // 401 -> PUT /token-renew -> retry

    expect(me.id).toBe(userId)
    expect(session.accessToken).not.toBe('not-a-valid-jwt')
    expect(session.refreshToken).not.toBe(before)
  })

  it('answers 401 without a session', async () => {
    const anonymous = createHttpRepositories({ baseUrl: API, session: new SessionStore(null) })

    await expect(anonymous.notes.listNotes()).rejects.toMatchObject({
      status: 401,
      code: 'security.unauthenticated',
    })
    await expect(anonymous.auth.login(email, 'wrong-password')).rejects.toMatchObject({
      status: 401,
      code: 'security.bad_credentials',
    })
  })

  it('manages folders, notes and links', async () => {
    const folder = await notes.createFolder('Work')
    const sub = await notes.createFolder('Sub', folder.id)
    const note = await notes.createNote({
      title: 'Plan',
      content: '# Hi',
      folderId: folder.id,
      tags: ['Work', ' work ', 'Ideas'],
      pinned: true,
    })
    const link = await notes.createLink({
      title: 'Symfony',
      url: 'https://symfony.com',
      note: 'Docs',
      folderId: folder.id,
      tags: ['dev'],
    })

    expect(note).toMatchObject({
      title: 'Plan',
      content: '# Hi',
      folderId: folder.id,
      pinned: true,
      tags: ['work', 'ideas'],
      attachments: [],
    })
    expect(link).toMatchObject({
      url: 'https://symfony.com',
      note: 'Docs',
      folderId: folder.id,
      tags: ['dev'],
    })

    const contents = await notes.folderContents(folder.id)
    expect(contents.folder).toEqual({ id: folder.id, name: 'Work', parentFolderId: null, path: [] })
    expect(ids(contents.subfolders)).toEqual([sub.id])
    expect(contents.notes[0]).toMatchObject({ id: note.id, folderId: folder.id, pinned: true })
    expect(contents.links[0]).toMatchObject({ id: link.id, folderId: folder.id })

    await notes.updateNote(note.id, { title: 'Plan v2', tags: [] })
    await notes.updateLink(link.id, { note: null })
    await notes.renameFolder(sub.id, 'Sub2')
    await notes.moveFolder(sub.id, null)
    expect(await notes.getNote(note.id)).toMatchObject({ title: 'Plan v2', tags: [] })
    expect((await notes.getLink(link.id)).note).toBeNull()

    const page = await notes.listNotes({
      folderId: folder.id,
      orderBy: 'title',
      orderDirection: 'asc',
    })
    expect(page).toMatchObject({ page: 1, total: 1 })
    expect(ids((await notes.listLinks({ folderId: 'root' })).items)).toEqual([])
    expect((await notes.folderContents()).subfolders.map((f) => f.name).sort()).toEqual([
      'Sub2',
      'Work',
    ])

    await expect(
      notes.createLink({ title: 'x', url: 'javascript:alert(1)' }),
    ).rejects.toMatchObject({ status: 422, code: 'link.invalid_url' })
    await expect(notes.createNote({ title: 'x', tags: [''] })).rejects.toMatchObject({
      status: 422,
      code: 'tag.invalid',
    })
    await expect(notes.getNote('00000000-0000-4000-8000-000000000000')).rejects.toMatchObject({
      status: 404,
      code: 'note.not_found',
    })
  })

  it('uploads, lists, downloads and trashes attachments', async () => {
    const note = await notes.createNote({ title: 'With files' })
    const progress: number[] = []

    const attachment = await notes.uploadNoteAttachment(
      note.id,
      file('hello ñ.txt', 'hello world'),
      { onProgress: (f) => progress.push(f) },
    )

    expect(attachment).toMatchObject({
      fileName: 'hello ñ.txt',
      mimeType: expect.stringContaining('text/plain'),
      sizeBytes: 11,
    })
    expect(progress.at(-1)).toBe(1)
    expect(await notes.getAttachment(attachment.id)).toMatchObject({
      noteId: note.id,
      folderId: null,
    })
    expect(ids((await notes.getNote(note.id)).attachments)).toEqual([attachment.id])
    expect(await (await notes.downloadAttachment(attachment.id)).text()).toBe('hello world')

    const folder = await notes.createFolder('Files')
    const inFolder = await notes.uploadFolderAttachment(folder.id, file('f.txt', 'abc'))
    expect(ids((await notes.folderContents(folder.id)).attachments)).toEqual([inFolder.id])

    await notes.deleteAttachment(attachment.id)
    await expect(notes.downloadAttachment(attachment.id)).rejects.toMatchObject({
      status: 404,
      code: 'attachment.not_found',
    })
    expect((await notes.listTrash()).attachments).toEqual([
      expect.objectContaining({ id: attachment.id, noteId: note.id }),
    ])
    await notes.restore('attachment', attachment.id)
    expect(await (await notes.downloadAttachment(attachment.id)).text()).toBe('hello world')

    await expect(notes.uploadNoteAttachment(note.id, file('empty.txt', ''))).rejects.toMatchObject({
      code: 'attachment.empty',
    })
  })

  it('searches and counts tags', async () => {
    const a = await notes.createNote({
      title: 'Reunión de planificación',
      content: 'presupuesto anual',
      tags: ['plan'],
    })
    const l = await notes.createLink({
      title: 'Presupuesto docs',
      url: 'https://example.org/p',
      tags: ['plan'],
    })

    const byAccent = await notes.search({ q: 'REUNION presupuesto' })
    expect(ids(byAccent.items)).toEqual([a.id])
    expect(byAccent.items[0]).toMatchObject({ type: 'note', title: 'Reunión de planificación' })
    expect(byAccent.items[0].snippet).toContain('presupuesto')

    const both = await notes.search({ q: 'presupuesto', types: ['note', 'link'], tag: 'PLAN' })
    expect(ids(both.items).sort()).toEqual([a.id, l.id].sort())
    expect(
      (await notes.search({ q: 'presupuesto', types: ['link'] })).items.map((i) => i.type),
    ).toEqual(['link'])
    await expect(notes.search({ q: 'a' })).rejects.toMatchObject({
      status: 422,
      code: 'search.query_too_short',
    })

    const tags = await notes.listTags()
    expect(tags.find((t) => t.name === 'plan')).toEqual({ name: 'plan', count: 2 })
  })

  it('moves things to the trash, restores them and removes them for good', async () => {
    const folder = await notes.createFolder('Temp')
    const note = await notes.createNote({ title: 'In temp', folderId: folder.id })
    const link = await notes.createLink({
      title: 'Link in temp',
      url: 'https://a.co',
      folderId: folder.id,
    })
    const attachment = await notes.uploadNoteAttachment(note.id, file('a.txt', 'abc'))

    await notes.deleteFolder(folder.id)
    const trash = await notes.listTrash()
    expect(ids(trash.folders)).toContain(folder.id)
    expect(ids(trash.notes)).toContain(note.id)
    expect(ids(trash.links)).toContain(link.id)
    expect(ids(trash.attachments)).not.toContain(attachment.id) // travels with its note
    await expect(notes.restore('link', link.id)).rejects.toMatchObject({
      status: 409,
      code: 'notes.parent_folder_in_trash',
    })

    await notes.restore('folder', folder.id)
    expect((await notes.getNote(note.id)).attachments).toHaveLength(1)
    await expect(notes.deletePermanently('note', note.id)).rejects.toMatchObject({
      status: 409,
      code: 'notes.not_in_trash',
    })

    await notes.deleteFolder(folder.id)
    await notes.deletePermanently('folder', folder.id)
    await expect(notes.getLink(link.id)).rejects.toMatchObject({
      status: 404,
      code: 'link.not_found',
    })
    await expect(notes.getAttachment(attachment.id)).rejects.toMatchObject({
      status: 404,
      code: 'attachment.not_found',
    })
  })

  it('nests notes and links under notes, with paths, moves, cycles and the trash', async () => {
    const folder = await notes.createFolder('Tree root')
    const top = await notes.createNote({ title: 'Top', folderId: folder.id })
    const middle = await notes.createNote({ title: 'Middle', parentNoteId: top.id })
    const leaf = await notes.createNote({ title: 'Leaf', parentNoteId: middle.id })
    const link = await notes.createLink({
      title: 'Docs',
      url: 'https://a.co',
      parentNoteId: middle.id,
    })

    expect(leaf).toMatchObject({ parentNoteId: middle.id, folderId: null, childCount: 0 })
    expect(leaf.path).toEqual([
      { type: 'folder', id: folder.id, title: 'Tree root' },
      { type: 'note', id: top.id, title: 'Top' },
      { type: 'note', id: middle.id, title: 'Middle' },
    ])
    const children = await notes.noteChildren(middle.id)
    expect(ids(children.notes)).toEqual([leaf.id])
    expect(ids(children.links)).toEqual([link.id])
    expect((await notes.getNote(top.id)).childCount).toBe(1)
    expect(ids((await notes.folderContents(folder.id)).notes)).toEqual([top.id]) // nested ones are not listed
    expect(ids((await notes.listNotes({ parentNoteId: middle.id })).items)).toEqual([leaf.id])

    await expect(notes.moveNote(top.id, { type: 'note', id: leaf.id })).rejects.toMatchObject({
      status: 422,
      code: 'note.cycle_detected',
    })
    await expect(
      notes.createNote({ title: 'x', parentNoteId: top.id, folderId: folder.id }),
    ).rejects.toMatchObject({
      status: 422,
      code: 'notes.invalid_location',
    })
    await notes.moveNote(leaf.id, { type: 'root' })
    expect((await notes.getNote(leaf.id)).path).toEqual([])
    await notes.moveNote(leaf.id, { type: 'note', id: top.id })

    await notes.deleteNote(top.id)
    expect(ids((await notes.listTrash()).notes)).toContain(top.id)
    expect(ids((await notes.listTrash()).notes)).not.toContain(leaf.id) // it travels with its ancestor
    await expect(notes.restore('note', leaf.id)).rejects.toMatchObject({
      status: 409,
      code: 'notes.parent_note_in_trash',
    })
    await notes.restore('note', top.id)
    expect(ids((await notes.noteChildren(top.id)).notes).sort()).toEqual(
      [leaf.id, middle.id].sort(),
    )

    await notes.deleteNote(top.id)
    await notes.deletePermanently('note', top.id)
    await expect(notes.getNote(leaf.id)).rejects.toMatchObject({
      status: 404,
      code: 'note.not_found',
    })
    await expect(notes.getLink(link.id)).rejects.toMatchObject({
      status: 404,
      code: 'link.not_found',
    })
  })

  it('restores the session from the stored refresh token', async () => {
    const reloaded = createHttpRepositories({
      baseUrl: API,
      session: new SessionStore({
        getItem: () => session.refreshToken,
        setItem: () => {},
        removeItem: () => {},
      }),
    })

    const user = await reloaded.auth.restoreSession()

    expect(user?.id).toBe(userId)
  })

  it('logs out, revoking the refresh token', async () => {
    const stale = session.refreshToken!
    await auth.logout()

    expect(session.hasSession).toBe(false)
    const result = await client.renew()
    expect(result).toBe(false)
    // The revoked token no longer works on its own either.
    const probe = new SessionStore(null)
    probe.setTokens({ accessToken: 'x', refreshToken: stale })
    const other = createHttpRepositories({ baseUrl: API, session: probe })
    expect(await other.auth.restoreSession()).toBeNull()
  })
})
