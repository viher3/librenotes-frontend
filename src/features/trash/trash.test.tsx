import { screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/data/errors'
import { ACCOUNT, createBackend, renderApp } from '@/test/renderApp'

type Backend = Awaited<ReturnType<typeof createBackend>>

afterEach(() => vi.restoreAllMocks())

async function signedInBackend(): Promise<Backend> {
  const mock = await createBackend()
  await mock.auth.login(ACCOUNT.email, ACCOUNT.password)
  return mock
}

async function withTrash(mock: Backend) {
  const folder = await mock.notes.createFolder('Old folder')
  const note = await mock.notes.createNote({ title: 'Old note' })
  const link = await mock.notes.createLink({ title: 'Old link', url: 'https://a.co' })
  const keeper = await mock.notes.createNote({ title: 'Keeper' })
  const withFile = await mock.notes.createNote({ title: 'Has a file' })
  const file = await mock.notes.uploadNoteAttachment(
    withFile.id,
    new File(['x'], 'old.pdf', { type: 'application/pdf' }),
  )
  await mock.notes.deleteFolder(folder.id)
  await mock.notes.deleteNote(note.id)
  await mock.notes.deleteLink(link.id)
  await mock.notes.deleteAttachment(file.id)
  return { folder, note, link, keeper, withFile, file }
}

// The sidebar tree has its own "Documents" and shows restored items: look only at the page.
const page = () => within(screen.getByRole('main'))
const section = (name: string) => page().getByRole('region', { name })

describe('trash page', () => {
  it('lists what was deleted by kind, and says when', async () => {
    const mock = await signedInBackend()
    await withTrash(mock)
    await renderApp('/trash', mock)

    expect(await screen.findByRole('heading', { name: 'Trash' })).toBeInTheDocument()
    expect(within(section('Folders')).getByText('Old folder')).toBeInTheDocument()
    expect(within(section('Documents')).getByText('Old note')).toBeInTheDocument()
    expect(within(section('Links')).getByText('Old link')).toBeInTheDocument()
    expect(within(section('Files')).getByText('old.pdf')).toBeInTheDocument()
    expect(within(section('Documents')).queryByText('Keeper')).not.toBeInTheDocument()
    expect(within(section('Folders')).getByText(/^Deleted /)).toBeInTheDocument()
  })

  it('invites nothing and offers no emptying when the trash is empty', async () => {
    const mock = await signedInBackend()
    await renderApp('/trash', mock)

    expect(await screen.findByText('The trash is empty.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Empty trash' })).not.toBeInTheDocument()
  })

  it('is one click away in the sidebar and shows what was just deleted', async () => {
    const mock = await signedInBackend()
    const note = await mock.notes.createNote({ title: 'Doomed' })
    const { user, router } = await renderApp(`/doc/${note.id}`, mock)
    await screen.findByLabelText('Document title')
    await user.click(screen.getByRole('button', { name: 'Delete' }))
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Delete' }),
    )
    await waitFor(() => expect(router.state.location.pathname).toBe('/'))

    await user.click(screen.getByRole('link', { name: 'Trash' }))

    await screen.findByRole('heading', { name: 'Trash' })
    expect(await within(screen.getByRole('main')).findByText('Doomed')).toBeInTheDocument()
  })

  it('restores an item: it leaves the trash and is back in its place', async () => {
    const mock = await signedInBackend()
    const { note } = await withTrash(mock)
    const { user } = await renderApp('/trash', mock)
    await screen.findByRole('main')
    await page().findByText('Old note')

    await user.click(screen.getByRole('button', { name: 'Restore Old note' }))

    await waitFor(() => expect(page().queryByText('Old note')).not.toBeInTheDocument())
    expect((await mock.notes.listTrash()).notes).toEqual([])
    expect((await mock.notes.getNote(note.id)).title).toBe('Old note')
    // and the tree knows
    const tree = screen.getByRole('tree', { name: 'Documents' })
    await waitFor(() =>
      expect(within(tree).getByRole('link', { name: /Old note/ })).toBeInTheDocument(),
    )
  })

  it('explains why something cannot come back yet', async () => {
    const mock = await signedInBackend()
    const folder = await mock.notes.createFolder('Box')
    const note = await mock.notes.createNote({ title: 'Inside', folderId: folder.id })
    await mock.notes.deleteNote(note.id)
    await mock.notes.deleteFolder(folder.id)
    const { user } = await renderApp('/trash', mock)
    await screen.findByText('Inside')

    await user.click(screen.getByRole('button', { name: 'Restore Inside' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Restore its folder first.')
    expect(screen.getByText('Inside')).toBeInTheDocument()
  })

  it('deletes for good only after asking, and can be cancelled', async () => {
    const mock = await signedInBackend()
    await withTrash(mock)
    const { user } = await renderApp('/trash', mock)
    await screen.findByText('Old link')

    await user.click(screen.getByRole('button', { name: 'Delete Old link forever' }))
    let dialog = await screen.findByRole('alertdialog', { name: 'Delete this for good?' })
    expect(within(dialog).getByText(/“Old link” will be deleted permanently/)).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(screen.getByText('Old link')).toBeInTheDocument()
    expect((await mock.notes.listTrash()).links).toHaveLength(1)

    await user.click(screen.getByRole('button', { name: 'Delete Old link forever' }))
    dialog = await screen.findByRole('alertdialog')
    await user.click(within(dialog).getByRole('button', { name: 'Delete forever' }))

    await waitFor(() => expect(page().queryByText('Old link')).not.toBeInTheDocument())
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect((await mock.notes.listTrash()).links).toEqual([])
  })

  it('keeps the dialog open and says why when deleting fails', async () => {
    const mock = await signedInBackend()
    await withTrash(mock)
    vi.spyOn(mock.notes, 'deletePermanently').mockRejectedValue(
      new ApiError({ status: 0, code: 'network_error' }),
    )
    const { user } = await renderApp('/trash', mock)
    await screen.findByText('Old link')

    await user.click(screen.getByRole('button', { name: 'Delete Old link forever' }))
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', {
        name: 'Delete forever',
      }),
    )

    expect(await within(screen.getByRole('alertdialog')).findByRole('alert')).toHaveTextContent(
      'We could not reach the server',
    )
    expect(screen.getByText('Old link')).toBeInTheDocument()
  })

  it('empties everything after asking', async () => {
    const mock = await signedInBackend()
    await withTrash(mock)
    const { user } = await renderApp('/trash', mock)
    await screen.findByText('Old link')

    await user.click(screen.getByRole('button', { name: 'Empty trash' }))
    const dialog = await screen.findByRole('alertdialog', { name: 'Empty the trash?' })
    expect((await mock.notes.listTrash()).notes).toHaveLength(1)
    await user.click(within(dialog).getByRole('button', { name: 'Empty trash' }))

    expect(await screen.findByText('The trash is empty.')).toBeInTheDocument()
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    const trash = await mock.notes.listTrash()
    expect([trash.folders, trash.notes, trash.links, trash.attachments].flat()).toEqual([])
  })

  it('offers to try again when it cannot load', async () => {
    const mock = await signedInBackend()
    const list = vi
      .spyOn(mock.notes, 'listTrash')
      .mockRejectedValue(new ApiError({ status: 0, code: 'network_error' }))
    const { user } = await renderApp('/trash', mock)

    expect(await screen.findByRole('alert')).toHaveTextContent("We couldn't load the trash.")
    list.mockRestore()
    await user.click(screen.getByRole('button', { name: 'Try again' }))

    expect(await screen.findByText('The trash is empty.')).toBeInTheDocument()
  })

  it('speaks Spanish when the account does', async () => {
    const mock = await signedInBackend()
    await mock.auth.updateProfile({ locale: 'es' })
    await withTrash(mock)
    await renderApp('/trash', mock)

    expect(await screen.findByRole('heading', { name: 'Papelera' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Restaurar Old note' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Vaciar papelera' })).toBeInTheDocument()
  })
})
