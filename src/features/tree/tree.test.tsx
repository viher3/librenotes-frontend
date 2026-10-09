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
 * Alpha/ (folder)
 *   Sub/ (folder)
 *   Plan (document)
 *     Task (document)
 *       Subtask (document)
 *     Reference (link)
 * Standalone (document, no children)
 * Bookmark (link)
 */
async function seed(mock: Backend) {
  const { notes } = mock
  const alpha = await notes.createFolder('Alpha')
  const sub = await notes.createFolder('Sub', alpha.id)
  const plan = await notes.createNote({ title: 'Plan', folderId: alpha.id })
  const task = await notes.createNote({ title: 'Task', parentNoteId: plan.id })
  const subtask = await notes.createNote({ title: 'Subtask', parentNoteId: task.id })
  const reference = await notes.createLink({
    title: 'Reference',
    url: 'https://ref.example',
    parentNoteId: plan.id,
  })
  const standalone = await notes.createNote({ title: 'Standalone' })
  const bookmark = await notes.createLink({ title: 'Bookmark', url: 'https://bookmark.example' })
  return { alpha, sub, plan, task, subtask, reference, standalone, bookmark }
}

const tree = () => screen.getByRole('tree', { name: 'Documents' })
/** The row of an item, found by its visible label. */
const row = (label: string) => {
  const found = within(tree())
    .getAllByRole('treeitem')
    .find((item) =>
      item.querySelector(':scope > div [data-primary]')?.textContent?.trim().endsWith(label),
    )
  if (!found) throw new Error(`no tree row "${label}"`)
  return found
}
const hasRow = (label: string) =>
  within(tree())
    .queryAllByRole('treeitem')
    .some((item) =>
      item.querySelector(':scope > div [data-primary]')?.textContent?.trim().endsWith(label),
    )
const toggleOf = (label: string) => within(row(label)).getAllByRole('button')[0]
const rowDiv = (label: string) => row(label).querySelector(':scope > div') as HTMLElement

function dataTransfer() {
  const store = new Map<string, string>()
  return {
    setData: (type: string, value: string) => void store.set(type, value),
    getData: (type: string) => store.get(type) ?? '',
    effectAllowed: 'all',
    dropEffect: 'none',
    types: [] as string[],
  }
}

describe('tree: browsing', () => {
  it('lists the top level and loads a branch only when it is opened', async () => {
    const mock = await signedInBackend()
    await seed(mock)
    const contents = vi.spyOn(mock.notes, 'folderContents')
    const children = vi.spyOn(mock.notes, 'noteChildren')
    const { user } = await renderApp('/', mock)

    await waitFor(() => expect(hasRow('Alpha')).toBe(true))
    expect(hasRow('Standalone')).toBe(true)
    expect(hasRow('Bookmark')).toBe(true)
    expect(hasRow('Plan')).toBe(false)
    expect(contents.mock.calls.map((c) => c[0] ?? null)).toEqual([null])
    expect(children).not.toHaveBeenCalled()

    await user.click(toggleOf('Alpha'))

    await waitFor(() => expect(hasRow('Plan')).toBe(true))
    expect(hasRow('Sub')).toBe(true)
    expect(contents.mock.calls.map((c) => c[0] ?? null)).toContain(
      (await mock.notes.folderContents()).subfolders[0].id,
    )
    expect(row('Alpha')).toHaveAttribute('aria-expanded', 'true')
    expect(children).not.toHaveBeenCalled() // Plan is still closed
  })

  it('shows documents that hold others as expandable, and plain ones as leaves', async () => {
    const mock = await signedInBackend()
    await seed(mock)
    const { user } = await renderApp('/', mock)
    await waitFor(() => expect(hasRow('Alpha')).toBe(true))
    await user.click(toggleOf('Alpha'))
    await waitFor(() => expect(hasRow('Plan')).toBe(true))

    expect(row('Plan')).toHaveAttribute('aria-expanded', 'false')
    expect(row('Standalone')).not.toHaveAttribute('aria-expanded')

    await user.click(toggleOf('Plan'))
    await waitFor(() => expect(hasRow('Task')).toBe(true))
    expect(hasRow('Reference')).toBe(true)
    expect(row('Task')).toHaveAttribute('aria-level', '3')
    expect(row('Plan')).toHaveAttribute('aria-level', '2')
    expect(row('Task')).toHaveAttribute('aria-expanded', 'false') // it has a sub-document

    await user.click(toggleOf('Plan'))
    expect(hasRow('Task')).toBe(false)
  })

  it('opens links in a new tab, safely', async () => {
    const mock = await signedInBackend()
    await seed(mock)
    await renderApp('/', mock)

    await waitFor(() => expect(hasRow('Bookmark')).toBe(true))

    const link = within(row('Bookmark')).getByRole('link', {
      name: 'Bookmark (opens in a new tab)',
    })
    expect(link).toHaveAttribute('href', 'https://bookmark.example')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer nofollow')
  })

  it('remembers which branches are open', async () => {
    const mock = await signedInBackend()
    await seed(mock)
    const first = await renderApp('/', mock)
    await waitFor(() => expect(hasRow('Alpha')).toBe(true))
    await first.user.click(toggleOf('Alpha'))
    await waitFor(() => expect(hasRow('Plan')).toBe(true))
    first.unmount()

    await renderApp('/', mock)

    await waitFor(() => expect(hasRow('Plan')).toBe(true))
    expect(row('Alpha')).toHaveAttribute('aria-expanded', 'true')
  })

  it('navigates when a row is clicked', async () => {
    const mock = await signedInBackend()
    const { alpha, plan } = await seed(mock)
    const { user, router } = await renderApp('/', mock)
    await waitFor(() => expect(hasRow('Alpha')).toBe(true))

    await user.click(within(row('Alpha')).getByRole('link'))
    await waitFor(() => expect(router.state.location.pathname).toBe(`/folder/${alpha.id}`))

    await waitFor(() => expect(hasRow('Plan')).toBe(true))
    await user.click(within(row('Plan')).getByRole('link'))
    await waitFor(() => expect(router.state.location.pathname).toBe(`/doc/${plan.id}`))
  })

  it('opens the ancestors of the document being shown and highlights it', async () => {
    const mock = await signedInBackend()
    const { subtask } = await seed(mock)

    await renderApp(`/doc/${subtask.id}`, mock)

    await waitFor(() => expect(hasRow('Subtask')).toBe(true))
    for (const label of ['Alpha', 'Plan', 'Task'])
      expect(row(label)).toHaveAttribute('aria-expanded', 'true')
    expect(row('Subtask')).toHaveAttribute('aria-selected', 'true')
    expect(within(row('Subtask')).getByRole('link')).toHaveAttribute('aria-current', 'page')
    expect(row('Task')).toHaveAttribute('aria-selected', 'false')
  })

  it('says when there is nothing, and lets a failed branch be retried', async () => {
    const mock = await signedInBackend()
    const { alpha } = await seed(mock)
    const real = mock.notes.folderContents.bind(mock.notes)
    let broken = true
    vi.spyOn(mock.notes, 'folderContents').mockImplementation((id) =>
      id === alpha.id && broken
        ? Promise.reject(new ApiError({ status: 0, code: 'network_error' }))
        : real(id),
    )
    const { user } = await renderApp('/', mock)
    await waitFor(() => expect(hasRow('Alpha')).toBe(true))

    await user.click(toggleOf('Alpha'))
    expect(await screen.findByText("Couldn't load this branch.")).toBeInTheDocument()

    broken = false
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(hasRow('Plan')).toBe(true))
  })

  it('shows an empty tree as such', async () => {
    const mock = await signedInBackend()
    await renderApp('/', mock)

    await screen.findByRole('tree', { name: 'Documents' })
    expect(await within(tree()).findByText('Nothing here yet.')).toBeInTheDocument()
  })
})

describe('tree: keyboard', () => {
  const focusTree = async (user: Awaited<ReturnType<typeof renderApp>>['user']) => {
    await waitFor(() => expect(hasRow('Alpha')).toBe(true))
    tree().focus()
    await user.tab({ shift: true }).catch(() => {})
    ;(tree() as HTMLElement).focus()
  }

  it('is one tab stop that lands on the first row', async () => {
    const mock = await signedInBackend()
    await seed(mock)
    const { user } = await renderApp('/', mock)
    await waitFor(() => expect(hasRow('Alpha')).toBe(true))

    expect(tree()).toHaveAttribute('tabindex', '0')
    tree().focus()

    expect(row('Alpha')).toHaveFocus()
    await user.keyboard('{ArrowDown}')
    expect(row('Standalone')).toHaveFocus()
    const tabStops = within(tree())
      .getAllByRole('treeitem')
      .filter((item) => item.getAttribute('tabindex') === '0')
    expect(tabStops).toEqual([row('Standalone')])
    expect(tree()).toHaveAttribute('tabindex', '-1')
  })

  it('moves with the arrows, Home and End', async () => {
    const mock = await signedInBackend()
    await seed(mock)
    const { user } = await renderApp('/', mock)
    await focusTree(user)

    await user.keyboard('{ArrowDown}{ArrowDown}')
    expect(row('Bookmark')).toHaveFocus()
    await user.keyboard('{ArrowUp}')
    expect(row('Standalone')).toHaveFocus()
    await user.keyboard('{Home}')
    expect(row('Alpha')).toHaveFocus()
    await user.keyboard('{End}')
    expect(row('Bookmark')).toHaveFocus()
  })

  it('opens with Right, enters the branch, and closes with Left, which then goes to the parent', async () => {
    const mock = await signedInBackend()
    await seed(mock)
    const { user } = await renderApp('/', mock)
    await focusTree(user)
    expect(row('Alpha')).toHaveFocus()

    await user.keyboard('{ArrowRight}')
    await waitFor(() => expect(hasRow('Plan')).toBe(true))
    expect(row('Alpha')).toHaveAttribute('aria-expanded', 'true')
    expect(row('Alpha')).toHaveFocus()

    await user.keyboard('{ArrowRight}')
    expect(row('Sub')).toHaveFocus() // first child: folders come first

    await user.keyboard('{ArrowLeft}')
    expect(row('Alpha')).toHaveFocus() // a leaf folder... Sub is a folder, closed: Left goes to the parent

    await user.keyboard('{ArrowLeft}')
    expect(row('Alpha')).toHaveAttribute('aria-expanded', 'false')
    expect(hasRow('Plan')).toBe(false)
  })

  it('opens the focused item with Enter', async () => {
    const mock = await signedInBackend()
    const { standalone } = await seed(mock)
    const { user, router } = await renderApp('/', mock)
    await focusTree(user)

    await user.keyboard('{ArrowDown}{Enter}')

    expect(router.state.location.pathname).toBe(`/doc/${standalone.id}`)
  })

  it('opens the actions menu with the context-menu key and closes it with Escape', async () => {
    const mock = await signedInBackend()
    await seed(mock)
    const { user } = await renderApp('/', mock)
    await focusTree(user)

    await user.keyboard('{ContextMenu}')

    const menu = await screen.findByRole('menu', { name: 'Actions for Alpha' })
    expect(
      within(menu)
        .getAllByRole('menuitem')
        .map((i) => i.textContent),
    ).toEqual(['New document inside', 'New folder inside', 'Rename', 'Move to…', 'Delete'])
    expect(within(menu).getAllByRole('menuitem')[0]).toHaveFocus()
    await user.keyboard('{ArrowDown}')
    expect(within(menu).getAllByRole('menuitem')[1]).toHaveFocus()
    await user.keyboard('{End}')
    expect(within(menu).getAllByRole('menuitem')[4]).toHaveFocus()

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(within(row('Alpha')).getByRole('button', { name: 'Actions for Alpha' })).toHaveFocus()
  })

  it('offers each kind of item only the actions that make sense for it', async () => {
    const mock = await signedInBackend()
    await seed(mock)
    const { user } = await renderApp('/', mock)
    await waitFor(() => expect(hasRow('Standalone')).toBe(true))
    const labels = async (name: string) => {
      await user.click(within(row(name)).getByRole('button', { name: `Actions for ${name}` }))
      const menu = await screen.findByRole('menu')
      const result = within(menu)
        .getAllByRole('menuitem')
        .map((i) => i.textContent)
      await user.keyboard('{Escape}')
      return result
    }

    expect(await labels('Standalone')).toEqual(['New sub-document', 'Move to…', 'Delete'])
    expect(await labels('Bookmark')).toEqual(['Move to…', 'Delete'])
  })
})

describe('tree: creating, renaming and deleting', () => {
  it('creates a document inside a folder and opens it', async () => {
    const mock = await signedInBackend()
    const { alpha } = await seed(mock)
    const { user, router } = await renderApp('/', mock)
    await waitFor(() => expect(hasRow('Alpha')).toBe(true))

    await user.click(within(row('Alpha')).getByRole('button', { name: 'Actions for Alpha' }))
    await user.click(await screen.findByRole('menuitem', { name: 'New document inside' }))

    await screen.findByLabelText('Document title')
    const created = (await mock.notes.folderContents(alpha.id)).notes.find(
      (n) => n.title === 'Untitled',
    )
    expect(created).toBeDefined()
    expect(router.state.location.pathname).toBe(`/doc/${created!.id}`)
    await waitFor(() => expect(row('Alpha')).toHaveAttribute('aria-expanded', 'true'))
    await waitFor(() => expect(hasRow('Untitled')).toBe(true))
  })

  it('creates a sub-document under a document', async () => {
    const mock = await signedInBackend()
    const { standalone } = await seed(mock)
    const { user } = await renderApp('/', mock)
    await waitFor(() => expect(hasRow('Standalone')).toBe(true))

    await user.click(
      within(row('Standalone')).getByRole('button', { name: 'Actions for Standalone' }),
    )
    await user.click(await screen.findByRole('menuitem', { name: 'New sub-document' }))

    await screen.findByLabelText('Document title')
    const children = await mock.notes.noteChildren(standalone.id)
    expect(children.notes.map((n) => n.title)).toEqual(['Untitled'])
    await waitFor(() => expect(row('Standalone')).toHaveAttribute('aria-expanded', 'true'))
    expect(screen.getByRole('navigation', { name: 'Breadcrumb' })).toHaveTextContent('Standalone')
  })

  it('creates a folder at the top level, validating the name', async () => {
    const mock = await signedInBackend()
    const { user } = await renderApp('/', mock)
    await user.click(await screen.findByRole('button', { name: 'New folder' }))

    const dialog = await screen.findByRole('dialog', { name: 'New folder' })
    expect(within(dialog).getByLabelText('Name')).toHaveFocus()
    await user.click(within(dialog).getByRole('button', { name: 'Create' }))
    expect(await within(dialog).findByText('A name is required')).toBeInTheDocument()

    await user.type(within(dialog).getByLabelText('Name'), '  Ideas  ')
    await user.click(within(dialog).getByRole('button', { name: 'Create' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect((await mock.notes.folderContents()).subfolders.map((f) => f.name)).toEqual(['Ideas'])
    await waitFor(() => expect(hasRow('Ideas')).toBe(true))
  })

  it('creates a folder inside another and shows it', async () => {
    const mock = await signedInBackend()
    const { alpha } = await seed(mock)
    const { user } = await renderApp('/', mock)
    await waitFor(() => expect(hasRow('Alpha')).toBe(true))

    await user.click(within(row('Alpha')).getByRole('button', { name: 'Actions for Alpha' }))
    await user.click(await screen.findByRole('menuitem', { name: 'New folder inside' }))
    await user.type(await screen.findByLabelText('Name'), 'Archive')
    await user.click(screen.getByRole('button', { name: 'Create' }))

    await waitFor(() => expect(hasRow('Archive')).toBe(true))
    expect(
      (await mock.notes.folderContents(alpha.id)).subfolders.map((f) => f.name).sort(),
    ).toEqual(['Archive', 'Sub'])
  })

  it('keeps the dialog open and explains when the folder cannot be created', async () => {
    const mock = await signedInBackend()
    vi.spyOn(mock.notes, 'createFolder').mockRejectedValue(
      new ApiError({ status: 0, code: 'network_error' }),
    )
    const { user } = await renderApp('/', mock)
    await user.click(await screen.findByRole('button', { name: 'New folder' }))

    await user.type(await screen.findByLabelText('Name'), 'Ideas')
    await user.click(screen.getByRole('button', { name: 'Create' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('We could not reach the server')
    expect(screen.getByRole('dialog', { name: 'New folder' })).toBeInTheDocument()
    expect(screen.getByLabelText('Name')).toHaveValue('Ideas')
    expect(screen.getByRole('button', { name: 'Create' })).toBeEnabled()
  })

  it('renames a folder', async () => {
    const mock = await signedInBackend()
    const { alpha } = await seed(mock)
    const { user } = await renderApp('/', mock)
    await waitFor(() => expect(hasRow('Alpha')).toBe(true))

    await user.click(within(row('Alpha')).getByRole('button', { name: 'Actions for Alpha' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Rename' }))
    const field = await screen.findByLabelText('Name')
    expect(field).toHaveValue('Alpha')
    await user.clear(field)
    await user.type(field, 'Beta')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(hasRow('Beta')).toBe(true))
    expect(hasRow('Alpha')).toBe(false)
    expect((await mock.notes.folderContents(alpha.id)).folder?.name).toBe('Beta')
  })

  it('deletes a folder after confirming, taking everything in it to the trash', async () => {
    const mock = await signedInBackend()
    const { alpha, plan } = await seed(mock)
    const { user } = await renderApp('/', mock)
    await waitFor(() => expect(hasRow('Alpha')).toBe(true))

    await user.click(within(row('Alpha')).getByRole('button', { name: 'Actions for Alpha' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Delete' }))
    const dialog = await screen.findByRole('alertdialog', { name: 'Delete this folder?' })
    expect(
      within(dialog).getByText('“Alpha” and everything in it will be moved to the trash.'),
    ).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus()
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }))

    await waitFor(() => expect(hasRow('Alpha')).toBe(false))
    const trash = await mock.notes.listTrash()
    expect(trash.folders.map((f) => f.id)).toContain(alpha.id)
    expect(trash.notes.map((n) => n.id)).toContain(plan.id)
  })

  it('warns that deleting a document takes what is under it', async () => {
    const mock = await signedInBackend()
    const { plan, task } = await seed(mock)
    const { user } = await renderApp(`/doc/${plan.id}`, mock)
    await waitFor(() => expect(hasRow('Plan')).toBe(true))
    await user.click(toggleOf('Plan'))
    await waitFor(() => expect(hasRow('Task')).toBe(true))

    await user.click(within(row('Plan')).getByRole('button', { name: 'Actions for Plan' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Delete' }))

    const dialog = await screen.findByRole('alertdialog', { name: 'Delete this document?' })
    expect(
      within(dialog).getByText('“Plan” and everything under it will be moved to the trash.'),
    ).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }))

    await waitFor(() => expect(hasRow('Plan')).toBe(false))
    expect((await mock.notes.listTrash()).notes.map((n) => n.id)).toEqual([plan.id])
    await expect(mock.notes.noteChildren(plan.id)).rejects.toMatchObject({ status: 404 })
    expect((await mock.notes.listNotes()).items.map((n) => n.id)).not.toContain(task.id)
  })

  it('goes home when the page being shown is deleted from the tree, including from inside a deleted folder', async () => {
    const mock = await signedInBackend()
    const { subtask } = await seed(mock)
    const { user, router } = await renderApp(`/doc/${subtask.id}`, mock)
    await waitFor(() => expect(hasRow('Subtask')).toBe(true))

    await user.click(within(row('Alpha')).getByRole('button', { name: 'Actions for Alpha' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Delete' }))
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Delete' }),
    )

    await screen.findByRole('heading', { name: 'Your documents' })
    expect(router.state.location.pathname).toBe('/')
  })

  it('deletes a link, and explains when deleting fails', async () => {
    const mock = await signedInBackend()
    await seed(mock)
    const del = vi
      .spyOn(mock.notes, 'deleteLink')
      .mockRejectedValueOnce(new ApiError({ status: 404, code: 'link.not_found' }))
    const { user } = await renderApp('/', mock)
    await waitFor(() => expect(hasRow('Bookmark')).toBe(true))

    await user.click(within(row('Bookmark')).getByRole('button', { name: 'Actions for Bookmark' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Delete' }))
    await user.click(
      within(await screen.findByRole('alertdialog', { name: 'Delete this link?' })).getByRole(
        'button',
        { name: 'Delete' },
      ),
    )
    expect(await within(screen.getByRole('alertdialog')).findByRole('alert')).toHaveTextContent(
      'This link no longer exists.',
    )

    del.mockRestore()
    await user.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Delete' }),
    )
    await waitFor(() => expect(hasRow('Bookmark')).toBe(false))
  })
})

describe('tree: moving', () => {
  const openMoveDialog = async (
    user: Awaited<ReturnType<typeof renderApp>>['user'],
    label: string,
  ) => {
    await user.click(within(row(label)).getByRole('button', { name: `Actions for ${label}` }))
    await user.click(await screen.findByRole('menuitem', { name: 'Move to…' }))
    return screen.findByRole('dialog', { name: `Move “${label}”` })
  }

  it('moves a document into a folder with the dialog', async () => {
    const mock = await signedInBackend()
    const { alpha, standalone } = await seed(mock)
    const { user } = await renderApp('/', mock)
    await waitFor(() => expect(hasRow('Standalone')).toBe(true))

    const dialog = await openMoveDialog(user, 'Standalone')
    expect(within(dialog).getByText('Top level')).toBeInTheDocument()
    await user.click(await within(dialog).findByRole('button', { name: 'Move to Alpha' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect((await mock.notes.getNote(standalone.id)).folderId).toBe(alpha.id)
    await waitFor(() => expect(row('Alpha')).toHaveAttribute('aria-expanded', 'true'))
  })

  it('moves a document under another document, reaching it through the folders', async () => {
    const mock = await signedInBackend()
    const { task, standalone } = await seed(mock)
    const { user } = await renderApp('/', mock)
    await waitFor(() => expect(hasRow('Standalone')).toBe(true))

    const dialog = await openMoveDialog(user, 'Standalone')
    await user.click(await within(dialog).findByRole('button', { name: 'Expand Alpha' }))
    await user.click(await within(dialog).findByRole('button', { name: 'Expand Plan' }))
    await user.click(await within(dialog).findByRole('button', { name: 'Move to Task' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect((await mock.notes.getNote(standalone.id)).parentNoteId).toBe(task.id)
  })

  it('moves a document back to the top level', async () => {
    const mock = await signedInBackend()
    const { task } = await seed(mock)
    const { user } = await renderApp(`/doc/${task.id}`, mock)
    await waitFor(() => expect(hasRow('Task')).toBe(true))

    const dialog = await openMoveDialog(user, 'Task')
    await user.click(within(dialog).getByRole('button', { name: 'Move to Top level' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(await mock.notes.getNote(task.id)).toMatchObject({
      parentNoteId: null,
      folderId: null,
      path: [],
    })
  })

  it('does not offer the item itself, nor anything inside it, as a destination', async () => {
    const mock = await signedInBackend()
    const { plan } = await seed(mock)
    const { user } = await renderApp(`/doc/${plan.id}`, mock)
    await waitFor(() => expect(hasRow('Plan')).toBe(true))

    const dialog = await openMoveDialog(user, 'Plan')
    await user.click(await within(dialog).findByRole('button', { name: 'Expand Alpha' }))

    expect(await within(dialog).findByText('This is the item being moved')).toBeInTheDocument()
    expect(within(dialog).queryByRole('button', { name: 'Move to Plan' })).not.toBeInTheDocument()
    expect(within(dialog).queryByRole('button', { name: 'Expand Plan' })).not.toBeInTheDocument() // its children are not reachable
    expect(within(dialog).queryByRole('button', { name: 'Move to Task' })).not.toBeInTheDocument()
  })

  it('only offers folders as destinations for a folder', async () => {
    const mock = await signedInBackend()
    const { alpha } = await seed(mock)
    const other = await mock.notes.createFolder('Other')
    const { user } = await renderApp('/', mock)
    await waitFor(() => expect(hasRow('Alpha')).toBe(true))

    const dialog = await openMoveDialog(user, 'Alpha')

    expect(await within(dialog).findByRole('button', { name: 'Move to Other' })).toBeInTheDocument()
    expect(
      within(dialog).queryByRole('button', { name: 'Move to Standalone' }),
    ).not.toBeInTheDocument()
    expect(within(dialog).getByText('This is the item being moved')).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Move to Other' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect((await mock.notes.folderContents(alpha.id)).folder?.parentFolderId).toBe(other.id)
  })

  it('shows why a move failed and stays open', async () => {
    const mock = await signedInBackend()
    await seed(mock)
    vi.spyOn(mock.notes, 'moveNote').mockRejectedValue(
      new ApiError({ status: 422, code: 'note.cycle_detected' }),
    )
    const { user } = await renderApp('/', mock)
    await waitFor(() => expect(hasRow('Standalone')).toBe(true))

    const dialog = await openMoveDialog(user, 'Standalone')
    await user.click(await within(dialog).findByRole('button', { name: 'Move to Top level' }))

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      "A document can't be moved inside itself",
    )
    expect(within(dialog).getByRole('button', { name: 'Move to Top level' })).toBeEnabled()
  })

  it('moves a link', async () => {
    const mock = await signedInBackend()
    const { alpha, bookmark } = await seed(mock)
    const { user } = await renderApp('/', mock)
    await waitFor(() => expect(hasRow('Bookmark')).toBe(true))

    const dialog = await openMoveDialog(user, 'Bookmark')
    await user.click(await within(dialog).findByRole('button', { name: 'Move to Alpha' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect((await mock.notes.getLink(bookmark.id)).folderId).toBe(alpha.id)
  })
})

describe('tree: drag and drop', () => {
  const drag = (from: string, onto: HTMLElement) => {
    const transfer = dataTransfer()
    fireEvent.dragStart(rowDiv(from), { dataTransfer: transfer })
    fireEvent.dragOver(onto, { dataTransfer: transfer })
    return transfer
  }

  it('moves a document onto a folder', async () => {
    const mock = await signedInBackend()
    const { alpha, standalone } = await seed(mock)
    await renderApp('/', mock)
    await waitFor(() => expect(hasRow('Standalone')).toBe(true))

    const transfer = drag('Standalone', rowDiv('Alpha'))
    expect(rowDiv('Alpha').className).toContain('bg-indigo-100') // highlighted as a drop target
    fireEvent.drop(rowDiv('Alpha'), { dataTransfer: transfer })

    await waitFor(async () =>
      expect((await mock.notes.getNote(standalone.id)).folderId).toBe(alpha.id),
    )
    await waitFor(() => expect(row('Alpha')).toHaveAttribute('aria-expanded', 'true'))
  })

  it('moves a document under another document, and a link too', async () => {
    const mock = await signedInBackend()
    const { standalone, bookmark } = await seed(mock)
    const { alpha, plan } = await seed(mock) // a second set, only to have a document to drop on
    void alpha
    await renderApp('/', mock)
    await waitFor(() => expect(hasRow('Bookmark')).toBe(true))

    // Dropping on a document that is at the top level: Standalone (first seed) receives Bookmark (first seed)
    const t1 = drag('Bookmark', rowDiv('Standalone'))
    fireEvent.drop(rowDiv('Standalone'), { dataTransfer: t1 })

    await waitFor(async () =>
      expect((await mock.notes.getLink(bookmark.id)).parentNoteId).toBe(standalone.id),
    )
    void plan
  })

  it('moves an item to the top level by dropping it on the empty area', async () => {
    const mock = await signedInBackend()
    const { task } = await seed(mock)
    await renderApp(`/doc/${task.id}`, mock)
    await waitFor(() => expect(hasRow('Task')).toBe(true))

    const transfer = dataTransfer()
    fireEvent.dragStart(rowDiv('Task'), { dataTransfer: transfer })
    fireEvent.dragOver(tree(), { dataTransfer: transfer })
    fireEvent.drop(tree(), { dataTransfer: transfer })

    await waitFor(async () => expect((await mock.notes.getNote(task.id)).parentNoteId).toBeNull())
  })

  it('does not accept a folder dropped on a document, nor an item dropped on itself', async () => {
    const mock = await signedInBackend()
    const { alpha, standalone } = await seed(mock)
    const move = vi.spyOn(mock.notes, 'moveFolder')
    const moveNote = vi.spyOn(mock.notes, 'moveNote')
    await renderApp('/', mock)
    await waitFor(() => expect(hasRow('Standalone')).toBe(true))

    const folderOnNote = dataTransfer()
    fireEvent.dragStart(rowDiv('Alpha'), { dataTransfer: folderOnNote })
    const accepted = fireEvent.dragOver(rowDiv('Standalone'), { dataTransfer: folderOnNote })
    expect(accepted).toBe(true) // not prevented: the row does not take it
    expect(rowDiv('Standalone').className).not.toContain('bg-indigo-100')
    fireEvent.drop(rowDiv('Standalone'), { dataTransfer: folderOnNote })

    const noteOnSelf = dataTransfer()
    fireEvent.dragStart(rowDiv('Standalone'), { dataTransfer: noteOnSelf })
    fireEvent.dragOver(rowDiv('Standalone'), { dataTransfer: noteOnSelf })
    fireEvent.drop(rowDiv('Standalone'), { dataTransfer: noteOnSelf })

    await new Promise((r) => setTimeout(r, 30))
    expect(move).not.toHaveBeenCalled()
    expect(moveNote).not.toHaveBeenCalled()
    expect((await mock.notes.getNote(standalone.id)).folderId).toBeNull()
    expect((await mock.notes.folderContents(alpha.id)).folder?.parentFolderId).toBeNull()
  })

  it('tells the user when the server refuses a drop, e.g. a document into its own sub-document', async () => {
    const mock = await signedInBackend()
    const { plan, task } = await seed(mock)
    await renderApp(`/doc/${task.id}`, mock)
    await waitFor(() => expect(hasRow('Task')).toBe(true))

    const transfer = drag('Plan', rowDiv('Task'))
    fireEvent.drop(rowDiv('Task'), { dataTransfer: transfer })

    expect(
      await screen.findByText(
        "A document can't be moved inside itself or inside one of its own sub-documents.",
      ),
    ).toBeInTheDocument()
    expect((await mock.notes.getNote(plan.id)).parentNoteId).toBeNull()
  })
})

describe('folder page and breadcrumbs', () => {
  it('shows the contents of a folder with the way back up', async () => {
    const mock = await signedInBackend()
    const { sub, plan } = await seed(mock)
    const { user, router } = await renderApp(
      `/folder/${(await mock.notes.folderContents()).subfolders[0].id}`,
      mock,
    )

    const main = within(await screen.findByRole('main'))
    expect(await main.findByRole('heading', { name: 'Alpha' })).toBeInTheDocument()
    const crumbs = main.getByRole('navigation', { name: 'Breadcrumb' })
    expect(within(crumbs).getByRole('link', { name: 'Documents' })).toHaveAttribute('href', '/')
    expect(crumbs.querySelector('[aria-current=page]')).toHaveTextContent('Alpha')
    expect(await main.findByRole('link', { name: /Sub/ })).toHaveAttribute(
      'href',
      `/folder/${sub.id}`,
    )
    expect(main.getByRole('link', { name: /Plan/ })).toHaveAttribute('href', `/doc/${plan.id}`)

    await user.click(main.getByRole('link', { name: /Sub/ }))
    await main.findByRole('heading', { name: 'Sub' })
    const nested = main.getByRole('navigation', { name: 'Breadcrumb' })
    expect(within(nested).getByRole('link', { name: 'Alpha' })).toHaveAttribute(
      'href',
      expect.stringMatching(/^\/folder\//),
    )
    expect(router.state.location.pathname).toBe(`/folder/${sub.id}`)
  })

  it('creates a document in the folder and says when it is empty', async () => {
    const mock = await signedInBackend()
    const { sub } = await seed(mock)
    const { user } = await renderApp(`/folder/${sub.id}`, mock)

    const main = within(await screen.findByRole('main'))
    expect(await main.findByText('This folder is empty.')).toBeInTheDocument()

    await user.click(main.getByRole('button', { name: 'New document here' }))

    await screen.findByLabelText('Document title')
    expect((await mock.notes.folderContents(sub.id)).notes).toHaveLength(1)
  })

  it('explains that a folder that does not exist does not', async () => {
    const mock = await signedInBackend()
    await renderApp('/folder/00000000-0000-4000-8000-000000000000', mock)

    expect(
      await screen.findByRole('heading', { name: "This folder doesn't exist" }),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to documents' })).toHaveAttribute('href', '/')
  })

  it('shows where a document sits, with links up the tree', async () => {
    const mock = await signedInBackend()
    const { alpha, plan, task, subtask } = await seed(mock)
    await renderApp(`/doc/${subtask.id}`, mock)

    const crumbs = await screen.findByRole('navigation', { name: 'Breadcrumb' })
    const links = within(crumbs).getAllByRole('link')
    expect(links.map((l) => [l.textContent, l.getAttribute('href')])).toEqual([
      ['Documents', '/'],
      ['Alpha', `/folder/${alpha.id}`],
      ['Plan', `/doc/${plan.id}`],
      ['Task', `/doc/${task.id}`],
    ])
    expect(crumbs.querySelector('[aria-current=page]')).toHaveTextContent('Subtask')
  })

  it('keeps the breadcrumb in step with the title being typed', async () => {
    const mock = await signedInBackend()
    const { standalone } = await seed(mock)
    const { user } = await renderApp(`/doc/${standalone.id}`, mock)
    const title = await screen.findByLabelText('Document title')

    await user.clear(title)
    await user.type(title, 'Renamed')

    expect(
      screen.getByRole('navigation', { name: 'Breadcrumb' }).querySelector('[aria-current=page]'),
    ).toHaveTextContent('Renamed')
    await waitFor(() => expect(hasRow('Renamed')).toBe(true)) // and the tree follows once it is saved
  })
})

describe('sub-documents panel', () => {
  it('lists what is under a document and adds another', async () => {
    const mock = await signedInBackend()
    const { plan, task, reference } = await seed(mock)
    const { user, router } = await renderApp(`/doc/${plan.id}`, mock)

    const panel = await screen.findByRole('region', { name: 'Sub-documents' })
    expect(await within(panel).findByRole('link', { name: /Task/ })).toHaveAttribute(
      'href',
      `/doc/${task.id}`,
    )
    expect(within(panel).getByRole('link', { name: /Reference/ })).toHaveAttribute(
      'href',
      'https://ref.example',
    )
    void reference

    await user.click(within(panel).getByRole('button', { name: 'Add sub-document' }))

    await waitFor(() => expect(router.state.location.pathname).not.toBe(`/doc/${plan.id}`))
    const children = await mock.notes.noteChildren(plan.id)
    expect(children.notes.map((n) => n.title).sort()).toEqual(['Task', 'Untitled'])
  })

  it('says when there are none', async () => {
    const mock = await signedInBackend()
    const { standalone } = await seed(mock)
    await renderApp(`/doc/${standalone.id}`, mock)

    const panel = await screen.findByRole('region', { name: 'Sub-documents' })
    expect(await within(panel).findByText('No sub-documents yet.')).toBeInTheDocument()
  })
})
