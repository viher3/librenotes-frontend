import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/data/errors'
import i18n from '@/lib/i18n'
import { editorText, setEditorText } from '@/test/editor'
import { ACCOUNT, createBackend, renderApp } from '@/test/renderApp'
import { AUTOSAVE_DEFAULTS } from './useAutosave'
import { createFromSidebar } from '@/test/createMenu'

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

/** Opens a freshly created document in the app. */
async function openDocument(
  mock: Backend,
  input: {
    title?: string
    content?: string
    pinned?: boolean
    editorMode?: 'visual' | 'markdown' | 'keep'
    /** Opens the page for editing, as a click on Edit does (the default); `false` leaves it as a read-only page. */
    edit?: boolean
  } = {},
) {
  const note = await mock.notes.createNote({
    title: input.title ?? 'Plan',
    content: input.content ?? '# Hello',
    pinned: input.pinned,
  })
  const app = await renderApp(`/doc/${note.id}`, mock, { editorMode: input.editorMode })
  await screen.findByLabelText('Document title')
  if (input.edit !== false)
    await app.user.click(await screen.findByRole('button', { name: 'Edit' }))
  return { note, ...app }
}

const status = () =>
  screen.getAllByRole('status').find((el) => /Saved|Saving|save/.test(el.textContent ?? ''))!

describe('home', () => {
  it('invites the user to create the first document', async () => {
    const mock = await signedInBackend()
    await renderApp('/', mock)

    expect(await screen.findByText("You don't have any documents yet.")).toBeInTheDocument()
    expect(screen.getByText('Create your first one to get started.')).toBeInTheDocument()
  })

  it('lists pinned and recent documents, most recently updated first', async () => {
    const mock = await signedInBackend()
    const old = await mock.notes.createNote({ title: 'Old one' })
    await new Promise((r) => setTimeout(r, 5))
    const recent = await mock.notes.createNote({ title: 'Recent one', tags: ['work'] })
    await mock.notes.createNote({ title: 'Pinned one', pinned: true })
    await renderApp('/', mock)

    const pinned = await screen.findByRole('region', { name: 'Pinned' })
    expect(within(pinned).getByRole('link', { name: /Pinned one/ })).toBeInTheDocument()
    expect(within(pinned).getByRole('img', { name: 'Pinned' })).toBeInTheDocument()

    const section = screen.getByRole('region', { name: 'Recent' })
    const titles = within(section)
      .getAllByRole('link')
      .map((a) => a.textContent)
    expect(titles[0]).toContain('Recent one')
    expect(titles[1]).toContain('Old one')
    expect(within(section).getByText('work')).toBeInTheDocument()
    expect(within(section).getAllByText(/Updated/)).not.toHaveLength(0)
    expect(within(section).getByRole('link', { name: /Recent one/ })).toHaveAttribute(
      'href',
      `/doc/${recent.id}`,
    )
    expect(within(section).getByRole('link', { name: /Old one/ })).toHaveAttribute(
      'href',
      `/doc/${old.id}`,
    )
    expect(screen.queryByText("You don't have any documents yet.")).not.toBeInTheDocument()
  })

  it('shows a recoverable error when the documents cannot be loaded', async () => {
    const mock = await signedInBackend()
    await mock.notes.createNote({ title: 'Survivor' })
    const list = vi
      .spyOn(mock.notes, 'listNotes')
      .mockRejectedValue(new ApiError({ status: 0, code: 'network_error' }))
    const { user } = await renderApp('/', mock)

    expect(await screen.findByRole('alert')).toHaveTextContent("We couldn't load your documents.")

    list.mockRestore()
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(
      (await within(screen.getByRole('main')).findAllByRole('link', { name: /Survivor/ }))[0],
    ).toBeInTheDocument()
  })

  it.each([
    [
      'the button',
      async (user: Awaited<ReturnType<typeof renderApp>>['user']) =>
        createFromSidebar(user, 'New document'),
    ],
    [
      'Ctrl+N',
      async (user: Awaited<ReturnType<typeof renderApp>>['user']) => {
        await screen.findByRole('heading', { name: 'Your documents' })
        await user.keyboard('{Control>}n{/Control}')
      },
    ],
    [
      'Cmd+N',
      async (user: Awaited<ReturnType<typeof renderApp>>['user']) => {
        await screen.findByRole('heading', { name: 'Your documents' })
        await user.keyboard('{Meta>}n{/Meta}')
      },
    ],
    [
      'Alt+N',
      async (user: Awaited<ReturnType<typeof renderApp>>['user']) => {
        await screen.findByRole('heading', { name: 'Your documents' })
        await user.keyboard('{Alt>}n{/Alt}')
      },
    ],
  ])('creates a document with %s and opens it ready to be named', async (_how, trigger) => {
    const mock = await signedInBackend()
    const { user, router } = await renderApp('/', mock)

    await trigger(user)

    const title = await screen.findByLabelText('Document title')
    expect(router.state.location.pathname).toMatch(/^\/doc\/.+/)
    expect(title).toHaveValue('Untitled')
    await waitFor(() => expect(title).toHaveFocus())
    expect((title as HTMLInputElement).selectionStart).toBe(0)
    expect((title as HTMLInputElement).selectionEnd).toBe('Untitled'.length)
    expect((await mock.notes.listNotes()).total).toBe(1)
  })

  it('ignores other key combinations', async () => {
    const mock = await signedInBackend()
    const { user } = await renderApp('/', mock)
    await screen.findByRole('heading', { name: 'Your documents' })

    await user.keyboard('n')
    await user.keyboard('{Control>}{Shift>}n{/Shift}{/Control}')
    await user.keyboard('{Control>}{Alt>}n{/Alt}{/Control}')

    expect((await mock.notes.listNotes()).total).toBe(0)
  })

  it('names new documents in the active language', async () => {
    const mock = await signedInBackend()
    await mock.auth.updateProfile({ locale: 'es' })
    const { user } = await renderApp('/', mock)

    await createFromSidebar(user, 'Nuevo documento', 'Crear nuevo')

    expect(await screen.findByLabelText('Título del documento')).toHaveValue('Sin título')
  })

  it('does not create two documents when it is activated again while the first is being created', async () => {
    const mock = await signedInBackend()
    let release!: () => void
    const original = mock.notes.createNote.bind(mock.notes)
    const create = vi
      .spyOn(mock.notes, 'createNote')
      .mockImplementation(
        (input) => new Promise((resolve) => (release = () => resolve(original(input)))),
      )
    await renderApp('/', mock)
    await screen.findByRole('heading', { name: 'Your documents' })

    // Both key presses arrive before React renders again, as with a held-down or double-tapped shortcut.
    act(() => {
      fireEvent.keyDown(window, { key: 'n', altKey: true })
      fireEvent.keyDown(window, { key: 'n', altKey: true })
    })
    await waitFor(() => expect(create).toHaveBeenCalled())
    await new Promise((r) => setTimeout(r, 30)) // time for a second request to show up, if there were one
    expect(create).toHaveBeenCalledTimes(1)

    release()
    await screen.findByLabelText('Document title')
    expect((await mock.notes.listNotes()).total).toBe(1)
  })

  it('explains why a document could not be created', async () => {
    const mock = await signedInBackend()
    vi.spyOn(mock.notes, 'createNote').mockRejectedValue(
      new ApiError({ status: 0, code: 'network_error' }),
    )
    const { user } = await renderApp('/', mock)

    await createFromSidebar(user, 'New document')

    expect((await screen.findAllByRole('alert'))[0]).toHaveTextContent(
      'We could not reach the server',
    )
    expect(screen.getByRole('heading', { name: 'Your documents' })).toBeInTheDocument()
  })
})

describe('document page', () => {
  it('shows the document as a page in the visual editor, and as source in the Markdown editor', async () => {
    const mock = await signedInBackend()
    await openDocument(mock, {
      title: 'Plan',
      content: '# Big title\n\nSome **bold** text',
      editorMode: 'visual',
    })

    expect(screen.getByLabelText('Document title')).toHaveValue('Plan')
    const page = await screen.findByTestId('visual-editor')
    expect(await within(page).findByRole('heading', { name: 'Big title' })).toBeInTheDocument()
    expect(within(page).getByText('bold').tagName).toBe('STRONG')
    expect(document.querySelector('.cm-editor')).not.toBeInTheDocument()
    expect(document.title).toBe('Plan · LibreNotes')
    expect(status()).toHaveTextContent('Saved')
  })

  it('opens in the Markdown editor with the source, and has no preview pane', async () => {
    const mock = await signedInBackend()
    await openDocument(mock, { title: 'Plan', content: '# Big title\n\nSome **bold** text' })

    expect(await editorText()).toBe('# Big title\n\nSome **bold** text')
    expect(screen.queryByRole('region', { name: 'Preview' })).not.toBeInTheDocument()
  })

  it('saves the content only when Save is pressed, and only the changed field', async () => {
    const mock = await signedInBackend()
    const { note, user } = await openDocument(mock)
    const update = vi.spyOn(mock.notes, 'updateNote')

    await setEditorText('# Changed\n\nBody')

    expect(status()).toHaveTextContent('Unsaved changes')
    await new Promise((r) => setTimeout(r, 80)) // longer than the autosave pause
    expect(update).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(status()).toHaveTextContent('Saved'))
    expect(update).toHaveBeenCalledTimes(1)
    expect(update).toHaveBeenCalledWith(note.id, { content: '# Changed\n\nBody' })
    expect((await mock.notes.getNote(note.id)).content).toBe('# Changed\n\nBody')
    // Saving goes back to reading the page.
    expect(await screen.findByRole('button', { name: 'Edit' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument()
  })

  it('shows saving while a request is in flight', async () => {
    const mock = await signedInBackend()
    const { user } = await openDocument(mock)
    let finish!: () => void
    const update = vi
      .spyOn(mock.notes, 'updateNote')
      .mockImplementation(() => new Promise<void>((resolve) => (finish = resolve)))

    await setEditorText('typing')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(update).toHaveBeenCalled())
    expect(status()).toHaveTextContent('Saving…')
    finish()
    await waitFor(() => expect(status()).toHaveTextContent('Saved'))
  })

  it('renames the document and keeps the browser tab title in step', async () => {
    const mock = await signedInBackend()
    const { note, user } = await openDocument(mock)

    const title = screen.getByLabelText('Document title')
    await user.clear(title)
    await user.type(title, 'Renamed')

    expect(document.title).toBe('Renamed · LibreNotes')
    await waitFor(async () => expect((await mock.notes.getNote(note.id)).title).toBe('Renamed'))
    await waitFor(() => expect(status()).toHaveTextContent('Saved'))
  })

  it('does not save an empty title, says so, and restores the last saved one on blur', async () => {
    const mock = await signedInBackend()
    const { note, user } = await openDocument(mock)
    const update = vi.spyOn(mock.notes, 'updateNote')
    const title = screen.getByLabelText('Document title')

    await user.clear(title)
    await user.type(title, '   ')

    expect(status()).toHaveTextContent('A title is required to save')
    await new Promise((r) => setTimeout(r, 80))
    expect(update).not.toHaveBeenCalled()

    await user.tab()
    expect(title).toHaveValue('Plan')
    await waitFor(() => expect(status()).toHaveTextContent('Saved'))
    expect((await mock.notes.getNote(note.id)).title).toBe('Plan')
  })

  it('still saves the content while the title is empty', async () => {
    const mock = await signedInBackend()
    const { note, user } = await openDocument(mock)
    await user.clear(screen.getByLabelText('Document title'))

    await setEditorText('kept')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(async () => expect((await mock.notes.getNote(note.id)).content).toBe('kept'))
  })

  it('saves immediately with Ctrl+S and keeps editing', async () => {
    const mock = await signedInBackend()
    const { note, user } = await openDocument(mock)
    await setEditorText('urgent')
    expect(status()).toHaveTextContent('Unsaved changes')

    await user.keyboard('{Control>}s{/Control}')

    await waitFor(() => expect(status()).toHaveTextContent('Saved'))
    expect((await mock.notes.getNote(note.id)).content).toBe('urgent')
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument()
  })

  it('saves the title right away when the tab is hidden, but not the unsaved content', async () => {
    AUTOSAVE_DEFAULTS.delayMs = 60_000
    const mock = await signedInBackend()
    const { note, user } = await openDocument(mock)
    await user.type(screen.getByLabelText('Document title'), ' II')
    await setEditorText('still a draft')

    Object.defineProperty(document, 'hidden', { configurable: true, value: true })
    fireEvent(document, new Event('visibilitychange'))
    Object.defineProperty(document, 'hidden', { configurable: true, value: false })

    await waitFor(async () => expect((await mock.notes.getNote(note.id)).title).toBe('Plan II'))
    expect((await mock.notes.getNote(note.id)).content).toBe('# Hello')
  })

  it('keeps the text on screen when saving fails, and saves on the next try', async () => {
    const mock = await signedInBackend()
    const { note, user } = await openDocument(mock)
    const update = vi.spyOn(mock.notes, 'updateNote')
    update.mockRejectedValueOnce(new ApiError({ status: 0, code: 'network_error' }))

    await setEditorText('precious')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByText("Couldn't save. Try again.")).toBeInTheDocument()
    expect(await editorText()).toBe('precious')
    expect(status()).toHaveTextContent('Unsaved changes')

    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(status()).toHaveTextContent('Saved'))
    expect(update).toHaveBeenCalledTimes(2)
    expect((await mock.notes.getNote(note.id)).content).toBe('precious')
  })

  it('asks before leaving with unsaved changes, and leaves without them if the user insists', async () => {
    const mock = await signedInBackend()
    const { note, user } = await openDocument(mock)
    await setEditorText('last words')

    await user.click(screen.getByRole('link', { name: 'Home' }))
    const dialog = await screen.findByRole('alertdialog', { name: 'Leave without saving?' })
    await user.click(within(dialog).getByRole('button', { name: 'Keep editing' }))
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Document title')).toBeInTheDocument()

    await user.click(screen.getByRole('link', { name: 'Home' }))
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', {
        name: 'Leave without saving',
      }),
    )

    await screen.findByRole('heading', { name: 'Your documents' })
    expect((await mock.notes.getNote(note.id)).content).toBe('# Hello')
  })

  it('leaves without asking when nothing is unsaved', async () => {
    const mock = await signedInBackend()
    const { user } = await openDocument(mock)

    await user.click(screen.getByRole('link', { name: 'Home' }))

    await screen.findByRole('heading', { name: 'Your documents' })
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })

  it('asks the browser to confirm closing the page only while something is unsaved', async () => {
    const mock = await signedInBackend()
    const { user } = await openDocument(mock)

    const clean = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(clean)
    expect(clean.defaultPrevented).toBe(false)

    await setEditorText('unsaved')
    const dirty = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(dirty)
    expect(dirty.defaultPrevented).toBe(true)

    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(status()).toHaveTextContent('Saved'))
    const saved = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(saved)
    expect(saved.defaultPrevented).toBe(false)
  })

  it('opens as a read-only page and starts editing when the content is clicked', async () => {
    const mock = await signedInBackend()
    const { user } = await openDocument(mock, {
      content: '# Big title',
      editorMode: 'visual',
      edit: false,
    })
    const page = await screen.findByTestId('visual-editor')
    expect(await within(page).findByRole('heading', { name: 'Big title' })).toBeInTheDocument()
    expect(page.querySelector('[contenteditable="true"]')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Visual' })).not.toBeInTheDocument()

    await user.click(page)

    expect(await screen.findByRole('button', { name: 'Save' })).toBeInTheDocument()
    await waitFor(() => expect(page.querySelector('[contenteditable="true"]')).not.toBeNull())
  })

  it('discards the changes on Cancel after confirming', async () => {
    const mock = await signedInBackend()
    const { note, user } = await openDocument(mock)
    await setEditorText('oops')

    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', {
        name: 'Discard changes',
      }),
    )

    expect(await screen.findByRole('button', { name: 'Edit' })).toBeInTheDocument()
    expect((await mock.notes.getNote(note.id)).content).toBe('# Hello')
    await user.click(screen.getByRole('button', { name: 'Edit' }))
    expect(await editorText()).toBe('# Hello')
  })

  it('recovers unsaved changes from a local draft after a reload', async () => {
    const mock = await signedInBackend()
    const { note, user, unmount } = await openDocument(mock)
    await setEditorText('not saved yet')
    unmount()

    await renderApp(`/doc/${note.id}`, mock, { editorMode: 'keep' })

    expect(
      await screen.findByText('We recovered changes that were not saved last time.'),
    ).toBeInTheDocument()
    expect(await editorText()).toBe('not saved yet')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(async () =>
      expect((await mock.notes.getNote(note.id)).content).toBe('not saved yet'),
    )
  })

  it('switches between the visual and the Markdown editor, remembering the choice per document', async () => {
    const mock = await signedInBackend()
    const { user, unmount, note } = await openDocument(mock, {
      content: '# Hello',
      editorMode: 'visual',
    })
    const source = () => document.querySelector('.cm-editor')
    const visual = () => screen.queryByTestId('visual-editor')
    await screen.findByTestId('visual-editor')

    expect(screen.getByRole('button', { name: 'Visual' })).toHaveAttribute('aria-pressed', 'true')
    expect(source()).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Markdown' }))
    expect(await editorText()).toBe('# Hello')
    expect(visual()).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Markdown' })).toHaveAttribute('aria-pressed', 'true')

    unmount()
    const reopened = await renderApp(`/doc/${note.id}`, mock, { editorMode: 'keep' })
    await screen.findByLabelText('Document title')
    await reopened.user.click(await screen.findByRole('button', { name: 'Edit' }))
    expect(await editorText()).toBe('# Hello')

    const other = await mock.notes.createNote({ title: 'Other' })
    await renderApp(`/doc/${other.id}`, mock, { editorMode: 'keep' })
    expect(await screen.findByTestId('visual-editor')).toBeInTheDocument()
  })

  it('carries what was typed in the source over to the visual editor', async () => {
    const mock = await signedInBackend()
    const { user } = await openDocument(mock, { content: 'first' })

    await setEditorText('# From the source')
    await user.click(screen.getByRole('button', { name: 'Visual' }))

    const page = await screen.findByTestId('visual-editor')
    expect(
      await within(page).findByRole('heading', { name: 'From the source' }),
    ).toBeInTheDocument()
  })

  it('shows a prompt on an empty document in the visual editor', async () => {
    const mock = await signedInBackend()
    await openDocument(mock, { content: '', editorMode: 'visual' })

    const page = await screen.findByTestId('visual-editor')
    await waitFor(() =>
      expect(page.querySelector('[data-placeholder]')).toHaveAttribute(
        'data-placeholder',
        'Type “/” for blocks…',
      ),
    )
  })

  it('pins and unpins, and the home page reflects it', async () => {
    const mock = await signedInBackend()
    const { note, user } = await openDocument(mock)
    const pin = screen.getByRole('button', { name: 'Pin' })
    expect(pin).toHaveAttribute('aria-pressed', 'false')

    await user.click(pin)

    expect(screen.getByRole('button', { name: 'Unpin' })).toHaveAttribute('aria-pressed', 'true')
    await waitFor(async () => expect((await mock.notes.getNote(note.id)).pinned).toBe(true))
    await user.click(screen.getByRole('link', { name: 'Home' }))
    expect(
      within(await screen.findByRole('region', { name: 'Pinned' })).getByRole('link', {
        name: /Plan/,
      }),
    ).toBeInTheDocument()

    await user.click(
      within(screen.getByRole('region', { name: 'Pinned' })).getByRole('link', { name: /Plan/ }),
    )
    await user.click(await screen.findByRole('button', { name: 'Unpin' }))
    await waitFor(async () => expect((await mock.notes.getNote(note.id)).pinned).toBe(false))
  })

  it('puts the pin back and says so when it cannot be changed', async () => {
    const mock = await signedInBackend()
    const { user } = await openDocument(mock)
    vi.spyOn(mock.notes, 'updateNote').mockRejectedValue(
      new ApiError({ status: 0, code: 'network_error' }),
    )

    await user.click(screen.getByRole('button', { name: 'Pin' }))

    expect(await screen.findByText("Couldn't change the pin. Try again.")).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Pin' })).toHaveAttribute('aria-pressed', 'false')
  })

  describe('deleting', () => {
    it('asks first, then moves the document to the trash and returns home', async () => {
      const mock = await signedInBackend()
      const { note, user, router } = await openDocument(mock)

      await user.click(screen.getByRole('button', { name: 'Delete' }))
      const dialog = await screen.findByRole('alertdialog', { name: 'Delete this document?' })
      expect(within(dialog).getByText('“Plan” will be moved to the trash.')).toBeInTheDocument()
      expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus()
      expect((await mock.notes.listNotes()).total).toBe(1)

      await user.click(within(dialog).getByRole('button', { name: 'Delete' }))

      expect(await screen.findByRole('heading', { name: 'Your documents' })).toBeInTheDocument()
      expect(router.state.location.pathname).toBe('/')
      expect((await mock.notes.listNotes()).total).toBe(0)
      expect((await mock.notes.listTrash()).notes.map((n) => n.id)).toEqual([note.id])
      expect(await screen.findByText("You don't have any documents yet.")).toBeInTheDocument()
    })

    it('can be cancelled with the button or Escape, leaving the document alone', async () => {
      const mock = await signedInBackend()
      const { user } = await openDocument(mock)

      await user.click(screen.getByRole('button', { name: 'Delete' }))
      await user.click(
        within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Cancel' }),
      )
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Delete' })).toHaveFocus()

      await user.click(screen.getByRole('button', { name: 'Delete' }))
      await screen.findByRole('alertdialog')
      await user.keyboard('{Escape}')
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
      expect((await mock.notes.listNotes()).total).toBe(1)
    })

    it('keeps focus inside the dialog while it is open', async () => {
      const mock = await signedInBackend()
      const { user } = await openDocument(mock)
      await user.click(screen.getByRole('button', { name: 'Delete' }))
      const dialog = await screen.findByRole('alertdialog')
      const cancel = within(dialog).getByRole('button', { name: 'Cancel' })
      const confirm = within(dialog).getByRole('button', { name: 'Delete' })

      await user.tab()
      expect(confirm).toHaveFocus()
      await user.tab()
      expect(cancel).toHaveFocus()
      await user.tab({ shift: true })
      expect(confirm).toHaveFocus()
    })

    it('stays on the document and explains when deleting fails', async () => {
      const mock = await signedInBackend()
      const { user, router, note } = await openDocument(mock)
      vi.spyOn(mock.notes, 'deleteNote').mockRejectedValue(
        new ApiError({ status: 404, code: 'note.not_found' }),
      )

      await user.click(screen.getByRole('button', { name: 'Delete' }))
      await user.click(
        within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Delete' }),
      )

      expect(await within(screen.getByRole('alertdialog')).findByRole('alert')).toHaveTextContent(
        'This document no longer exists.',
      )
      expect(router.state.location.pathname).toBe(`/doc/${note.id}`)
    })

    it('does not try to save the document again once it has been deleted', async () => {
      AUTOSAVE_DEFAULTS.delayMs = 60_000
      const mock = await signedInBackend()
      const { user } = await openDocument(mock)
      await setEditorText('typed just before deleting')
      const update = vi.spyOn(mock.notes, 'updateNote')

      await user.click(screen.getByRole('button', { name: 'Delete' }))
      await user.click(
        within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Delete' }),
      )
      await screen.findByRole('heading', { name: 'Your documents' })
      await new Promise((r) => setTimeout(r, 50))

      expect(update).not.toHaveBeenCalled()
    })
  })

  describe('when it cannot be opened', () => {
    it('says a missing document does not exist and offers the way back', async () => {
      const mock = await signedInBackend()
      const { user } = await renderApp('/doc/00000000-0000-4000-8000-000000000000', mock)

      expect(
        await screen.findByRole('heading', { name: "This document doesn't exist" }),
      ).toBeInTheDocument()
      await user.click(screen.getByRole('link', { name: 'Back to documents' }))
      expect(await screen.findByRole('heading', { name: 'Your documents' })).toBeInTheDocument()
    })

    it("does not show another user's document", async () => {
      const mock = await signedInBackend()
      const note = await mock.notes.createNote({ title: 'Private' })
      await mock.auth.logout()
      await mock.auth.signUp({ email: 'eve@example.com', password: 'secret123' })
      const { activationTokenFor } = await import('@/data/mock')
      await mock.auth.activate(activationTokenFor('eve@example.com'))
      await mock.auth.login('eve@example.com', 'secret123')

      await renderApp(`/doc/${note.id}`, mock)

      expect(
        await screen.findByRole('heading', { name: "This document doesn't exist" }),
      ).toBeInTheDocument()
      expect(screen.queryByText('Private')).not.toBeInTheDocument()
    })

    it('offers to try again after other failures', async () => {
      const mock = await signedInBackend()
      const note = await mock.notes.createNote({ title: 'Flaky' })
      const get = vi
        .spyOn(mock.notes, 'getNote')
        .mockRejectedValue(new ApiError({ status: 0, code: 'network_error' }))
      const { user } = await renderApp(`/doc/${note.id}`, mock)

      expect(
        await screen.findByRole('heading', { name: "We couldn't open this document" }),
      ).toBeInTheDocument()
      expect(screen.getByText(/We could not reach the server/)).toBeInTheDocument()

      get.mockRestore()
      await user.click(screen.getByRole('button', { name: 'Try again' }))
      expect(await screen.findByLabelText('Document title')).toHaveValue('Flaky')
    })
  })

  it('speaks Spanish when the account does', async () => {
    const mock = await signedInBackend()
    await mock.auth.updateProfile({ locale: 'es' })
    const note = await mock.notes.createNote({ title: 'Plan', content: 'hola' })
    const { user } = await renderApp(`/doc/${note.id}`, mock)

    expect(await screen.findByLabelText('Título del documento')).toHaveValue('Plan')
    expect(screen.getByRole('button', { name: 'Fijar' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Eliminar' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Editar' }))
    expect(screen.getByRole('group', { name: 'Modo de edición' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Guardar' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Visual' })).toBeInTheDocument()
    await waitFor(() =>
      expect(screen.getAllByRole('status').some((el) => el.textContent === 'Guardado')).toBe(true),
    )
    expect(i18n.resolvedLanguage).toBe('es')
  })
})

describe('moving a document from its page and its card', () => {
  it('moves the open document with the Move button, and the breadcrumb follows', async () => {
    const mock = await signedInBackend()
    const folder = await mock.notes.createFolder('Archive')
    const { user, note } = await openDocument(mock, { edit: false })

    await user.click(screen.getByRole('button', { name: 'Move' }))
    const dialog = await screen.findByRole('dialog', { name: 'Move “Plan”' })
    await user.click(await within(dialog).findByRole('button', { name: 'Archive' }))
    await user.click(within(dialog).getByRole('button', { name: 'Move here' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect((await mock.notes.getNote(note.id)).folderId).toBe(folder.id)
    expect(
      await within(await screen.findByRole('navigation', { name: 'Breadcrumb' })).findByRole(
        'link',
        {
          name: 'Archive',
        },
      ),
    ).toBeInTheDocument()
  })

  it('offers Move on a document card of the home page', async () => {
    const mock = await signedInBackend()
    const folder = await mock.notes.createFolder('Archive')
    const note = await mock.notes.createNote({ title: 'Loose' })
    const { user } = await renderApp('/', mock)

    await user.click((await screen.findAllByRole('button', { name: 'Move Loose' }))[0])
    const dialog = await screen.findByRole('dialog', { name: 'Move “Loose”' })
    await user.click(await within(dialog).findByRole('button', { name: 'Archive' }))
    await user.click(within(dialog).getByRole('button', { name: 'Move here' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect((await mock.notes.getNote(note.id)).folderId).toBe(folder.id)
  })
})
