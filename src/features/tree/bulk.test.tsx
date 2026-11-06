import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/data/errors'
import { ACCOUNT, createBackend, renderApp } from '@/test/renderApp'

type Backend = Awaited<ReturnType<typeof createBackend>>

afterEach(() => {
  vi.restoreAllMocks()
})

async function signedInBackend(): Promise<Backend> {
  const mock = await createBackend()
  await mock.auth.login(ACCOUNT.email, ACCOUNT.password)
  return mock
}

/**
 * Source/ (folder)
 *   Inner/ (folder)
 *   Alpha, Beta, Gamma (documents)
 *   Docs (link)
 *   notes.txt (file)
 * Target/ (folder)
 */
async function seed(mock: Backend) {
  const { notes } = mock
  const source = await notes.createFolder('Source')
  const target = await notes.createFolder('Target')
  const inner = await notes.createFolder('Inner', source.id)
  const alpha = await notes.createNote({ title: 'Alpha', folderId: source.id })
  const beta = await notes.createNote({ title: 'Beta', folderId: source.id })
  const gamma = await notes.createNote({ title: 'Gamma', folderId: source.id })
  const docs = await notes.createLink({
    title: 'Docs',
    url: 'https://docs.example',
    folderId: source.id,
  })
  const file = await notes.uploadFolderAttachment(
    source.id,
    new File(['hi'], 'notes.txt', { type: 'text/plain' }),
  )
  return { source, target, inner, alpha, beta, gamma, docs, file }
}

const main = () => screen.getByRole('main')
const checkbox = (name: string) =>
  within(main()).getByRole('checkbox', { name: `Select ${name}` }) as HTMLInputElement
const toolbar = () => screen.queryByRole('toolbar')
const openCard = (name: RegExp) => within(main()).getByRole('link', { name })

async function openSource(mock: Backend) {
  const data = await seed(mock)
  const view = await renderApp(`/folder/${data.source.id}`, mock)
  await within(await screen.findByRole('main')).findByRole('link', { name: /Alpha/ })
  return { ...data, ...view }
}

describe('bulk actions: picking items', () => {
  it('shows how many are picked and lets go with Clear selection', async () => {
    const mock = await signedInBackend()
    const { user } = await openSource(mock)
    expect(toolbar()).not.toBeInTheDocument()

    await user.click(checkbox('Alpha'))
    await user.click(checkbox('Docs'))

    expect(within(toolbar()!).getByText('2 selected')).toBeInTheDocument()
    expect(checkbox('Alpha')).toBeChecked()
    expect(checkbox('Beta')).not.toBeChecked()

    await user.click(within(toolbar()!).getByRole('button', { name: 'Clear selection' }))
    expect(toolbar()).not.toBeInTheDocument()
    expect(checkbox('Alpha')).not.toBeChecked()
  })

  it('picks a card instead of opening it while selecting, and opens it otherwise', async () => {
    const mock = await signedInBackend()
    const { user, router, alpha, beta } = await openSource(mock)

    await user.click(within(main()).getByRole('button', { name: 'Select' }))
    await user.click(openCard(/Alpha/))

    expect(router.state.location.pathname).not.toBe(`/doc/${alpha.id}`)
    expect(checkbox('Alpha')).toBeChecked()

    await user.click(within(main()).getByRole('button', { name: 'Done' }))
    expect(checkbox('Alpha')).not.toBeChecked()
    await user.click(openCard(/Beta/))
    await waitFor(() => expect(router.state.location.pathname).toBe(`/doc/${beta.id}`))
  })

  it('starts a selection with Ctrl+click and picks a range with Shift+click', async () => {
    const mock = await signedInBackend()
    const { user, router, source } = await openSource(mock)

    await user.keyboard('{Control>}')
    await user.click(openCard(/Alpha/))
    await user.keyboard('{/Control}')
    expect(router.state.location.pathname).toBe(`/folder/${source.id}`)
    expect(checkbox('Alpha')).toBeChecked()

    await user.keyboard('{Shift>}')
    await user.click(openCard(/Gamma/))
    await user.keyboard('{/Shift}')

    expect(checkbox('Beta')).toBeChecked()
    expect(checkbox('Gamma')).toBeChecked()
    expect(checkbox('Docs')).not.toBeChecked()
    expect(within(toolbar()!).getByText('3 selected')).toBeInTheDocument()
  })

  it('picks everything with Ctrl+A, a whole section from its header, and lets go with Escape', async () => {
    const mock = await signedInBackend()
    const { user } = await openSource(mock)

    await user.click(within(main()).getByRole('button', { name: 'Select' }))
    await user.keyboard('{Control>}a{/Control}')
    // The folder Inner, three documents, the link and the file.
    expect(within(toolbar()!).getByText('6 selected')).toBeInTheDocument()

    await user.keyboard('{Escape}')
    expect(toolbar()).not.toBeInTheDocument()

    await user.click(within(main()).getByRole('button', { name: 'Select' }))
    await user.click(within(main()).getByRole('checkbox', { name: 'Select all in Documents' }))
    expect(within(toolbar()!).getByText('3 selected')).toBeInTheDocument()
    await user.click(checkbox('Beta'))
    const header = within(main()).getByRole('checkbox', { name: 'Select all in Documents' })
    expect((header as HTMLInputElement).indeterminate).toBe(true)
  })

  it('drops from the selection what is no longer on the page', async () => {
    const mock = await signedInBackend()
    const { user, alpha } = await openSource(mock)
    await user.click(checkbox('Alpha'))
    await user.click(checkbox('Beta'))
    expect(within(toolbar()!).getByText('2 selected')).toBeInTheDocument()

    await mock.notes.deleteNote(alpha.id)
    await mock.notes.createNote({ title: 'Delta', folderId: alpha.folderId })
    await user.click(within(main()).getByRole('button', { name: 'Done' }))
    await user.click(within(main()).getByRole('button', { name: 'Select' }))
    await user.click(checkbox('Beta'))
    expect(within(toolbar()!).getByText('1 selected')).toBeInTheDocument()
  })
})

describe('bulk actions: limit', () => {
  it('blocks the actions above 100 items and says why', async () => {
    const mock = await signedInBackend()
    const folder = await mock.notes.createFolder('Big')
    for (let i = 0; i < 101; i++) {
      await mock.notes.createLink({
        title: `Link ${i}`,
        url: 'https://a.example',
        folderId: folder.id,
      })
    }
    const { user } = await renderApp(`/folder/${folder.id}`, mock)
    await within(await screen.findByRole('main')).findByRole('link', { name: /Link 0/ })

    await user.click(within(main()).getByRole('button', { name: 'Select' }))
    await user.keyboard('{Control>}a{/Control}')

    const bar = within(toolbar()!)
    expect(bar.getByText('101 selected')).toBeInTheDocument()
    expect(bar.getByText('Select up to 100 items at a time')).toBeInTheDocument()
    expect(bar.getByRole('button', { name: 'Delete' })).toBeDisabled()
    expect(bar.getByRole('button', { name: 'Move to…' })).toBeDisabled()

    await user.click(checkbox('Link 0'))
    expect(bar.getByRole('button', { name: 'Delete' })).toBeEnabled()
  })
})

describe('bulk actions: deleting', () => {
  it('asks first, then sends everything picked to the trash and clears the selection', async () => {
    const mock = await signedInBackend()
    const { user, alpha, docs, file } = await openSource(mock)
    await user.click(checkbox('Alpha'))
    await user.click(checkbox('Docs'))
    await user.click(checkbox('notes.txt'))

    await user.click(within(toolbar()!).getByRole('button', { name: 'Delete' }))

    const dialog = await screen.findByRole('alertdialog', { name: 'Delete 3 items?' })
    expect(within(dialog).getByText(/1 document, 1 link, 1 file/)).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }))

    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
    await waitFor(() => expect(within(main()).queryByRole('link', { name: /Alpha/ })).toBeNull())
    expect(within(main()).queryByRole('link', { name: /Docs/ })).toBeNull()
    expect(within(main()).getByRole('link', { name: /Beta/ })).toBeInTheDocument()
    expect(toolbar()).not.toBeInTheDocument()
    const trash = await mock.notes.listTrash()
    expect(trash.notes.map((n) => n.id)).toEqual([alpha.id])
    expect(trash.links.map((l) => l.id)).toEqual([docs.id])
    expect(trash.attachments.map((a) => a.id)).toEqual([file.id])
  })

  it('warns that folders and documents take what is inside with them', async () => {
    const mock = await signedInBackend()
    const { user } = await openSource(mock)
    await user.click(checkbox('Inner'))
    await user.click(within(toolbar()!).getByRole('button', { name: 'Delete' }))

    const dialog = await screen.findByRole('alertdialog', { name: 'Delete this item?' })
    expect(within(dialog).getByText(/attached files included/)).toBeInTheDocument()
  })

  it('cancels without touching anything', async () => {
    const mock = await signedInBackend()
    const { user } = await openSource(mock)
    const remove = vi.spyOn(mock.notes, 'deleteMany')
    await user.click(checkbox('Alpha'))
    await user.click(within(toolbar()!).getByRole('button', { name: 'Delete' }))

    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Cancel' }),
    )

    expect(remove).not.toHaveBeenCalled()
    expect(checkbox('Alpha')).toBeChecked()
  })

  it('shows why it failed, keeps the selection and refreshes when something is gone', async () => {
    const mock = await signedInBackend()
    const { user, beta } = await openSource(mock)
    vi.spyOn(mock.notes, 'deleteMany').mockImplementation(async () => {
      await mock.notes.deleteNote(beta.id)
      throw new ApiError({ status: 404, code: 'note.not_found' })
    })
    await user.click(checkbox('Alpha'))
    await user.click(checkbox('Beta'))
    await user.click(within(toolbar()!).getByRole('button', { name: 'Delete' }))

    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Delete' }),
    )

    expect(await screen.findByText('This document no longer exists.')).toBeInTheDocument()
    await waitFor(() => expect(within(main()).queryByRole('link', { name: /Beta/ })).toBeNull())
    expect(checkbox('Alpha')).toBeChecked()
    expect(within(toolbar()!).getByText('1 selected')).toBeInTheDocument()
  })
})

describe('bulk actions: moving', () => {
  const treeOf = (dialog: HTMLElement) => within(dialog)

  it('moves folders, documents and links to another folder in one go', async () => {
    const mock = await signedInBackend()
    const { user, target, inner, alpha, docs } = await openSource(mock)
    await user.click(checkbox('Inner'))
    await user.click(checkbox('Alpha'))
    await user.click(checkbox('Docs'))

    await user.click(within(toolbar()!).getByRole('button', { name: 'Move to…' }))

    const dialog = await screen.findByRole('dialog', { name: 'Move 3 items' })
    await user.click(await treeOf(dialog).findByRole('button', { name: 'Target' }))
    await user.click(treeOf(dialog).getByRole('button', { name: 'Move here' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    const moved = await mock.notes.folderContents(target.id)
    expect(moved.subfolders.map((f) => f.id)).toEqual([inner.id])
    expect(moved.notes.map((n) => n.id)).toEqual([alpha.id])
    expect(moved.links.map((l) => l.id)).toEqual([docs.id])
    expect(within(main()).queryByRole('link', { name: /Alpha/ })).toBeNull()
    expect(toolbar()).not.toBeInTheDocument()
  })

  it('offers no document as a destination when a folder is picked, and not the folder itself', async () => {
    const mock = await signedInBackend()
    const { user, target } = await openSource(mock)
    await mock.notes.createNote({ title: 'Elsewhere', folderId: target.id })
    await user.click(checkbox('Inner'))
    await user.click(checkbox('Alpha'))

    await user.click(within(toolbar()!).getByRole('button', { name: 'Move to…' }))

    const dialog = await screen.findByRole('dialog', { name: 'Move 2 items' })
    await user.click(await treeOf(dialog).findByRole('button', { name: 'Expand Target' }))
    await screen.findByRole('button', { name: 'Collapse Target' })
    await waitFor(() => expect(treeOf(dialog).queryByRole('status')).toBeNull())
    expect(treeOf(dialog).queryByRole('button', { name: 'Elsewhere' })).toBeNull()
    expect(treeOf(dialog).getByRole('button', { name: 'Top level' })).toBeInTheDocument()
  })

  it('offers documents but no top level when a file is picked', async () => {
    const mock = await signedInBackend()
    const { user, target } = await openSource(mock)
    await mock.notes.createNote({ title: 'Elsewhere', folderId: target.id })
    await user.click(checkbox('notes.txt'))
    await user.click(checkbox('Alpha'))

    await user.click(within(toolbar()!).getByRole('button', { name: 'Move to…' }))

    const dialog = await screen.findByRole('dialog', { name: 'Move 2 items' })
    await user.click(await treeOf(dialog).findByRole('button', { name: 'Expand Target' }))
    expect(await treeOf(dialog).findByRole('button', { name: 'Elsewhere' })).toBeInTheDocument()
    expect(treeOf(dialog).queryByRole('button', { name: 'Top level' })).toBeNull()
  })

  it('keeps the dialog and the selection when the server refuses', async () => {
    const mock = await signedInBackend()
    const { user, alpha } = await openSource(mock)
    vi.spyOn(mock.notes, 'moveMany').mockRejectedValue(
      new ApiError({ status: 422, code: 'folder.not_found' }),
    )
    await user.click(checkbox('Alpha'))
    await user.click(checkbox('Beta'))
    await user.click(within(toolbar()!).getByRole('button', { name: 'Move to…' }))
    const dialog = await screen.findByRole('dialog', { name: 'Move 2 items' })
    await user.click(await treeOf(dialog).findByRole('button', { name: 'Target' }))

    await user.click(treeOf(dialog).getByRole('button', { name: 'Move here' }))

    expect(await treeOf(dialog).findByText('This folder no longer exists.')).toBeInTheDocument()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect((await mock.notes.getNote(alpha.id)).folderId).toBe(alpha.folderId)
    expect(within(toolbar()!).getByText('2 selected')).toBeInTheDocument()
  })
})

describe('bulk actions: context menu', () => {
  it('opens the menu of the whole selection on a picked card, and its own menu on any other', async () => {
    const mock = await signedInBackend()
    const { user } = await openSource(mock)
    await user.click(checkbox('Alpha'))
    await user.click(checkbox('Beta'))

    fireEvent.contextMenu(openCard(/Alpha/))
    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual([
      'Move 2 items to…',
      'Delete 2 items',
      'Clear selection',
    ])
    await user.keyboard('{Escape}')

    fireEvent.contextMenu(openCard(/Gamma/))
    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual([
      'Pin',
      'Edit',
      'Move to…',
      'Delete',
    ])
    expect(within(toolbar()!).getByText('2 selected')).toBeInTheDocument()
  })

  it('deletes the selection from the menu', async () => {
    const mock = await signedInBackend()
    const { user, alpha, beta } = await openSource(mock)
    await user.click(checkbox('Alpha'))
    await user.click(checkbox('Beta'))

    fireEvent.contextMenu(openCard(/Beta/))
    await user.click(screen.getByRole('menuitem', { name: 'Delete 2 items' }))
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Delete' }),
    )

    await waitFor(async () =>
      expect((await mock.notes.listTrash()).notes.map((n) => n.id).sort()).toEqual(
        [alpha.id, beta.id].sort(),
      ),
    )
  })
})

describe('bulk actions: other pages', () => {
  it('works on the links page', async () => {
    const mock = await signedInBackend()
    await mock.notes.createLink({ title: 'First', url: 'https://one.example' })
    await mock.notes.createLink({ title: 'Second', url: 'https://two.example' })
    const { user } = await renderApp('/links', mock)
    await within(await screen.findByRole('main')).findByRole('link', { name: /First/ })

    await user.click(within(main()).getByRole('button', { name: 'Select' }))
    await user.click(within(main()).getByRole('checkbox', { name: 'Select all in Links' }))
    await user.click(within(toolbar()!).getByRole('button', { name: 'Delete' }))
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Delete' }),
    )

    await waitFor(async () => expect((await mock.notes.listTrash()).links).toHaveLength(2))
  })

  it('works on the home page, on documents and folders alike', async () => {
    const mock = await signedInBackend()
    await mock.notes.createFolder('Loose folder')
    await mock.notes.createNote({ title: 'Loose note' })
    const { user } = await renderApp('/', mock)
    await within(await screen.findByRole('main')).findAllByRole('link', { name: /Loose note/ })

    await user.click(within(main()).getByRole('button', { name: 'Select' }))
    await user.keyboard('{Control>}a{/Control}')

    // The note is listed twice (recent and root) but picked once.
    expect(within(toolbar()!).getByText('2 selected')).toBeInTheDocument()
  })

  it('works on a document, with its sub-documents and files', async () => {
    const mock = await signedInBackend()
    const parent = await mock.notes.createNote({ title: 'Project' })
    const child = await mock.notes.createNote({ title: 'Task', parentNoteId: parent.id })
    const file = await mock.notes.uploadNoteAttachment(
      parent.id,
      new File(['hi'], 'spec.txt', { type: 'text/plain' }),
    )
    const { user } = await renderApp(`/doc/${parent.id}`, mock)
    await screen.findByRole('link', { name: /Task/ })

    await user.click(screen.getByRole('button', { name: 'Select' }))
    await user.click(screen.getByRole('checkbox', { name: 'Select Task' }))
    await user.click(screen.getByRole('checkbox', { name: 'Select spec.txt' }))
    await user.click(within(screen.getByRole('toolbar')).getByRole('button', { name: 'Delete' }))
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Delete' }),
    )

    await waitFor(async () => {
      const trash = await mock.notes.listTrash()
      expect(trash.notes.map((n) => n.id)).toEqual([child.id])
      expect(trash.attachments.map((a) => a.id)).toEqual([file.id])
    })
  })
})
