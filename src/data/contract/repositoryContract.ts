import { describe, expect, it } from 'vitest'
import type { AuthRepository, NotesRepository } from '../repositories'
import { MAX_ATTACHMENT_BYTES, type ID } from '../types'

export interface ContractSubject {
  auth: AuthRepository
  notes: NotesRepository
  /** Registers, activates and logs in a brand-new user, leaving the session on it. */
  signInNewUser: () => Promise<{ email: string; password: string }>
  /** Signs the current user out and signs in as someone else. */
  switchTo: (account: { email: string; password: string }) => Promise<void>
}

const file = (name: string, content: string, type = 'text/plain') =>
  new File([content], name, { type })
const ids = (items: { id: ID }[]) => items.map((i) => i.id)
const rejects = (promise: Promise<unknown>, expected: { status?: number; code: string }) =>
  expect(promise).rejects.toMatchObject(expected)

/**
 * Behaviour every implementation of the data layer must share (the mock today; it is written so it can also
 * be pointed at the real backend). It mirrors the backend's acceptance tests.
 */
export function describeRepositoryContract(name: string, create: () => Promise<ContractSubject>) {
  describe(`${name} repository contract`, () => {
    describe('auth', () => {
      it('requires activation before login and rejects wrong credentials', async () => {
        const { auth } = await create()
        await auth.signUp({ email: 'ada@example.com', password: 'secret123' })

        await rejects(auth.login('ada@example.com', 'secret123'), {
          status: 403,
          code: 'security.inactive_user',
        })
        await rejects(auth.login('ada@example.com', 'wrong-password'), {
          status: 401,
          code: 'security.bad_credentials',
        })
        await rejects(auth.login('nobody@example.com', 'secret123'), {
          status: 401,
          code: 'security.bad_credentials',
        })
      })

      it('rejects duplicate emails and invalid sign-ups', async () => {
        const { auth } = await create()
        await auth.signUp({ email: 'ada@example.com', password: 'secret123' })

        await rejects(auth.signUp({ email: 'ada@example.com', password: 'secret123' }), {
          status: 409,
          code: 'user.email_already_exists',
        })
        await rejects(auth.signUp({ email: 'not-an-email', password: 'short' }), {
          status: 400,
          code: 'validation_error',
        })
      })

      it('logs in, exposes the profile, updates it and logs out', async () => {
        const { auth, signInNewUser } = await create()
        const account = await signInNewUser()

        const me = await auth.me()
        expect(me).toMatchObject({ email: account.email, locale: 'en', active: true })

        const updated = await auth.updateProfile({ locale: 'es', username: 'nuevo_nombre' })
        expect(updated).toMatchObject({ locale: 'es', username: 'nuevo_nombre' })
        await rejects(auth.updateProfile({ username: 'x' }), {
          status: 400,
          code: 'validation_error',
        })

        await auth.logout()
        await rejects(auth.me(), { status: 401, code: 'security.unauthenticated' })
      })

      it('restores the session from the stored credentials', async () => {
        const { auth, signInNewUser } = await create()
        const account = await signInNewUser()

        const restored = await auth.restoreSession()

        expect(restored?.email).toBe(account.email)
      })
    })

    describe('notes', () => {
      it('creates, reads, updates and moves a note', async () => {
        const { notes, signInNewUser } = await create()
        await signInNewUser()
        const folder = await notes.createFolder('Work')

        const created = await notes.createNote({
          title: 'Plan',
          content: '# Hi',
          tags: ['Work', ' work ', 'Ideas'],
          pinned: true,
        })
        expect(created).toMatchObject({
          title: 'Plan',
          content: '# Hi',
          tags: ['work', 'ideas'],
          pinned: true,
          folderId: null,
          attachments: [],
        })

        await notes.updateNote(created.id, {
          title: 'Plan v2',
          content: 'new',
          tags: ['x'],
          pinned: false,
        })
        await notes.moveNote(created.id, { type: 'folder', id: folder.id })
        const read = await notes.getNote(created.id)
        expect(read).toMatchObject({
          title: 'Plan v2',
          content: 'new',
          tags: ['x'],
          pinned: false,
          folderId: folder.id,
        })
        expect(read.updatedAt >= created.updatedAt).toBe(true)

        await rejects(
          notes.moveNote(created.id, {
            type: 'folder',
            id: '00000000-0000-4000-8000-000000000000',
          }),
          {
            status: 422,
            code: 'folder.not_found',
          },
        )
        await rejects(notes.getNote('00000000-0000-4000-8000-000000000000'), {
          status: 404,
          code: 'note.not_found',
        })
      })

      it('validates notes', async () => {
        const { notes, signInNewUser } = await create()
        await signInNewUser()

        await rejects(notes.createNote({ title: '' }), { status: 400, code: 'validation_error' })
        await rejects(notes.createNote({ title: 'x', tags: [''] }), {
          status: 422,
          code: 'tag.invalid',
        })
        await rejects(
          notes.createNote({ title: 'x', tags: Array.from({ length: 21 }, (_, i) => `t${i}`) }),
          { status: 422, code: 'tag.invalid' },
        )
        await rejects(
          notes.createNote({ title: 'x', folderId: '00000000-0000-4000-8000-000000000000' }),
          { status: 422, code: 'folder.not_found' },
        )
      })

      it('lists notes with pagination, ordering and filters, excluding trashed ones', async () => {
        const { notes, signInNewUser } = await create()
        await signInNewUser()
        const folder = await notes.createFolder('F')
        const inFolder = await notes.createNote({
          title: 'in folder',
          folderId: folder.id,
          tags: ['work'],
        })
        const atRoot = await notes.createNote({
          title: 'at root',
          tags: ['work', 'home'],
          pinned: true,
        })
        const other = await notes.createNote({ title: 'other' })
        const gone = await notes.createNote({ title: 'gone' })
        await notes.deleteNote(gone.id)

        const idsOf = async (params: Parameters<NotesRepository['listNotes']>[0]) =>
          ids((await notes.listNotes(params)).items)

        expect(await idsOf({ folderId: folder.id })).toEqual([inFolder.id])
        expect((await idsOf({ folderId: 'root' })).sort()).toEqual([atRoot.id, other.id].sort())
        expect((await idsOf({ tag: ' WORK ' })).sort()).toEqual([inFolder.id, atRoot.id].sort())
        expect(await idsOf({ pinned: true })).toEqual([atRoot.id])
        expect(await idsOf({ tag: 'work', pinned: true, folderId: 'root' })).toEqual([atRoot.id])
        expect(await idsOf({ tag: 'missing' })).toEqual([])

        const p1 = await notes.listNotes({ size: 2, orderBy: 'title', orderDirection: 'asc' })
        expect(p1).toMatchObject({ page: 1, size: 2, total: 3, lastPage: 2 })
        expect(p1.items.map((n) => n.title)).toEqual(['at root', 'in folder'])
        expect(
          (
            await notes.listNotes({ size: 2, page: 2, orderBy: 'title', orderDirection: 'asc' })
          ).items.map((n) => n.title),
        ).toEqual(['other'])
        expect((await notes.listNotes({ size: 1000 })).size).toBe(100)
        await rejects(notes.listNotes({ page: 0 }), { status: 400, code: 'validation_error' })
      })
    })

    describe('links', () => {
      it('creates, reads, updates, moves and lists links', async () => {
        const { notes, signInNewUser } = await create()
        await signInNewUser()
        const folder = await notes.createFolder('Reading')

        const link = await notes.createLink({
          title: 'Symfony',
          url: 'https://symfony.com',
          note: 'Docs',
          tags: ['Dev', 'PHP'],
        })
        expect(link).toMatchObject({
          title: 'Symfony',
          url: 'https://symfony.com',
          note: 'Docs',
          tags: ['dev', 'php'],
          folderId: null,
        })

        await notes.updateLink(link.id, { title: 'Symfony docs', note: null, tags: ['x'] })
        await notes.moveLink(link.id, { type: 'folder', id: folder.id })
        expect(await notes.getLink(link.id)).toMatchObject({
          title: 'Symfony docs',
          note: null,
          tags: ['x'],
          folderId: folder.id,
        })

        const page = await notes.listLinks({ folderId: folder.id })
        expect(ids(page.items)).toEqual([link.id])
        expect((await notes.listLinks({ folderId: 'root' })).items).toEqual([])
      })

      it('says where a link sits', async () => {
        const { notes, signInNewUser } = await create()
        await signInNewUser()
        const outer = await notes.createFolder('Outer')
        const inner = await notes.createFolder('Inner', outer.id)
        const project = await notes.createNote({ title: 'Project', folderId: inner.id })
        const task = await notes.createNote({ title: 'Task', parentNoteId: project.id })

        const atRoot = await notes.createLink({ title: 'Root', url: 'https://a.co' })
        const inFolder = await notes.createLink({
          title: 'F',
          url: 'https://a.co',
          folderId: inner.id,
        })
        const underNote = await notes.createLink({
          title: 'N',
          url: 'https://a.co',
          parentNoteId: task.id,
        })

        expect(atRoot.path).toEqual([])
        expect((await notes.getLink(inFolder.id)).path.map((p) => p.title)).toEqual([
          'Outer',
          'Inner',
        ])
        expect((await notes.getLink(underNote.id)).path).toEqual([
          { type: 'folder', id: outer.id, title: 'Outer' },
          { type: 'folder', id: inner.id, title: 'Inner' },
          { type: 'note', id: project.id, title: 'Project' },
          { type: 'note', id: task.id, title: 'Task' },
        ])
      })

      it('only accepts absolute http(s) URLs', async () => {
        const { notes, signInNewUser } = await create()
        await signInNewUser()

        for (const url of [
          'javascript:alert(1)',
          'data:text/html;base64,AAAA',
          'ftp://example.com',
          'example.com',
          'https://',
          'file:///etc/passwd',
        ]) {
          await rejects(notes.createLink({ title: 'x', url }), {
            status: 422,
            code: 'link.invalid_url',
          })
        }
        const link = await notes.createLink({ title: 'ok', url: 'https://example.com' })
        await rejects(notes.updateLink(link.id, { url: 'javascript:alert(1)' }), {
          status: 422,
          code: 'link.invalid_url',
        })
      })
    })

    describe('folders', () => {
      it('lists the contents of the root and of a folder', async () => {
        const { notes, signInNewUser } = await create()
        await signInNewUser()
        const parent = await notes.createFolder('Parent')
        const child = await notes.createFolder('Child', parent.id)
        const note = await notes.createNote({ title: 'In parent', folderId: parent.id })
        const link = await notes.createLink({
          title: 'Link',
          url: 'https://a.co',
          folderId: parent.id,
        })
        await notes.uploadFolderAttachment(parent.id, file('a.txt', 'abc'))

        const root = await notes.folderContents()
        expect(root.folder).toBeNull()
        expect(ids(root.subfolders)).toEqual([parent.id])
        expect(root.attachments).toEqual([])

        const contents = await notes.folderContents(parent.id)
        expect(contents.folder).toEqual({
          id: parent.id,
          name: 'Parent',
          parentFolderId: null,
          path: [],
        })
        expect(ids(contents.subfolders)).toEqual([child.id])
        expect(ids(contents.notes)).toEqual([note.id])
        expect(contents.notes[0].folderId).toBe(parent.id)
        expect(ids(contents.links)).toEqual([link.id])
        expect(contents.attachments).toHaveLength(1)

        await rejects(notes.folderContents('00000000-0000-4000-8000-000000000000'), {
          status: 404,
          code: 'folder.not_found',
        })
      })

      it('renames and moves folders, refusing cycles', async () => {
        const { notes, signInNewUser } = await create()
        await signInNewUser()
        const a = await notes.createFolder('A')
        const b = await notes.createFolder('B', a.id)
        const c = await notes.createFolder('C', b.id)

        await notes.renameFolder(c.id, 'C2')
        await notes.moveFolder(c.id, a.id)
        expect((await notes.folderContents(a.id)).subfolders.map((f) => f.name).sort()).toEqual([
          'B',
          'C2',
        ])

        await rejects(notes.moveFolder(a.id, b.id), { status: 422, code: 'folder.cycle_detected' })
        await rejects(notes.moveFolder(a.id, a.id), { status: 422, code: 'folder.cycle_detected' })
        await rejects(notes.createFolder('x', '00000000-0000-4000-8000-000000000000'), {
          status: 422,
          code: 'folder.not_found',
        })
      })
    })

    describe('attachments', () => {
      it('attaches files to a note, with progress, and downloads them', async () => {
        const { notes, signInNewUser } = await create()
        await signInNewUser()
        const note = await notes.createNote({ title: 'With file' })
        const progress: number[] = []

        const attachment = await notes.uploadNoteAttachment(
          note.id,
          file('doc.txt', 'hello world'),
          { onProgress: (f) => progress.push(f) },
        )

        expect(attachment).toMatchObject({
          fileName: 'doc.txt',
          mimeType: 'text/plain',
          sizeBytes: 11,
        })
        expect(progress.at(-1)).toBe(1)
        expect(await notes.getAttachment(attachment.id)).toMatchObject({
          noteId: note.id,
          folderId: null,
        })
        expect(ids((await notes.getNote(note.id)).attachments)).toEqual([attachment.id])
        expect(await (await notes.downloadAttachment(attachment.id)).text()).toBe('hello world')
      })

      it('rejects empty and oversized files and unknown targets', async () => {
        const { notes, signInNewUser } = await create()
        await signInNewUser()
        const note = await notes.createNote({ title: 'x' })
        const huge = file('huge.bin', 'x')
        Object.defineProperty(huge, 'size', { value: MAX_ATTACHMENT_BYTES + 1 })

        await rejects(notes.uploadNoteAttachment(note.id, file('empty.txt', '')), {
          status: 422,
          code: 'attachment.empty',
        })
        await rejects(notes.uploadNoteAttachment(note.id, huge), {
          status: 422,
          code: 'attachment.too_large',
        })
        await rejects(
          notes.uploadNoteAttachment('00000000-0000-4000-8000-000000000000', file('a.txt', 'a')),
          { status: 404, code: 'note.not_found' },
        )
        await rejects(
          notes.uploadFolderAttachment('00000000-0000-4000-8000-000000000000', file('a.txt', 'a')),
          { status: 404, code: 'folder.not_found' },
        )
      })

      it('does not serve an attachment that is in the trash', async () => {
        const { notes, signInNewUser } = await create()
        await signInNewUser()
        const note = await notes.createNote({ title: 'x' })
        const attachment = await notes.uploadNoteAttachment(note.id, file('a.txt', 'a'))

        await notes.deleteAttachment(attachment.id)

        await rejects(notes.downloadAttachment(attachment.id), {
          status: 404,
          code: 'attachment.not_found',
        })
        expect((await notes.getNote(note.id)).attachments).toEqual([])
      })
    })

    describe('search and tags', () => {
      it('finds notes and links by title, content, note and URL, ranking title matches first', async () => {
        const { notes, signInNewUser } = await create()
        await signInNewUser()
        const byTitle = await notes.createNote({ title: 'Quarterly roadmap', content: 'nothing' })
        const byContent = await notes.createNote({
          title: 'Meeting',
          content: 'We discussed the roadmap for next year',
        })
        await notes.createNote({ title: 'Unrelated', content: 'groceries' })
        const link = await notes.createLink({
          title: 'x',
          url: 'https://roadmap.example.org/a',
          note: 'about it',
        })

        const result = await notes.search({ q: 'roadmap' })

        expect(result.total).toBe(3)
        expect(result.items[0].id).toBe(byTitle.id)
        expect(ids(result.items).sort()).toEqual([byTitle.id, byContent.id, link.id].sort())
        expect(result.items.find((i) => i.id === link.id)).toMatchObject({
          type: 'link',
          url: 'https://roadmap.example.org/a',
        })
      })

      it('is case and accent insensitive, needs every term, and finds short words and stopwords', async () => {
        const { notes, signInNewUser } = await create()
        await signInNewUser()
        const both = await notes.createNote({
          title: 'Reunión de planificación',
          content: 'presupuesto anual',
        })
        await notes.createNote({ title: 'Reunión', content: 'otra cosa' })
        const todo = await notes.createNote({ title: 'To do', content: 'buy the milk' })

        expect(ids((await notes.search({ q: 'REUNION presupuesto' })).items)).toEqual([both.id])
        expect(ids((await notes.search({ q: 'planificacion' })).items)).toEqual([both.id])
        expect(ids((await notes.search({ q: 'the milk' })).items)).toEqual([todo.id])
        expect(ids((await notes.search({ q: 'to' })).items)).toContain(todo.id)
      })

      it('treats wildcard characters literally and builds a snippet around the match', async () => {
        const { notes, signInNewUser } = await create()
        await signInNewUser()
        const percent = await notes.createNote({ title: 'Discount 50% off' })
        await notes.createNote({ title: 'Discount 500 off' })
        const long = await notes.createNote({
          title: 'Long',
          content: `${'lorem ipsum '.repeat(20)}special\n\nkeyword ${'dolor '.repeat(40)}`,
        })

        expect(ids((await notes.search({ q: '50%' })).items)).toEqual([percent.id])
        expect((await notes.search({ q: '%%' })).items).toEqual([])
        const snippet = (await notes.search({ q: 'keyword' })).items.find(
          (i) => i.id === long.id,
        )!.snippet
        expect(snippet).toContain('special keyword')
        expect(snippet.startsWith('…') && snippet.endsWith('…')).toBe(true)
        expect(snippet).not.toContain('\n')
      })

      it('filters by type and tag, excludes trashed items and validates the query', async () => {
        const { notes, signInNewUser } = await create()
        await signInNewUser()
        const note = await notes.createNote({ title: 'alpha note', tags: ['t1'] })
        const link = await notes.createLink({
          title: 'alpha link',
          url: 'https://a.co',
          tags: ['t1'],
        })
        await notes.createNote({ title: 'alpha untagged' })
        const gone = await notes.createNote({ title: 'alpha trashed', tags: ['t1'] })
        await notes.deleteNote(gone.id)

        expect(ids((await notes.search({ q: 'alpha', tag: 'T1' })).items).sort()).toEqual(
          [note.id, link.id].sort(),
        )
        expect(ids((await notes.search({ q: 'alpha', types: ['note'], tag: 't1' })).items)).toEqual(
          [note.id],
        )
        expect(ids((await notes.search({ q: 'alpha', types: ['link'] })).items)).toEqual([link.id])
        await rejects(notes.search({ q: 'a' }), { status: 422, code: 'search.query_too_short' })
        await rejects(notes.search({ q: '   ' }), { status: 422, code: 'search.query_too_short' })
      })

      it('counts tags across live notes and links, most used first', async () => {
        const { notes, signInNewUser } = await create()
        await signInNewUser()
        await notes.createNote({ title: 'a', tags: ['work', 'home'] })
        await notes.createNote({ title: 'b', tags: ['work'] })
        await notes.createLink({ title: 'c', url: 'https://a.co', tags: ['work', 'dev'] })
        const trashed = await notes.createNote({ title: 'd', tags: ['trashed-only', 'home'] })
        await notes.deleteNote(trashed.id)

        expect(await notes.listTags()).toEqual([
          { name: 'work', count: 3 },
          { name: 'dev', count: 1 },
          { name: 'home', count: 1 },
        ])
      })
    })

    describe('trash', () => {
      it('moves notes and links to the trash, restores them and deletes them for good', async () => {
        const { notes, signInNewUser } = await create()
        await signInNewUser()
        const note = await notes.createNote({ title: 'N' })
        const link = await notes.createLink({ title: 'L', url: 'https://a.co' })

        await notes.deleteNote(note.id)
        await notes.deleteLink(link.id)
        expect((await notes.listNotes()).items).toEqual([])
        const trash = await notes.listTrash()
        expect(ids(trash.notes)).toEqual([note.id])
        expect(ids(trash.links)).toEqual([link.id])

        await notes.restore('note', note.id)
        await notes.restore('link', link.id)
        expect(ids((await notes.listNotes()).items)).toEqual([note.id])
        expect(ids((await notes.listLinks()).items)).toEqual([link.id])

        await rejects(notes.deletePermanently('note', note.id), {
          status: 409,
          code: 'notes.not_in_trash',
        })
        await rejects(notes.restore('link', link.id), { status: 409, code: 'notes.not_in_trash' })

        await notes.deleteNote(note.id)
        await notes.deletePermanently('note', note.id)
        await rejects(notes.getNote(note.id), { status: 404, code: 'note.not_found' })
      })

      it('carries note attachments with the note, and hides them from the trash listing', async () => {
        const { notes, signInNewUser } = await create()
        await signInNewUser()
        const note = await notes.createNote({ title: 'N' })
        const attachment = await notes.uploadNoteAttachment(note.id, file('a.txt', 'abc'))

        await notes.deleteNote(note.id)
        const trash = await notes.listTrash()
        expect(ids(trash.notes)).toEqual([note.id])
        expect(trash.attachments).toEqual([])
        await rejects(notes.downloadAttachment(attachment.id), {
          status: 404,
          code: 'attachment.not_found',
        })
        await rejects(notes.restore('attachment', attachment.id), {
          status: 409,
          code: 'notes.parent_note_in_trash',
        })

        await notes.restore('note', note.id)
        expect(ids((await notes.getNote(note.id)).attachments)).toEqual([attachment.id])

        await notes.deleteNote(note.id)
        await notes.deletePermanently('note', note.id)
        await rejects(notes.getAttachment(attachment.id), {
          status: 404,
          code: 'attachment.not_found',
        })
      })

      it('lists and restores an attachment trashed on its own', async () => {
        const { notes, signInNewUser } = await create()
        await signInNewUser()
        const note = await notes.createNote({ title: 'N' })
        const attachment = await notes.uploadNoteAttachment(note.id, file('a.txt', 'abc'))
        await notes.deleteAttachment(attachment.id)

        const trash = await notes.listTrash()
        expect(trash.attachments).toEqual([
          expect.objectContaining({ id: attachment.id, noteId: note.id }),
        ])

        await notes.restore('attachment', attachment.id)
        expect(ids((await notes.getNote(note.id)).attachments)).toEqual([attachment.id])
      })

      it('trashes a folder with everything inside, restores it, and empties the trash', async () => {
        const { notes, signInNewUser } = await create()
        await signInNewUser()
        const folder = await notes.createFolder('Docs')
        const sub = await notes.createFolder('Sub', folder.id)
        const note = await notes.createNote({ title: 'Inside', folderId: sub.id })
        const link = await notes.createLink({
          title: 'Link',
          url: 'https://a.co',
          folderId: folder.id,
        })
        const attachment = await notes.uploadNoteAttachment(note.id, file('a.txt', 'abc'))

        await notes.deleteFolder(folder.id)
        expect((await notes.folderContents()).subfolders).toEqual([])
        expect((await notes.listLinks()).items).toEqual([])
        await rejects(notes.restore('link', link.id), {
          status: 409,
          code: 'notes.parent_folder_in_trash',
        })

        await notes.restore('folder', folder.id)
        expect(ids((await notes.folderContents(folder.id)).links)).toEqual([link.id])
        expect(ids((await notes.getNote(note.id)).attachments)).toEqual([attachment.id])

        await notes.deleteFolder(folder.id)
        await notes.emptyTrash()
        expect(await notes.listTrash()).toEqual({
          folders: [],
          notes: [],
          links: [],
          attachments: [],
        })
        await rejects(notes.getLink(link.id), { status: 404, code: 'link.not_found' })
        await rejects(notes.getAttachment(attachment.id), {
          status: 404,
          code: 'attachment.not_found',
        })
      })
    })

    describe('tree: notes under notes', () => {
      const MISSING = '00000000-0000-4000-8000-000000000000'

      it('creates a note under another note and describes where it sits', async () => {
        const { notes, signInNewUser } = await create()
        await signInNewUser()
        const parent = await notes.createNote({ title: 'Project' })

        const child = await notes.createNote({ title: 'Task', parentNoteId: parent.id })

        expect(child).toMatchObject({ parentNoteId: parent.id, folderId: null, childCount: 0 })
        expect(child.path).toEqual([{ type: 'note', id: parent.id, title: 'Project' }])
        const reloaded = await notes.getNote(parent.id)
        expect(reloaded.childCount).toBe(1)
        expect(reloaded.path).toEqual([])
      })

      it('lists the children of a note ordered by title, each with its own child count', async () => {
        const { notes, signInNewUser } = await create()
        await signInNewUser()
        const parent = await notes.createNote({ title: 'Project' })
        const withKids = await notes.createNote({ title: 'B with kids', parentNoteId: parent.id })
        const leaf = await notes.createNote({ title: 'A leaf', parentNoteId: parent.id })
        await notes.createNote({ title: 'grandchild', parentNoteId: withKids.id })
        await notes.createLink({
          title: 'grandlink',
          url: 'https://a.co',
          parentNoteId: withKids.id,
        })
        const link = await notes.createLink({
          title: 'Docs',
          url: 'https://a.co',
          parentNoteId: parent.id,
        })

        const children = await notes.noteChildren(parent.id)

        expect(ids(children.notes)).toEqual([leaf.id, withKids.id])
        expect(children.notes.map((n) => n.childCount)).toEqual([0, 2])
        expect(children.notes.every((n) => n.parentNoteId === parent.id)).toBe(true)
        expect(ids(children.links)).toEqual([link.id])
        expect(children.links[0].parentNoteId).toBe(parent.id)
      })

      it('keeps nested items out of the root, but lists them when asked for their parent', async () => {
        const { notes, signInNewUser } = await create()
        await signInNewUser()
        const top = await notes.createNote({ title: 'Top' })
        const nested = await notes.createNote({ title: 'Nested', parentNoteId: top.id })
        const nestedLink = await notes.createLink({
          title: 'Nested link',
          url: 'https://a.co',
          parentNoteId: top.id,
        })
        const rootLink = await notes.createLink({ title: 'Root link', url: 'https://a.co' })

        const root = await notes.folderContents()
        expect(ids(root.notes)).toEqual([top.id])
        expect(root.notes[0].childCount).toBe(2)
        expect(ids(root.links)).toEqual([rootLink.id])
        expect(ids((await notes.listNotes({ folderId: 'root' })).items)).toEqual([top.id])
        expect(ids((await notes.listLinks({ folderId: 'root' })).items)).toEqual([rootLink.id])
        expect(ids((await notes.listNotes()).items).sort()).toEqual([top.id, nested.id].sort())
        expect(ids((await notes.listNotes({ parentNoteId: top.id })).items)).toEqual([nested.id])
        expect(ids((await notes.listLinks({ parentNoteId: top.id })).items)).toEqual([
          nestedLink.id,
        ])
      })

      it('checks the place an item is put in', async () => {
        const { notes, signInNewUser } = await create()
        await signInNewUser()
        const folder = await notes.createFolder('F')
        const parent = await notes.createNote({ title: 'P' })

        await rejects(
          notes.createNote({ title: 'x', folderId: folder.id, parentNoteId: parent.id }),
          { status: 422, code: 'notes.invalid_location' },
        )
        await rejects(
          notes.createLink({
            title: 'x',
            url: 'https://a.co',
            folderId: folder.id,
            parentNoteId: parent.id,
          }),
          { status: 422, code: 'notes.invalid_location' },
        )
        await rejects(notes.createNote({ title: 'x', parentNoteId: MISSING }), {
          status: 422,
          code: 'note.parent_not_found',
        })
        await rejects(
          notes.createLink({ title: 'x', url: 'https://a.co', parentNoteId: MISSING }),
          { status: 422, code: 'note.parent_not_found' },
        )
        const trashed = await notes.createNote({ title: 'T' })
        await notes.deleteNote(trashed.id)
        await rejects(notes.createNote({ title: 'x', parentNoteId: trashed.id }), {
          status: 422,
          code: 'note.parent_not_found',
        })
      })

      it('moves notes and links between folders, notes and the root', async () => {
        const { notes, signInNewUser } = await create()
        await signInNewUser()
        const folder = await notes.createFolder('F')
        const a = await notes.createNote({ title: 'A' })
        const b = await notes.createNote({ title: 'B', folderId: folder.id })
        const link = await notes.createLink({ title: 'L', url: 'https://a.co' })

        await notes.moveNote(b.id, { type: 'note', id: a.id })
        expect(await notes.getNote(b.id)).toMatchObject({ parentNoteId: a.id, folderId: null })
        expect((await notes.folderContents(folder.id)).notes).toEqual([])
        await notes.moveLink(link.id, { type: 'note', id: a.id })
        expect((await notes.getLink(link.id)).parentNoteId).toBe(a.id)

        await notes.moveNote(b.id, { type: 'folder', id: folder.id })
        expect(await notes.getNote(b.id)).toMatchObject({ parentNoteId: null, folderId: folder.id })

        await notes.moveNote(b.id, { type: 'root' })
        await notes.moveLink(link.id, { type: 'root' })
        expect(ids((await notes.folderContents()).notes).sort()).toEqual([a.id, b.id].sort())
        expect(ids((await notes.folderContents()).links)).toEqual([link.id])

        await rejects(notes.moveNote(b.id, { type: 'note', id: MISSING }), {
          status: 422,
          code: 'note.parent_not_found',
        })
        await rejects(notes.moveLink(link.id, { type: 'note', id: MISSING }), {
          status: 422,
          code: 'note.parent_not_found',
        })
      })

      it('refuses to put a note under itself or under one of its descendants', async () => {
        const { notes, signInNewUser } = await create()
        await signInNewUser()
        const a = await notes.createNote({ title: 'A' })
        const b = await notes.createNote({ title: 'B', parentNoteId: a.id })
        const c = await notes.createNote({ title: 'C', parentNoteId: b.id })

        for (const target of [a, b, c]) {
          await rejects(notes.moveNote(a.id, { type: 'note', id: target.id }), {
            status: 422,
            code: 'note.cycle_detected',
          })
        }
        await rejects(notes.moveNote(b.id, { type: 'note', id: c.id }), {
          status: 422,
          code: 'note.cycle_detected',
        })
        expect((await notes.getNote(a.id)).parentNoteId).toBeNull()

        const d = await notes.createNote({ title: 'D' })
        await notes.moveNote(b.id, { type: 'note', id: d.id })
        expect((await notes.getNote(c.id)).path.map((p) => p.title)).toEqual(['D', 'B'])
      })

      it('gives the way from the root: folders first, then notes', async () => {
        const { notes, signInNewUser } = await create()
        await signInNewUser()
        const outer = await notes.createFolder('Outer')
        const inner = await notes.createFolder('Inner', outer.id)
        const top = await notes.createNote({ title: 'Top', folderId: inner.id })
        const middle = await notes.createNote({ title: 'Middle', parentNoteId: top.id })
        const leaf = await notes.createNote({ title: 'Leaf', parentNoteId: middle.id })

        expect((await notes.getNote(leaf.id)).path).toEqual([
          { type: 'folder', id: outer.id, title: 'Outer' },
          { type: 'folder', id: inner.id, title: 'Inner' },
          { type: 'note', id: top.id, title: 'Top' },
          { type: 'note', id: middle.id, title: 'Middle' },
        ])
        expect((await notes.folderContents(inner.id)).folder?.path).toEqual([
          { type: 'folder', id: outer.id, title: 'Outer' },
        ])
        expect((await notes.folderContents(outer.id)).folder?.path).toEqual([])
      })

      it('trashes a whole subtree with its parent and brings it back together', async () => {
        const { notes, signInNewUser } = await create()
        await signInNewUser()
        const parent = await notes.createNote({ title: 'Parent' })
        const child = await notes.createNote({ title: 'Child', parentNoteId: parent.id })
        const grandchild = await notes.createNote({ title: 'Grandchild', parentNoteId: child.id })
        const link = await notes.createLink({
          title: 'Link',
          url: 'https://a.co',
          parentNoteId: child.id,
        })
        const attachment = await notes.uploadNoteAttachment(grandchild.id, file('a.txt', 'abc'))

        await notes.deleteNote(parent.id)

        expect((await notes.listNotes()).items).toEqual([])
        expect((await notes.listLinks()).items).toEqual([])
        const trash = await notes.listTrash()
        expect(ids(trash.notes)).toEqual([parent.id])
        expect(trash.links).toEqual([])
        expect(trash.attachments).toEqual([])
        await rejects(notes.noteChildren(parent.id), { status: 404, code: 'note.not_found' })
        await rejects(notes.downloadAttachment(attachment.id), {
          status: 404,
          code: 'attachment.not_found',
        })

        await notes.restore('note', parent.id)
        expect(ids((await notes.listNotes()).items).sort()).toEqual(
          [parent.id, child.id, grandchild.id].sort(),
        )
        expect(ids((await notes.listLinks()).items)).toEqual([link.id])
        expect((await notes.getNote(grandchild.id)).attachments).toHaveLength(1)
      })

      it('does not restore a child while its parent note is in the trash', async () => {
        const { notes, signInNewUser } = await create()
        await signInNewUser()
        const parent = await notes.createNote({ title: 'Parent' })
        const child = await notes.createNote({ title: 'Child', parentNoteId: parent.id })
        const link = await notes.createLink({
          title: 'Link',
          url: 'https://a.co',
          parentNoteId: parent.id,
        })
        await notes.deleteNote(child.id)
        await notes.deleteLink(link.id)
        await notes.deleteNote(parent.id)

        await rejects(notes.restore('note', child.id), {
          status: 409,
          code: 'notes.parent_note_in_trash',
        })
        await rejects(notes.restore('link', link.id), {
          status: 409,
          code: 'notes.parent_note_in_trash',
        })
      })

      it('lists a child trashed on its own, and it can be restored', async () => {
        const { notes, signInNewUser } = await create()
        await signInNewUser()
        const parent = await notes.createNote({ title: 'Parent' })
        const child = await notes.createNote({ title: 'Child', parentNoteId: parent.id })
        await notes.deleteNote(child.id)

        expect(ids((await notes.listTrash()).notes)).toEqual([child.id])
        expect((await notes.getNote(parent.id)).childCount).toBe(0)
        expect((await notes.noteChildren(parent.id)).notes).toEqual([])

        await notes.restore('note', child.id)
        expect(ids((await notes.noteChildren(parent.id)).notes)).toEqual([child.id])
      })

      it('deletes a subtree for good, files included, and copes with emptying a nested trash', async () => {
        const { notes, signInNewUser } = await create()
        await signInNewUser()
        const parent = await notes.createNote({ title: 'Parent' })
        const child = await notes.createNote({ title: 'Child', parentNoteId: parent.id })
        const link = await notes.createLink({
          title: 'Link',
          url: 'https://a.co',
          parentNoteId: child.id,
        })
        const attachment = await notes.uploadNoteAttachment(child.id, file('a.txt', 'abc'))
        await notes.deleteNote(parent.id)

        await notes.deletePermanently('note', parent.id)

        for (const read of [
          () => notes.getNote(parent.id),
          () => notes.getNote(child.id),
          () => notes.getLink(link.id),
          () => notes.getAttachment(attachment.id),
        ]) {
          await rejects(read(), {
            status: 404,
            code: expect.stringMatching(/not_found$/) as unknown as string,
          })
        }

        const solo = await notes.createNote({ title: 'Solo' })
        await notes.createNote({ title: 'Solo child', parentNoteId: solo.id })
        await notes.deleteNote(solo.id)
        await notes.emptyTrash()
        expect(await notes.listTrash()).toEqual({
          folders: [],
          notes: [],
          links: [],
          attachments: [],
        })
        expect((await notes.listNotes()).items).toEqual([])
      })

      it('trashes and restores the note trees inside a folder with the folder', async () => {
        const { notes, signInNewUser } = await create()
        await signInNewUser()
        const folder = await notes.createFolder('Docs')
        const top = await notes.createNote({ title: 'Top', folderId: folder.id })
        const child = await notes.createNote({ title: 'Child', parentNoteId: top.id })
        const link = await notes.createLink({
          title: 'Link',
          url: 'https://a.co',
          parentNoteId: child.id,
        })

        await notes.deleteFolder(folder.id)
        expect((await notes.listNotes()).items).toEqual([])
        expect((await notes.listLinks()).items).toEqual([])

        await notes.restore('folder', folder.id)
        expect(ids((await notes.listNotes()).items).sort()).toEqual([top.id, child.id].sort())
        expect(ids((await notes.listLinks()).items)).toEqual([link.id])

        await notes.deleteFolder(folder.id)
        await notes.deletePermanently('folder', folder.id)
        await rejects(notes.getNote(child.id), { status: 404, code: 'note.not_found' })
        await rejects(notes.getLink(link.id), { status: 404, code: 'link.not_found' })
      })

      it('finds nested notes by search and counts their tags', async () => {
        const { notes, signInNewUser } = await create()
        await signInNewUser()
        const parent = await notes.createNote({ title: 'Parent' })
        const child = await notes.createNote({
          title: 'Needle in a haystack',
          parentNoteId: parent.id,
          tags: ['deep'],
        })

        expect(ids((await notes.search({ q: 'needle' })).items)).toEqual([child.id])
        expect(await notes.listTags()).toEqual([{ name: 'deep', count: 1 }])
      })
    })

    describe('ownership', () => {
      it("never exposes or changes another user's data", async () => {
        const { notes, signInNewUser, switchTo } = await create()
        const owner = await signInNewUser()
        const folder = await notes.createFolder('Private')
        const note = await notes.createNote({
          title: 'Secret findme',
          folderId: folder.id,
          tags: ['private'],
        })
        const link = await notes.createLink({
          title: 'Mine findme',
          url: 'https://a.co',
          tags: ['private'],
        })
        const attachment = await notes.uploadNoteAttachment(note.id, file('a.txt', 'abc'))

        await signInNewUser()

        await rejects(notes.getNote(note.id), { status: 404, code: 'note.not_found' })
        await rejects(notes.updateNote(note.id, { title: 'hacked' }), {
          status: 404,
          code: 'note.not_found',
        })
        await rejects(notes.deleteNote(note.id), { status: 404, code: 'note.not_found' })
        await rejects(notes.getLink(link.id), { status: 404, code: 'link.not_found' })
        await rejects(notes.deleteLink(link.id), { status: 404, code: 'link.not_found' })
        await rejects(notes.getAttachment(attachment.id), {
          status: 404,
          code: 'attachment.not_found',
        })
        await rejects(notes.downloadAttachment(attachment.id), {
          status: 404,
          code: 'attachment.not_found',
        })
        await rejects(notes.uploadNoteAttachment(note.id, file('b.txt', 'b')), {
          status: 404,
          code: 'note.not_found',
        })
        await rejects(notes.folderContents(folder.id), { status: 404, code: 'folder.not_found' })
        await rejects(notes.deleteFolder(folder.id), { status: 404, code: 'folder.not_found' })
        await rejects(notes.createNote({ title: 'x', folderId: folder.id }), {
          status: 422,
          code: 'folder.not_found',
        })
        await rejects(notes.createNote({ title: 'x', parentNoteId: note.id }), {
          status: 422,
          code: 'note.parent_not_found',
        })
        await rejects(notes.noteChildren(note.id), { status: 404, code: 'note.not_found' })
        expect((await notes.search({ q: 'findme' })).items).toEqual([])
        expect((await notes.listNotes()).items).toEqual([])
        expect(await notes.listTags()).toEqual([])

        await switchTo(owner)
        expect((await notes.getNote(note.id)).title).toBe('Secret findme')
      })

      it('requires a session', async () => {
        const { notes } = await create()

        await rejects(notes.listNotes(), { status: 401, code: 'security.unauthenticated' })
        await rejects(notes.folderContents(), { status: 401, code: 'security.unauthenticated' })
      })
    })
  })
}
