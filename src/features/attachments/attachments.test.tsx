import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/data/errors'
import type { Attachment } from '@/data/types'
import { AUTOSAVE_DEFAULTS } from '@/features/documents/useAutosave'
import { ACCOUNT, createBackend, renderApp } from '@/test/renderApp'
import { editorText, findEditor, setEditorText } from '@/test/editor'

type Backend = Awaited<ReturnType<typeof createBackend>>

const original = { ...AUTOSAVE_DEFAULTS }
beforeEach(() => {
  AUTOSAVE_DEFAULTS.delayMs = 25
  AUTOSAVE_DEFAULTS.retryDelaysMs = [25]
})
afterEach(() => {
  Object.assign(AUTOSAVE_DEFAULTS, original)
  vi.restoreAllMocks()
})

async function signedInBackend(): Promise<Backend> {
  const mock = await createBackend()
  await mock.auth.login(ACCOUNT.email, ACCOUNT.password)
  return mock
}

const file = (name: string, content = 'hello', type = 'text/plain') =>
  new File([content], name, { type })

/** A file that claims a size without allocating it. */
const fileOfSize = (name: string, size: number) => {
  const f = file(name, 'x')
  Object.defineProperty(f, 'size', { value: size })
  return f
}

const panel = () => screen.getByRole('region', { name: 'Attachments' })

async function openNote(mock: Backend, attached: File[] = []) {
  const note = await mock.notes.createNote({ title: 'Report' })
  const stored: Attachment[] = []
  for (const f of attached) stored.push(await mock.notes.uploadNoteAttachment(note.id, f))
  const app = await renderApp(`/doc/${note.id}`, mock)
  await screen.findByLabelText('Document title')
  return { note, stored, ...app }
}

const dropFiles = (target: Element, files: File[], types = ['Files']) =>
  fireEvent.drop(target, { dataTransfer: { files, types } })

/** Lets a test decide when an upload ends. */
function holdUploads(mock: Backend) {
  const pending: {
    file: File
    progress: (fraction: number) => void
    finish: () => void
    fail: (error: unknown) => void
  }[] = []
  const real = mock.notes.uploadNoteAttachment.bind(mock.notes)
  vi.spyOn(mock.notes, 'uploadNoteAttachment').mockImplementation(
    (noteId, f, options) =>
      new Promise((resolve, reject) => {
        pending.push({
          file: f,
          progress: (fraction) => options?.onProgress?.(fraction),
          finish: () => resolve(real(noteId, f)),
          fail: reject,
        })
      }),
  )
  return pending
}

describe('attachments of a document', () => {
  it('lists the files with their size, and invites to add the first one', async () => {
    const mock = await signedInBackend()
    await openNote(mock, [file('notes.txt', 'x'.repeat(1536))])

    const items = within(panel()).getAllByRole('listitem')
    expect(items).toHaveLength(1)
    expect(items[0]).toHaveTextContent('notes.txt')
    expect(items[0]).toHaveTextContent('1.5 kB')
    expect(within(panel()).getByRole('heading', { name: 'Attachments (1)' })).toBeInTheDocument()
  })

  it('shows a hint when there are none', async () => {
    const mock = await signedInBackend()
    await openNote(mock)

    expect(within(panel()).queryByRole('list')).not.toBeInTheDocument()
    expect(within(panel()).getByText(/Drop files anywhere on this page/)).toBeInTheDocument()
  })

  describe('adding', () => {
    it('uploads what is picked and lists it', async () => {
      const mock = await signedInBackend()
      const { note, user } = await openNote(mock)

      await user.upload(
        screen.getByLabelText('Attach files'),
        file('plan.pdf', 'pdf!', 'application/pdf'),
      )

      expect(await within(panel()).findByText('plan.pdf')).toBeInTheDocument()
      const stored = (await mock.notes.getNote(note.id)).attachments
      expect(stored.map((a) => [a.fileName, a.mimeType, a.sizeBytes])).toEqual([
        ['plan.pdf', 'application/pdf', 4],
      ])
      expect(within(panel()).queryByRole('progressbar')).not.toBeInTheDocument()
    })

    it('shows progress, and the file joins the list when it is done', async () => {
      const mock = await signedInBackend()
      const pending = holdUploads(mock)
      const { user } = await openNote(mock)

      await user.upload(screen.getByLabelText('Attach files'), file('big.zip'))
      const bar = await within(panel()).findByRole('progressbar', {
        name: 'Upload progress of big.zip',
      })
      expect(bar).toHaveValue(0)
      pending[0].progress(0.4)
      await waitFor(() => expect(bar).toHaveValue(40))

      pending[0].finish()

      await waitFor(() =>
        expect(within(panel()).queryByRole('progressbar')).not.toBeInTheDocument(),
      )
      expect(within(panel()).getAllByRole('listitem')).toHaveLength(1)
      expect(within(panel()).getByText('big.zip')).toBeInTheDocument()
    })

    it('sends several files one after another, in order', async () => {
      const mock = await signedInBackend()
      const pending = holdUploads(mock)
      const { user } = await openNote(mock)

      await user.upload(screen.getByLabelText('Attach files'), [file('a.txt'), file('b.txt')])

      await waitFor(() => expect(pending).toHaveLength(1))
      expect(pending[0].file.name).toBe('a.txt')
      expect(within(panel()).getAllByRole('progressbar')).toHaveLength(2)
      pending[0].finish()
      await waitFor(() => expect(pending).toHaveLength(2))
      expect(pending[1].file.name).toBe('b.txt')
      pending[1].finish()
      await waitFor(() =>
        expect(within(panel()).queryByRole('progressbar')).not.toBeInTheDocument(),
      )
      expect(
        within(panel())
          .getAllByRole('listitem')
          .map((li) => li.textContent),
      ).toEqual([expect.stringContaining('a.txt'), expect.stringContaining('b.txt')])
    })

    it('refuses a file over the limit without calling the server', async () => {
      const mock = await signedInBackend()
      const upload = vi.spyOn(mock.notes, 'uploadNoteAttachment')
      const { user } = await openNote(mock)

      await user.upload(
        screen.getByLabelText('Attach files'),
        fileOfSize('huge.iso', 50 * 1024 * 1024 + 1),
      )

      expect(await within(panel()).findByRole('alert')).toHaveTextContent(
        'The file is too large (the limit is 50 MB).',
      )
      expect(upload).not.toHaveBeenCalled()
      await user.click(within(panel()).getByRole('button', { name: 'Dismiss' }))
      expect(within(panel()).queryByText('huge.iso')).not.toBeInTheDocument()
    })

    it('accepts a file of exactly the limit', async () => {
      const mock = await signedInBackend()
      const upload = vi.spyOn(mock.notes, 'uploadNoteAttachment')
      const { user } = await openNote(mock)

      await user.upload(
        screen.getByLabelText('Attach files'),
        fileOfSize('edge.bin', 50 * 1024 * 1024),
      )

      await waitFor(() => expect(upload).toHaveBeenCalledTimes(1))
    })

    it('refuses an empty file and offers no retry', async () => {
      const mock = await signedInBackend()
      const upload = vi.spyOn(mock.notes, 'uploadNoteAttachment')
      const { user } = await openNote(mock)

      await user.upload(screen.getByLabelText('Attach files'), new File([], 'void.txt'))

      expect(await within(panel()).findByRole('alert')).toHaveTextContent('The file is empty.')
      expect(within(panel()).queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument()
      expect(upload).not.toHaveBeenCalled()
    })

    it('keeps a failed upload so it can be retried', async () => {
      const mock = await signedInBackend()
      vi.spyOn(mock.notes, 'uploadNoteAttachment').mockRejectedValueOnce(
        new ApiError({ status: 0, code: 'network_error' }),
      )
      const { note, user } = await openNote(mock)

      await user.upload(screen.getByLabelText('Attach files'), file('retry.txt'))
      expect(await within(panel()).findByRole('alert')).toHaveTextContent(
        'We could not reach the server',
      )
      expect((await mock.notes.getNote(note.id)).attachments).toEqual([])

      await user.click(within(panel()).getByRole('button', { name: 'Try again' }))

      await waitFor(async () =>
        expect((await mock.notes.getNote(note.id)).attachments.map((a) => a.fileName)).toEqual([
          'retry.txt',
        ]),
      )
      expect(within(panel()).queryByRole('alert')).not.toBeInTheDocument()
    })

    it('cancels an upload in flight when it is dismissed', async () => {
      const mock = await signedInBackend()
      const upload = vi
        .spyOn(mock.notes, 'uploadNoteAttachment')
        .mockImplementation(
          (_id, _file, options) =>
            new Promise((_resolve, reject) =>
              options?.signal?.addEventListener('abort', () =>
                reject(new ApiError({ status: 0, code: 'aborted' })),
              ),
            ),
        )
      const { user } = await openNote(mock)

      await user.upload(screen.getByLabelText('Attach files'), file('slow.bin'))
      await within(panel()).findByRole('progressbar')
      await user.click(within(panel()).getByRole('button', { name: 'Dismiss' }))

      expect(upload.mock.calls[0][2]?.signal?.aborted).toBe(true)
      expect(within(panel()).queryByText('slow.bin')).not.toBeInTheDocument()
      expect(within(panel()).queryByRole('alert')).not.toBeInTheDocument()
    })
  })

  describe('dropping files', () => {
    it('attaches files dropped anywhere on the page, even on the editor, without pasting them into the text', async () => {
      const mock = await signedInBackend()
      const { note } = await openNote(mock)
      await setEditorText('hello')
      await waitFor(async () => expect((await mock.notes.getNote(note.id)).content).toBe('hello'))

      const content = (await findEditor()).contentDOM
      // CodeMirror would read a dropped file into the text: the drop must never get as far as the editor.
      const editorSawIt = vi.fn()
      content.addEventListener('drop', editorSawIt)
      dropFiles(content, [file('dropped.txt', 'SECRET CONTENT')])
      expect(editorSawIt).not.toHaveBeenCalled()

      await waitFor(async () =>
        expect((await mock.notes.getNote(note.id)).attachments.map((a) => a.fileName)).toEqual([
          'dropped.txt',
        ]),
      )
      await waitFor(() => expect(within(panel()).getByText('dropped.txt')).toBeInTheDocument())
      expect(await editorText()).toBe('hello')
    })

    it('shows that it will take the files while they are dragged over, and stops after', async () => {
      const mock = await signedInBackend()
      await openNote(mock)
      const title = screen.getByLabelText('Document title')

      fireEvent.dragEnter(title, { dataTransfer: { types: ['Files'] } })
      expect(await screen.findByText('Drop the files to attach them')).toBeInTheDocument()

      fireEvent.dragLeave(title, { dataTransfer: { types: ['Files'] } })
      await waitFor(() =>
        expect(screen.queryByText('Drop the files to attach them')).not.toBeInTheDocument(),
      )
    })

    it('ignores text dragged around', async () => {
      const mock = await signedInBackend()
      const upload = vi.spyOn(mock.notes, 'uploadNoteAttachment')
      await openNote(mock)
      const title = screen.getByLabelText('Document title')

      fireEvent.dragEnter(title, { dataTransfer: { types: ['text/plain'] } })
      dropFiles(title, [file('x.txt')], ['text/plain'])

      expect(screen.queryByText('Drop the files to attach them')).not.toBeInTheDocument()
      expect(upload).not.toHaveBeenCalled()
    })
  })

  describe('downloading', () => {
    const stubDownloads = () => {
      const createObjectURL = vi.fn(() => 'blob:fake')
      const revokeObjectURL = vi.fn()
      Object.assign(URL, { createObjectURL, revokeObjectURL })
      const saved: { download: string; href: string }[] = []
      vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
        this: HTMLAnchorElement,
      ) {
        saved.push({ download: this.download, href: this.href })
      })
      return { createObjectURL, saved }
    }

    it('fetches the file with the session and hands it to the browser under its own name', async () => {
      const mock = await signedInBackend()
      const { stored, user } = await openNote(mock, [file('report final.txt', 'data')])
      const { createObjectURL, saved } = stubDownloads()
      const download = vi.spyOn(mock.notes, 'downloadAttachment')

      await user.click(within(panel()).getByRole('button', { name: 'Download report final.txt' }))

      await waitFor(() => expect(saved).toHaveLength(1))
      expect(download).toHaveBeenCalledWith(stored[0].id)
      expect(saved[0]).toEqual({ download: 'report final.txt', href: 'blob:fake' })
      const blob = (createObjectURL.mock.calls as unknown as Blob[][])[0][0]
      expect(await blob.text()).toBe('data')
    })

    it('says so when the download fails', async () => {
      const mock = await signedInBackend()
      const { user } = await openNote(mock, [file('lost.txt')])
      const { saved } = stubDownloads()
      vi.spyOn(mock.notes, 'downloadAttachment').mockRejectedValue(
        new ApiError({ status: 0, code: 'network_error' }),
      )

      await user.click(within(panel()).getByRole('button', { name: 'Download lost.txt' }))

      expect(await within(panel()).findByRole('alert')).toHaveTextContent(
        "Couldn't download lost.txt. Try again.",
      )
      expect(saved).toEqual([])
    })
  })

  describe('deleting', () => {
    it('asks first, then removes the file from the list and sends it to the trash', async () => {
      const mock = await signedInBackend()
      const { note, stored, user } = await openNote(mock, [file('old.txt'), file('keep.txt')])

      await user.click(within(panel()).getByRole('button', { name: 'Delete old.txt' }))
      const dialog = await screen.findByRole('alertdialog', { name: 'Delete this file?' })
      expect(within(dialog).getByText('“old.txt” will be moved to the trash.')).toBeInTheDocument()
      expect((await mock.notes.getNote(note.id)).attachments).toHaveLength(2)
      await user.click(within(dialog).getByRole('button', { name: 'Delete' }))

      await waitFor(() => expect(within(panel()).queryByText('old.txt')).not.toBeInTheDocument())
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
      expect(within(panel()).getByText('keep.txt')).toBeInTheDocument()
      expect((await mock.notes.getNote(note.id)).attachments.map((a) => a.id)).not.toContain(
        stored[0].id,
      )
      expect((await mock.notes.listTrash()).attachments.map((a) => a.id)).toEqual([stored[0].id])
    })

    it('can be cancelled', async () => {
      const mock = await signedInBackend()
      const { note, user } = await openNote(mock, [file('stay.txt')])

      await user.click(within(panel()).getByRole('button', { name: 'Delete stay.txt' }))
      await user.click(
        within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Cancel' }),
      )

      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
      expect(within(panel()).getByText('stay.txt')).toBeInTheDocument()
      expect((await mock.notes.getNote(note.id)).attachments).toHaveLength(1)
    })

    it('stays open and explains when it fails', async () => {
      const mock = await signedInBackend()
      const { user } = await openNote(mock, [file('stuck.txt')])
      vi.spyOn(mock.notes, 'deleteAttachment').mockRejectedValue(
        new ApiError({ status: 404, code: 'attachment.not_found' }),
      )

      await user.click(within(panel()).getByRole('button', { name: 'Delete stuck.txt' }))
      await user.click(
        within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Delete' }),
      )

      expect(await within(screen.getByRole('alertdialog')).findByRole('alert')).toHaveTextContent(
        'This file no longer exists.',
      )
      expect(within(panel()).getByText('stuck.txt')).toBeInTheDocument()
    })
  })

  describe('images', () => {
    const png = () => file('diagram [v2].png', 'PNGDATA', 'image/png')

    it('offers to insert only the files that can be shown as images', async () => {
      const mock = await signedInBackend()
      await openNote(mock, [
        png(),
        file('doc.pdf', 'x', 'application/pdf'),
        file('logo.svg', '<svg/>', 'image/svg+xml'),
      ])

      expect(
        within(panel()).getByRole('button', { name: 'Insert diagram [v2].png into the document' }),
      ).toBeInTheDocument()
      expect(within(panel()).getAllByRole('button', { name: /^Insert / })).toHaveLength(1)
    })

    it('puts the image where the cursor is and saves the document', async () => {
      const mock = await signedInBackend()
      const { note, stored, user } = await openNote(mock, [png()])
      await setEditorText('before after')
      const view = await findEditor()
      view.dispatch({ selection: { anchor: 7 } })

      await user.click(
        within(panel()).getByRole('button', { name: 'Insert diagram [v2].png into the document' }),
      )

      const markup = `![diagram \\[v2\\].png](attachment:${stored[0].id})`
      expect(await editorText()).toBe(`before ${markup}after`)
      await waitFor(async () =>
        expect((await mock.notes.getNote(note.id)).content).toBe(`before ${markup}after`),
      )
    })

    it('shows an inserted image in the visual editor, loaded with the session', async () => {
      const mock = await signedInBackend()
      const createObjectURL = vi.fn(() => 'blob:image-1')
      Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() })
      const note = await mock.notes.createNote({ title: 'Pics' })
      const picture = await mock.notes.uploadNoteAttachment(note.id, png())
      await mock.notes.updateNote(note.id, { content: `![a diagram](attachment:${picture.id})` })
      const download = vi.spyOn(mock.notes, 'downloadAttachment')

      await renderApp(`/doc/${note.id}`, mock, { editorMode: 'visual' })

      const page = await screen.findByTestId('visual-editor')
      const image = await within(page).findByAltText('a diagram')
      await waitFor(() => expect(image).toHaveAttribute('src', 'blob:image-1'))
      expect(image).toHaveAttribute('data-state', 'ready')
      expect(download).toHaveBeenCalledWith(picture.id)
    })

    it('marks an image that cannot be loaded, without requesting its raw address', async () => {
      const mock = await signedInBackend()
      const note = await mock.notes.createNote({ title: 'Broken' })
      await mock.notes.updateNote(note.id, {
        content: '![gone](attachment:00000000-0000-4000-8000-000000000000)',
      })

      await renderApp(`/doc/${note.id}`, mock, { editorMode: 'visual' })

      const page = await screen.findByTestId('visual-editor')
      const image = await within(page).findByAltText('gone')
      await waitFor(() => expect(image).toHaveAttribute('data-state', 'error'))
      expect(image).not.toHaveAttribute('src')
    })

    it('does not let a link or another kind of address use the attachment scheme', async () => {
      const mock = await signedInBackend()
      const note = await mock.notes.createNote({ title: 'Tricks' })
      await mock.notes.updateNote(note.id, {
        content: `[click](attachment:abc) ![odd](attachment:../../etc/passwd) ![x](javascript:alert(1)) ![long](attachment:${'a'.repeat(65)})`,
      })
      const download = vi.spyOn(mock.notes, 'downloadAttachment')

      await renderApp(`/doc/${note.id}`, mock, { editorMode: 'visual' })

      const page = await screen.findByTestId('visual-editor')
      await waitFor(() => expect(page.textContent).toContain('[click](attachment:abc)'))
      expect(page.querySelector('a')).toBeNull()
      expect(page.querySelector('img:not(.ProseMirror-separator)')).toBeNull()
      expect(download).not.toHaveBeenCalled()
    })
  })

  it('speaks Spanish when the account does', async () => {
    const mock = await signedInBackend()
    await mock.auth.updateProfile({ locale: 'es' })
    await openNoteInSpanish(mock)

    const region = await screen.findByRole('region', { name: 'Adjuntos' })
    expect(within(region).getByRole('heading', { name: 'Adjuntos (1)' })).toBeInTheDocument()
    expect(within(region).getByRole('button', { name: 'Adjuntar archivos' })).toBeInTheDocument()
    expect(within(region).getByRole('button', { name: 'Descargar nota.txt' })).toBeInTheDocument()
    expect(within(region).getByRole('button', { name: 'Eliminar nota.txt' })).toBeInTheDocument()
  })
})

async function openNoteInSpanish(mock: Backend) {
  const note = await mock.notes.createNote({ title: 'Informe' })
  await mock.notes.uploadNoteAttachment(note.id, file('nota.txt'))
  await renderApp(`/doc/${note.id}`, mock)
}

describe('attachments of a folder', () => {
  it('lists the files, and counts them as content', async () => {
    const mock = await signedInBackend()
    const folder = await mock.notes.createFolder('Contracts')
    await mock.notes.uploadFolderAttachment(folder.id, file('deal.pdf', 'x', 'application/pdf'))

    await renderApp(`/folder/${folder.id}`, mock)

    expect(
      await within(await screen.findByRole('region', { name: 'Attachments' })).findByText(
        'deal.pdf',
      ),
    ).toBeInTheDocument()
    expect(screen.queryByText('This folder is empty.')).not.toBeInTheDocument()
  })

  it('uploads and deletes files in the folder', async () => {
    const mock = await signedInBackend()
    const folder = await mock.notes.createFolder('Contracts')
    const { user } = await renderApp(`/folder/${folder.id}`, mock)
    const region = await screen.findByRole('region', { name: 'Attachments' })

    await user.upload(within(region).getByLabelText('Attach files'), file('a.txt'))
    expect(await within(region).findByText('a.txt')).toBeInTheDocument()
    expect((await mock.notes.folderContents(folder.id)).attachments.map((a) => a.fileName)).toEqual(
      ['a.txt'],
    )
    expect(within(region).queryByRole('button', { name: /^Insert/ })).not.toBeInTheDocument()

    await user.click(within(region).getByRole('button', { name: 'Delete a.txt' }))
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Delete' }),
    )

    await waitFor(() => expect(within(region).queryByText('a.txt')).not.toBeInTheDocument())
    expect((await mock.notes.folderContents(folder.id)).attachments).toEqual([])
  })

  it('takes dropped files', async () => {
    const mock = await signedInBackend()
    const folder = await mock.notes.createFolder('Contracts')
    await renderApp(`/folder/${folder.id}`, mock)
    const region = await screen.findByRole('region', { name: 'Attachments' })

    dropFiles(region, [file('dropped.txt')])

    await waitFor(async () =>
      expect(
        (await mock.notes.folderContents(folder.id)).attachments.map((a) => a.fileName),
      ).toEqual(['dropped.txt']),
    )
    await waitFor(() => expect(within(region).getByText('dropped.txt')).toBeInTheDocument())
  })
})
