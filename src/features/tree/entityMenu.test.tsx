import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ACCOUNT, createBackend, renderApp } from '@/test/renderApp'

async function signedInBackend() {
  const mock = await createBackend()
  await mock.auth.login(ACCOUNT.email, ACCOUNT.password)
  return mock
}

/** The first card of the page showing the item (the tree has a row for it too, and the home page lists it twice). */
const card = async (name: RegExp) =>
  (await within(await screen.findByRole('main')).findAllByRole('link', { name }))[0]!

const menuItems = () => screen.getAllByRole('menuitem').map((item) => item.textContent)

describe('context menu of documents and links', () => {
  it('offers Pin, Edit, Move and Delete on a document card', async () => {
    const mock = await signedInBackend()
    await mock.notes.createNote({ title: 'Standalone' })
    await renderApp('/', mock)

    fireEvent.contextMenu(await card(/Standalone/))

    expect(menuItems()).toEqual(['Pin', 'Edit', 'Move to…', 'Delete'])
  })

  it('has no Pin for a link', async () => {
    const mock = await signedInBackend()
    await mock.notes.createLink({ title: 'Bookmark', url: 'https://bookmark.example' })
    await renderApp('/links', mock)

    fireEvent.contextMenu(await card(/Bookmark/))

    expect(menuItems()).toEqual(['Edit', 'Move to…', 'Delete'])
  })

  it('pins and unpins a document', async () => {
    const mock = await signedInBackend()
    const note = await mock.notes.createNote({ title: 'Standalone' })
    const { user } = await renderApp('/', mock)

    fireEvent.contextMenu(await card(/Standalone/))
    await user.click(screen.getByRole('menuitem', { name: 'Pin' }))
    await waitFor(async () => expect((await mock.notes.getNote(note.id)).pinned).toBe(true))

    fireEvent.contextMenu(await card(/Standalone/))
    expect(await screen.findByRole('menuitem', { name: 'Unpin' })).toBeInTheDocument()
  })

  it('opens the document ready to edit', async () => {
    const mock = await signedInBackend()
    await mock.notes.createNote({ title: 'Standalone' })
    const { user } = await renderApp('/', mock)

    fireEvent.contextMenu(await card(/Standalone/))
    await user.click(screen.getByRole('menuitem', { name: 'Edit' }))

    expect(await screen.findByRole('button', { name: /^Save/ })).toBeInTheDocument()
  })

  it('asks before deleting and then removes the item', async () => {
    const mock = await signedInBackend()
    const link = await mock.notes.createLink({ title: 'Bookmark', url: 'https://bookmark.example' })
    const { user } = await renderApp('/links', mock)

    fireEvent.contextMenu(await card(/Bookmark/))
    await user.click(screen.getByRole('menuitem', { name: 'Delete' }))
    await user.click(await screen.findByRole('button', { name: 'Delete' }))

    await waitFor(() => expect(screen.queryByRole('link', { name: /Bookmark/ })).toBeNull())
    expect((await mock.notes.listLinks()).items.map((l) => l.id)).not.toContain(link.id)
  })

  it('closes with Escape', async () => {
    const mock = await signedInBackend()
    await mock.notes.createNote({ title: 'Standalone' })
    const { user } = await renderApp('/', mock)

    fireEvent.contextMenu(await card(/Standalone/))
    await user.keyboard('{Escape}')

    expect(screen.queryByRole('menu')).toBeNull()
  })
})
