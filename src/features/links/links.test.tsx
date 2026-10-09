import { screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/data/errors'
import { AUTOSAVE_DEFAULTS } from '@/features/documents/useAutosave'
import { ACCOUNT, createBackend, renderApp } from '@/test/renderApp'

type Backend = Awaited<ReturnType<typeof createBackend>>
type App = Awaited<ReturnType<typeof renderApp>>

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

const status = () =>
  screen
    .getAllByRole('status')
    .find((el) => /Saved|Saving|save|Fix the web|required/i.test(el.textContent ?? ''))!

async function openLink(
  mock: Backend,
  input: Partial<Parameters<Backend['notes']['createLink']>[0]> = {},
) {
  const link = await mock.notes.createLink({
    title: 'Symfony',
    url: 'https://symfony.com',
    note: 'Docs',
    tags: ['dev'],
    ...input,
  })
  const app = await renderApp(`/link/${link.id}`, mock)
  await screen.findByLabelText('Link title')
  return { link, ...app }
}

describe('link page', () => {
  it('shows the link with its address, note, tags and where it sits', async () => {
    const mock = await signedInBackend()
    const folder = await mock.notes.createFolder('Reading')
    await openLink(mock, { folderId: folder.id })

    expect(screen.getByLabelText('Link title')).toHaveValue('Symfony')
    expect(screen.getByLabelText('Web address')).toHaveValue('https://symfony.com')
    expect(screen.getByLabelText('Note')).toHaveValue('Docs')
    expect(screen.getByRole('link', { name: 'dev' })).toHaveAttribute('href', '/tag/dev')
    const crumbs = screen.getByRole('navigation', { name: 'Breadcrumb' })
    expect(within(crumbs).getByRole('link', { name: 'Reading' })).toHaveAttribute(
      'href',
      `/folder/${folder.id}`,
    )
    expect(crumbs.querySelector('[aria-current=page]')).toHaveTextContent('Symfony')
    expect(document.title).toBe('Symfony · LibreNotes')
    expect(status()).toHaveTextContent('Saved')
  })

  it('opens the address in a new tab, safely', async () => {
    const mock = await signedInBackend()
    await openLink(mock)

    const open = screen.getByRole('link', { name: 'Open Symfony in a new tab' })
    expect(open).toHaveAttribute('href', 'https://symfony.com')
    expect(open).toHaveAttribute('target', '_blank')
    expect(open).toHaveAttribute('rel', 'noopener noreferrer nofollow')
  })

  it('saves what is edited after a pause: only the changed fields, the address trimmed, an empty note as none', async () => {
    const mock = await signedInBackend()
    const { link, user } = await openLink(mock)
    const update = vi.spyOn(mock.notes, 'updateNote')
    const updateLink = vi.spyOn(mock.notes, 'updateLink')
    void update

    const address = screen.getByLabelText('Web address')
    await user.clear(address)
    await user.type(address, '  https://symfony.com/doc  ')
    await waitFor(() => expect(status()).toHaveTextContent('Saved'))
    expect(updateLink).toHaveBeenLastCalledWith(link.id, { url: 'https://symfony.com/doc' })

    await user.clear(screen.getByLabelText('Note'))
    await waitFor(() => expect(updateLink).toHaveBeenLastCalledWith(link.id, { note: null }))
    await waitFor(() => expect(status()).toHaveTextContent('Saved'))
    expect(await mock.notes.getLink(link.id)).toMatchObject({
      url: 'https://symfony.com/doc',
      note: null,
    })
  })

  it('renames the link, and the tree and the breadcrumb follow', async () => {
    const mock = await signedInBackend()
    const { link, user } = await openLink(mock)
    const title = screen.getByLabelText('Link title')

    await user.clear(title)
    await user.type(title, 'Renamed')

    await waitFor(async () => expect((await mock.notes.getLink(link.id)).title).toBe('Renamed'))
    expect(document.title).toBe('Renamed · LibreNotes')
    expect(
      screen.getByRole('navigation', { name: 'Breadcrumb' }).querySelector('[aria-current=page]'),
    ).toHaveTextContent('Renamed')
    const tree = screen.getByRole('tree', { name: 'Documents' })
    await waitFor(() =>
      expect(within(tree).getByRole('link', { name: 'Renamed' })).toBeInTheDocument(),
    )
  })

  it('adds and removes tags', async () => {
    const mock = await signedInBackend()
    const { link, user } = await openLink(mock)

    await user.type(screen.getByRole('combobox', { name: 'Add tag' }), 'Reading{Enter}')
    await waitFor(async () =>
      expect((await mock.notes.getLink(link.id)).tags).toEqual(['dev', 'reading']),
    )
    await user.click(screen.getByRole('button', { name: 'Remove tag dev' }))
    await waitFor(async () => expect((await mock.notes.getLink(link.id)).tags).toEqual(['reading']))
  })

  it.each([
    'example.com',
    'javascript:alert(1)',
    'ftp://files.example',
    'https://',
    'data:text/html;base64,AAAA',
  ])('does not save %s as the address, explains why, and hides the open button', async (bad) => {
    const mock = await signedInBackend()
    const { link, user } = await openLink(mock)
    const updateLink = vi.spyOn(mock.notes, 'updateLink')

    const address = screen.getByLabelText('Web address')
    await user.clear(address)
    await user.type(address, bad)

    expect(
      await screen.findByText('Enter a full web address starting with http:// or https://'),
    ).toBeInTheDocument()
    expect(address).toHaveAttribute('aria-invalid', 'true')
    expect(status()).toHaveTextContent('Fix the web address to save')
    expect(screen.queryByRole('link', { name: /Open Symfony/ })).not.toBeInTheDocument()
    await new Promise((r) => setTimeout(r, 80))
    expect(updateLink).not.toHaveBeenCalled()
    expect((await mock.notes.getLink(link.id)).url).toBe('https://symfony.com')
  })

  it('still saves the other fields while the address is wrong', async () => {
    const mock = await signedInBackend()
    const { link, user } = await openLink(mock)
    const address = screen.getByLabelText('Web address')
    await user.clear(address)
    await user.type(address, 'nope')

    await user.type(screen.getByLabelText('Note'), ' more')

    await waitFor(async () => expect((await mock.notes.getLink(link.id)).note).toBe('Docs more'))
    expect((await mock.notes.getLink(link.id)).url).toBe('https://symfony.com')
  })

  it('does not save an empty title and puts the last one back on leaving the field', async () => {
    const mock = await signedInBackend()
    const { link, user } = await openLink(mock)
    const updateLink = vi.spyOn(mock.notes, 'updateLink')
    const title = screen.getByLabelText('Link title')

    await user.clear(title)
    expect(status()).toHaveTextContent('This field is required')
    await new Promise((r) => setTimeout(r, 80))
    expect(updateLink).not.toHaveBeenCalled()

    await user.tab()
    expect(title).toHaveValue('Symfony')
    await waitFor(() => expect(status()).toHaveTextContent('Saved'))
    expect((await mock.notes.getLink(link.id)).title).toBe('Symfony')
  })

  it('keeps what was typed when saving fails, and retries', async () => {
    const mock = await signedInBackend()
    const { link, user } = await openLink(mock)
    vi.spyOn(mock.notes, 'updateLink').mockRejectedValueOnce(
      new ApiError({ status: 0, code: 'network_error' }),
    )

    await user.type(screen.getByLabelText('Note'), ' extra')

    await waitFor(() => expect(status()).toHaveTextContent("Couldn't save"))
    expect(screen.getByLabelText('Note')).toHaveValue('Docs extra')
    await waitFor(() => expect(status()).toHaveTextContent('Saved'))
    expect((await mock.notes.getLink(link.id)).note).toBe('Docs extra')
  })

  it('saves at once with Ctrl+S', async () => {
    AUTOSAVE_DEFAULTS.delayMs = 60_000
    const mock = await signedInBackend()
    const { link, user } = await openLink(mock)

    await user.type(screen.getByLabelText('Note'), '!')
    expect(status()).toHaveTextContent('Saving…')
    await user.keyboard('{Control>}s{/Control}')

    await waitFor(() => expect(status()).toHaveTextContent('Saved'))
    expect((await mock.notes.getLink(link.id)).note).toBe('Docs!')
  })

  describe('deleting', () => {
    it('asks first, then moves the link to the trash and goes to the list', async () => {
      const mock = await signedInBackend()
      const { link, user, router } = await openLink(mock)

      await user.click(screen.getByRole('button', { name: 'Delete' }))
      const dialog = await screen.findByRole('alertdialog', { name: 'Delete this link?' })
      expect(within(dialog).getByText('“Symfony” will be moved to the trash.')).toBeInTheDocument()
      expect((await mock.notes.listLinks()).total).toBe(1)
      await user.click(within(dialog).getByRole('button', { name: 'Delete' }))

      await waitFor(() => expect(router.state.location.pathname).toBe('/links'))
      expect((await mock.notes.listLinks()).total).toBe(0)
      expect((await mock.notes.listTrash()).links.map((l) => l.id)).toEqual([link.id])
    })

    it('can be cancelled', async () => {
      const mock = await signedInBackend()
      const { user } = await openLink(mock)

      await user.click(screen.getByRole('button', { name: 'Delete' }))
      await user.click(
        within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Cancel' }),
      )

      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
      expect((await mock.notes.listLinks()).total).toBe(1)
    })

    it('stays and explains when it fails', async () => {
      const mock = await signedInBackend()
      const { user, router, link } = await openLink(mock)
      vi.spyOn(mock.notes, 'deleteLink').mockRejectedValue(
        new ApiError({ status: 404, code: 'link.not_found' }),
      )

      await user.click(screen.getByRole('button', { name: 'Delete' }))
      await user.click(
        within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Delete' }),
      )

      expect(await within(screen.getByRole('alertdialog')).findByRole('alert')).toHaveTextContent(
        'This link no longer exists.',
      )
      expect(router.state.location.pathname).toBe(`/link/${link.id}`)
    })

    it('does not try to save the link again once it is gone', async () => {
      AUTOSAVE_DEFAULTS.delayMs = 60_000
      const mock = await signedInBackend()
      const { user } = await openLink(mock)
      await user.type(screen.getByLabelText('Note'), ' typed just before deleting')
      const updateLink = vi.spyOn(mock.notes, 'updateLink')

      await user.click(screen.getByRole('button', { name: 'Delete' }))
      await user.click(
        within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Delete' }),
      )
      await screen.findByRole('heading', { name: 'Links' })
      await new Promise((r) => setTimeout(r, 50))

      expect(updateLink).not.toHaveBeenCalled()
    })
  })

  describe('when it cannot be opened', () => {
    it('says a missing link does not exist and offers the way back', async () => {
      const mock = await signedInBackend()
      const { user } = await renderApp('/link/00000000-0000-4000-8000-000000000000', mock)

      expect(
        await screen.findByRole('heading', { name: "This link doesn't exist" }),
      ).toBeInTheDocument()
      await user.click(screen.getByRole('link', { name: 'Back to links' }))
      expect(await screen.findByRole('heading', { name: 'Links' })).toBeInTheDocument()
    })

    it("does not show another user's link", async () => {
      const mock = await signedInBackend()
      const link = await mock.notes.createLink({ title: 'Private', url: 'https://a.co' })
      await mock.auth.logout()
      await mock.auth.signUp({ email: 'eve@example.com', password: 'secret123' })
      const { activationTokenFor } = await import('@/data/mock')
      await mock.auth.activate(activationTokenFor('eve@example.com'))
      await mock.auth.login('eve@example.com', 'secret123')

      await renderApp(`/link/${link.id}`, mock)

      expect(
        await screen.findByRole('heading', { name: "This link doesn't exist" }),
      ).toBeInTheDocument()
      expect(screen.queryByText('Private')).not.toBeInTheDocument()
    })

    it('offers to try again after other failures', async () => {
      const mock = await signedInBackend()
      const link = await mock.notes.createLink({ title: 'Flaky', url: 'https://a.co' })
      const get = vi
        .spyOn(mock.notes, 'getLink')
        .mockRejectedValue(new ApiError({ status: 0, code: 'network_error' }))
      const { user } = await renderApp(`/link/${link.id}`, mock)

      expect(await screen.findByText(/We couldn't open this link\./)).toBeInTheDocument()

      get.mockRestore()
      await user.click(screen.getByRole('button', { name: 'Try again' }))
      expect(await screen.findByLabelText('Link title')).toHaveValue('Flaky')
    })
  })

  it('opens the ancestors in the tree and highlights the link', async () => {
    const mock = await signedInBackend()
    const folder = await mock.notes.createFolder('Reading')
    const note = await mock.notes.createNote({ title: 'Project', folderId: folder.id })
    const { link } = await openLink(mock, { parentNoteId: note.id, tags: [] })

    const tree = screen.getByRole('tree', { name: 'Documents' })
    const item = await waitFor(() => {
      const found = within(tree)
        .getAllByRole('treeitem')
        .find((el) => el.dataset.key === `link:${link.id}`)
      if (!found) throw new Error('link row not shown yet')
      return found
    })
    expect(item).toHaveAttribute('aria-selected', 'true')
    expect(within(tree).getByRole('treeitem', { name: /Reading/ })).toHaveAttribute(
      'aria-expanded',
      'true',
    )
  })

  it('speaks Spanish when the account does', async () => {
    const mock = await signedInBackend()
    await mock.auth.updateProfile({ locale: 'es' })
    const link = await mock.notes.createLink({ title: 'Docs', url: 'https://a.co' })
    await renderApp(`/link/${link.id}`, mock)

    expect(await screen.findByLabelText('Título del enlace')).toHaveValue('Docs')
    expect(screen.getByLabelText('Dirección web')).toBeInTheDocument()
    expect(screen.getByLabelText('Nota')).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: 'Abrir Docs en una pestaña nueva' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Eliminar' })).toBeInTheDocument()
  })
})

describe('new link dialog', () => {
  const fill = async (
    user: App['user'],
    values: { url?: string; title?: string; note?: string },
  ) => {
    const dialog = await screen.findByRole('dialog', { name: 'New link' })
    if (values.url !== undefined)
      await user.type(within(dialog).getByLabelText('Web address'), values.url)
    if (values.title !== undefined)
      await user.type(within(dialog).getByLabelText('Title (optional)'), values.title)
    if (values.note !== undefined)
      await user.type(within(dialog).getByLabelText('Note (optional)'), values.note)
    return dialog
  }

  it('saves a link from the sidebar: the site name is the title when none is given', async () => {
    const mock = await signedInBackend()
    const { user, router } = await renderApp('/', mock)

    await user.click(await screen.findByRole('button', { name: 'New link' }))
    const dialog = await screen.findByRole('dialog', { name: 'New link' })
    expect(within(dialog).getByLabelText('Web address')).toHaveFocus()
    await fill(user, { url: '  https://www.example.com/page?x=1  ' })
    await user.click(within(dialog).getByRole('button', { name: 'Save link' }))

    await screen.findByLabelText('Link title')
    const [created] = (await mock.notes.listLinks()).items
    expect(created).toMatchObject({
      title: 'example.com',
      url: 'https://www.example.com/page?x=1',
      note: null,
      folderId: null,
      parentNoteId: null,
    })
    expect(router.state.location.pathname).toBe(`/link/${created.id}`)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('saves the title, the note and the tags that were given', async () => {
    const mock = await signedInBackend()
    const { user } = await renderApp('/', mock)

    await user.click(await screen.findByRole('button', { name: 'New link' }))
    const dialog = await fill(user, {
      url: 'https://symfony.com',
      title: 'Symfony docs',
      note: 'The reference',
    })
    await user.type(within(dialog).getByRole('combobox', { name: 'Add tag' }), 'Dev, PHP{Enter}')
    await user.click(within(dialog).getByRole('button', { name: 'Save link' }))

    await screen.findByLabelText('Link title')
    const [created] = (await mock.notes.listLinks()).items
    expect(created).toMatchObject({
      title: 'Symfony docs',
      note: 'The reference',
      tags: ['dev', 'php'],
    })
  })

  it('refuses an empty or unusable address and says why, without calling the server', async () => {
    const mock = await signedInBackend()
    const create = vi.spyOn(mock.notes, 'createLink')
    const { user } = await renderApp('/', mock)
    await user.click(await screen.findByRole('button', { name: 'New link' }))
    const dialog = await screen.findByRole('dialog', { name: 'New link' })

    await user.click(within(dialog).getByRole('button', { name: 'Save link' }))
    expect(await within(dialog).findByText('A web address is required')).toBeInTheDocument()

    for (const bad of ['example.com', 'javascript:alert(1)', 'ftp://x.example']) {
      const field = within(dialog).getByLabelText('Web address')
      await user.clear(field)
      await user.type(field, bad)
      await user.click(within(dialog).getByRole('button', { name: 'Save link' }))
      expect(
        await within(dialog).findByText(
          'Enter a full web address starting with http:// or https://',
        ),
      ).toBeInTheDocument()
      expect(field).toHaveAttribute('aria-invalid', 'true')
    }
    expect(create).not.toHaveBeenCalled()
  })

  it('keeps the dialog and the values when the server fails', async () => {
    const mock = await signedInBackend()
    vi.spyOn(mock.notes, 'createLink').mockRejectedValue(
      new ApiError({ status: 0, code: 'network_error' }),
    )
    const { user } = await renderApp('/', mock)
    await user.click(await screen.findByRole('button', { name: 'New link' }))
    const dialog = await fill(user, { url: 'https://a.co', note: 'keep me' })

    await user.click(within(dialog).getByRole('button', { name: 'Save link' }))

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'We could not reach the server',
    )
    expect(within(dialog).getByLabelText('Web address')).toHaveValue('https://a.co')
    expect(within(dialog).getByLabelText('Note (optional)')).toHaveValue('keep me')
    expect(within(dialog).getByRole('button', { name: 'Save link' })).toBeEnabled()
  })

  it('cannot be submitted twice while saving', async () => {
    const mock = await signedInBackend()
    let release!: () => void
    const original = mock.notes.createLink.bind(mock.notes)
    const create = vi
      .spyOn(mock.notes, 'createLink')
      .mockImplementation(
        (input) => new Promise((resolve) => (release = () => resolve(original(input)))),
      )
    const { user } = await renderApp('/', mock)
    await user.click(await screen.findByRole('button', { name: 'New link' }))
    const dialog = await fill(user, { url: 'https://a.co' })

    await user.click(within(dialog).getByRole('button', { name: 'Save link' }))
    expect(await within(dialog).findByRole('button', { name: 'Saving…' })).toBeDisabled()
    await user.keyboard('{Enter}')
    expect(create).toHaveBeenCalledTimes(1)

    release()
    await screen.findByLabelText('Link title')
    expect((await mock.notes.listLinks()).total).toBe(1)
  })

  it('can be cancelled with the button or Escape', async () => {
    const mock = await signedInBackend()
    const { user } = await renderApp('/', mock)

    await user.click(await screen.findByRole('button', { name: 'New link' }))
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Cancel' }),
    )
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'New link' }))
    await screen.findByRole('dialog')
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect((await mock.notes.listLinks()).total).toBe(0)
  })

  describe('from where the link will live', () => {
    it('a folder menu', async () => {
      const mock = await signedInBackend()
      const folder = await mock.notes.createFolder('Reading')
      const { user } = await renderApp('/', mock)
      const tree = await screen.findByRole('tree', { name: 'Documents' })
      await waitFor(() =>
        expect(within(tree).getByRole('link', { name: /Reading/ })).toBeInTheDocument(),
      )

      await user.click(within(tree).getByRole('button', { name: 'Actions for Reading' }))
      await user.click(await screen.findByRole('menuitem', { name: 'New link inside' }))
      await fill(user, { url: 'https://a.co', title: 'In the folder' })
      await user.click(screen.getByRole('button', { name: 'Save link' }))

      await screen.findByLabelText('Link title')
      expect((await mock.notes.folderContents(folder.id)).links.map((l) => l.title)).toEqual([
        'In the folder',
      ])
      await waitFor(() =>
        expect(within(tree).getByRole('link', { name: 'In the folder' })).toBeInTheDocument(),
      )
    })

    it('a document menu', async () => {
      const mock = await signedInBackend()
      const note = await mock.notes.createNote({ title: 'Project' })
      const { user } = await renderApp('/', mock)
      const tree = await screen.findByRole('tree', { name: 'Documents' })
      await waitFor(() =>
        expect(within(tree).getByRole('link', { name: /Project/ })).toBeInTheDocument(),
      )

      await user.click(within(tree).getByRole('button', { name: 'Actions for Project' }))
      await user.click(await screen.findByRole('menuitem', { name: 'Add link' }))
      await fill(user, { url: 'https://a.co', title: 'Under the document' })
      await user.click(screen.getByRole('button', { name: 'Save link' }))

      await screen.findByLabelText('Link title')
      expect((await mock.notes.noteChildren(note.id)).links.map((l) => l.title)).toEqual([
        'Under the document',
      ])
    })

    it('the folder page', async () => {
      const mock = await signedInBackend()
      const folder = await mock.notes.createFolder('Reading')
      const { user } = await renderApp(`/folder/${folder.id}`, mock)

      await user.click(
        await within(await screen.findByRole('main')).findByRole('button', {
          name: 'New link here',
        }),
      )
      await fill(user, { url: 'https://a.co', title: 'Here' })
      await user.click(screen.getByRole('button', { name: 'Save link' }))

      await screen.findByLabelText('Link title')
      expect((await mock.notes.folderContents(folder.id)).links.map((l) => l.title)).toEqual([
        'Here',
      ])
    })

    it("a document's sub-documents panel", async () => {
      const mock = await signedInBackend()
      const note = await mock.notes.createNote({ title: 'Project' })
      const { user } = await renderApp(`/doc/${note.id}`, mock)

      const panel = await screen.findByRole('region', { name: 'Sub-documents' })
      await user.click(within(panel).getByRole('button', { name: 'Add link' }))
      await fill(user, { url: 'https://a.co', title: 'Attached' })
      await user.click(screen.getByRole('button', { name: 'Save link' }))

      await screen.findByLabelText('Link title')
      expect(
        await mock.notes.getLink((await mock.notes.noteChildren(note.id)).links[0].id),
      ).toMatchObject({
        title: 'Attached',
        parentNoteId: note.id,
      })
    })
  })
})

describe('links list', () => {
  it('lists every link, newest first, each leading to its page, with the site it points to', async () => {
    const mock = await signedInBackend()
    const old = await mock.notes.createLink({ title: 'Old', url: 'https://old.example/page' })
    await new Promise((r) => setTimeout(r, 5))
    const recent = await mock.notes.createLink({
      title: 'Recent',
      url: 'https://www.recent.example',
    })
    await renderApp('/links', mock)

    expect(await screen.findByRole('heading', { name: 'Links' })).toBeInTheDocument()
    const main = within(screen.getByRole('main'))
    const items = await main.findAllByRole('link')
    expect(items.map((a) => a.getAttribute('href'))).toEqual([
      `/link/${recent.id}`,
      `/link/${old.id}`,
    ])
    expect(items[0]).toHaveTextContent('Recent')
    expect(items[0]).toHaveTextContent('recent.example')
    expect(items[0]).not.toHaveAttribute('target')
  })

  it('invites the user to save the first one', async () => {
    const mock = await signedInBackend()
    await renderApp('/links', mock)

    expect(await screen.findByText("You haven't saved any links yet.")).toBeInTheDocument()
  })

  it('opens the new-link dialog from the page', async () => {
    const mock = await signedInBackend()
    const { user } = await renderApp('/links', mock)

    await user.click(
      await within(await screen.findByRole('main')).findByRole('button', { name: 'New link' }),
    )

    expect(await screen.findByRole('dialog', { name: 'New link' })).toBeInTheDocument()
  })

  it('shows more when there are more than a page', async () => {
    const mock = await signedInBackend()
    for (let i = 1; i <= 25; i += 1)
      await mock.notes.createLink({ title: `Link ${i}`, url: 'https://a.co' })
    const { user } = await renderApp('/links', mock)
    const main = within(await screen.findByRole('main'))
    await waitFor(() => expect(main.getAllByRole('link')).toHaveLength(20))

    await user.click(main.getByRole('button', { name: 'Show more' }))

    await waitFor(() => expect(main.getAllByRole('link')).toHaveLength(25))
    expect(main.queryByRole('button', { name: 'Show more' })).not.toBeInTheDocument()
  })

  it('shows a recoverable error', async () => {
    const mock = await signedInBackend()
    await mock.notes.createLink({ title: 'Survivor', url: 'https://a.co' })
    const list = vi
      .spyOn(mock.notes, 'listLinks')
      .mockRejectedValue(new ApiError({ status: 0, code: 'network_error' }))
    const { user } = await renderApp('/links', mock)

    expect(await screen.findByRole('alert')).toHaveTextContent("We couldn't load your links.")

    list.mockRestore()
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(
      await within(screen.getByRole('main')).findByRole('link', { name: /Survivor/ }),
    ).toBeInTheDocument()
  })

  it('is one click away in the sidebar, and follows new links', async () => {
    const mock = await signedInBackend()
    const { user, router } = await renderApp('/', mock)

    await user.click(await screen.findByRole('link', { name: 'Links' }))
    expect(router.state.location.pathname).toBe('/links')
    expect(screen.getByRole('link', { name: 'Links' })).toHaveAttribute('aria-current', 'page')

    await user.click(within(screen.getByRole('main')).getByRole('button', { name: 'New link' }))
    await user.type(await screen.findByLabelText('Web address'), 'https://a.co')
    await user.click(screen.getByRole('button', { name: 'Save link' }))
    await screen.findByLabelText('Link title')
    await user.click(screen.getByRole('link', { name: 'Links' }))

    expect(
      await within(screen.getByRole('main')).findByRole('link', { name: /a\.co/ }),
    ).toBeInTheDocument()
  })
})
