import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/data/errors'
import i18n from '@/lib/i18n'
import { editorText, setEditorText } from '@/test/editor'
import { ACCOUNT, createBackend, renderApp } from '@/test/renderApp'
import { AUTOSAVE_DEFAULTS } from './useAutosave'

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
  input: { title?: string; content?: string; pinned?: boolean } = {},
) {
  const note = await mock.notes.createNote({
    title: input.title ?? 'Plan',
    content: input.content ?? '# Hello',
    pinned: input.pinned,
  })
  const app = await renderApp(`/doc/${note.id}`, mock)
  await screen.findByLabelText('Document title')
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
      await within(screen.getByRole('main')).findByRole('link', { name: /Survivor/ }),
    ).toBeInTheDocument()
  })

  it.each([
    [
      'the button',
      async (user: Awaited<ReturnType<typeof renderApp>>['user']) =>
        user.click(await screen.findByRole('button', { name: 'New document', hidden: false })),
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

    await user.click(await screen.findByRole('button', { name: 'Nuevo documento' }))

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

    await user.click(await screen.findByRole('button', { name: 'New document' }))

    expect((await screen.findAllByRole('alert'))[0]).toHaveTextContent(
      'We could not reach the server',
    )
    expect(screen.getByRole('heading', { name: 'Your documents' })).toBeInTheDocument()
  })
})

describe('document page', () => {
  it('shows the document in the editor and rendered next to it', async () => {
    const mock = await signedInBackend()
    await openDocument(mock, { title: 'Plan', content: '# Big title\n\nSome **bold** text' })

    expect(screen.getByLabelText('Document title')).toHaveValue('Plan')
    expect(await editorText()).toBe('# Big title\n\nSome **bold** text')
    const preview = screen.getByRole('region', { name: 'Preview' })
    expect(within(preview).getByRole('heading', { name: 'Big title' })).toBeInTheDocument()
    expect(within(preview).getByText('bold').tagName).toBe('STRONG')
    expect(document.title).toBe('Plan · LibreNotes')
    expect(status()).toHaveTextContent('Saved')
  })

  it('saves what is typed after a pause, only the changed field, and updates the preview at once', async () => {
    const mock = await signedInBackend()
    const { note } = await openDocument(mock)
    const update = vi.spyOn(mock.notes, 'updateNote')

    await setEditorText('# Changed\n\nBody')

    expect(
      within(screen.getByRole('region', { name: 'Preview' })).getByRole('heading', {
        name: 'Changed',
      }),
    ).toBeInTheDocument()
    await waitFor(() => expect(status()).toHaveTextContent('Saved'))
    expect(update).toHaveBeenCalledTimes(1)
    expect(update).toHaveBeenCalledWith(note.id, { content: '# Changed\n\nBody' })
    expect((await mock.notes.getNote(note.id)).content).toBe('# Changed\n\nBody')
  })

  it('shows saving while a request is in flight', async () => {
    const mock = await signedInBackend()
    await openDocument(mock)
    let finish!: () => void
    const update = vi
      .spyOn(mock.notes, 'updateNote')
      .mockImplementation(() => new Promise<void>((resolve) => (finish = resolve)))

    await setEditorText('typing')

    await waitFor(() => expect(update).toHaveBeenCalled()) // the request is out, not just scheduled
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

    await waitFor(async () => expect((await mock.notes.getNote(note.id)).content).toBe('kept'))
  })

  it('saves immediately with Ctrl+S instead of waiting', async () => {
    AUTOSAVE_DEFAULTS.delayMs = 60_000
    const mock = await signedInBackend()
    const { note, user } = await openDocument(mock)
    await setEditorText('urgent')
    expect(status()).toHaveTextContent('Saving…')

    await user.keyboard('{Control>}s{/Control}')

    await waitFor(() => expect(status()).toHaveTextContent('Saved'))
    expect((await mock.notes.getNote(note.id)).content).toBe('urgent')
  })

  it('saves right away when the tab is hidden', async () => {
    AUTOSAVE_DEFAULTS.delayMs = 60_000
    const mock = await signedInBackend()
    const { note } = await openDocument(mock)
    await setEditorText('before leaving')

    Object.defineProperty(document, 'hidden', { configurable: true, value: true })
    fireEvent(document, new Event('visibilitychange'))
    Object.defineProperty(document, 'hidden', { configurable: true, value: false })

    await waitFor(async () =>
      expect((await mock.notes.getNote(note.id)).content).toBe('before leaving'),
    )
  })

  it('keeps the text on screen when saving fails, retries, and recovers', async () => {
    const mock = await signedInBackend()
    const { note } = await openDocument(mock)
    const update = vi.spyOn(mock.notes, 'updateNote')
    update.mockRejectedValueOnce(new ApiError({ status: 0, code: 'network_error' }))

    await setEditorText('precious')

    await waitFor(() => expect(status()).toHaveTextContent("Couldn't save — retrying…"))
    expect(await editorText()).toBe('precious')
    await waitFor(() => expect(status()).toHaveTextContent('Saved'))
    expect(update).toHaveBeenCalledTimes(2)
    expect((await mock.notes.getNote(note.id)).content).toBe('precious')
  })

  it('does not lose pending edits when the user navigates away', async () => {
    AUTOSAVE_DEFAULTS.delayMs = 60_000
    const mock = await signedInBackend()
    const { note, user } = await openDocument(mock)
    await setEditorText('last words')

    await user.click(screen.getByRole('link', { name: 'Home' }))

    await screen.findByRole('heading', { name: 'Your documents' })
    await waitFor(async () =>
      expect((await mock.notes.getNote(note.id)).content).toBe('last words'),
    )
  })

  it('asks the browser to confirm closing the page only while something is unsaved', async () => {
    AUTOSAVE_DEFAULTS.delayMs = 60_000
    const mock = await signedInBackend()
    const { user } = await openDocument(mock)

    const clean = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(clean)
    expect(clean.defaultPrevented).toBe(false)

    await setEditorText('unsaved')
    const dirty = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(dirty)
    expect(dirty.defaultPrevented).toBe(true)

    await user.keyboard('{Control>}s{/Control}')
    await waitFor(() => expect(status()).toHaveTextContent('Saved'))
    const saved = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(saved)
    expect(saved.defaultPrevented).toBe(false)
  })

  it('switches between editing, split and preview, and remembers the choice', async () => {
    const mock = await signedInBackend()
    const { user, unmount, note } = await openDocument(mock)
    const preview = () => screen.queryByRole('region', { name: 'Preview' })
    const editor = () => document.querySelector('.cm-editor')

    expect(preview()).toBeInTheDocument()
    expect(editor()).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Preview' }))
    expect(preview()).toBeInTheDocument()
    expect(editor()).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Preview' })).toHaveAttribute('aria-pressed', 'true')

    await user.click(screen.getByRole('button', { name: 'Edit' }))
    expect(preview()).not.toBeInTheDocument()
    expect(editor()).toBeInTheDocument()

    unmount()
    await renderApp(`/doc/${note.id}`, mock)
    await screen.findByLabelText('Document title')
    expect(preview()).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Edit' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('says when there is nothing to preview', async () => {
    const mock = await signedInBackend()
    await openDocument(mock, { content: '' })

    expect(
      within(screen.getByRole('region', { name: 'Preview' })).getByText('Nothing to preview yet.'),
    ).toBeInTheDocument()
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

    await user.click(within(screen.getByRole('main')).getByRole('link', { name: /Plan/ }))
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
    await renderApp(`/doc/${note.id}`, mock)

    expect(await screen.findByLabelText('Título del documento')).toHaveValue('Plan')
    expect(screen.getByRole('button', { name: 'Fijar' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Eliminar' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Vista previa' })).toBeInTheDocument()
    await waitFor(() =>
      expect(screen.getAllByRole('status').some((el) => el.textContent === 'Guardado')).toBe(true),
    )
    expect(i18n.resolvedLanguage).toBe('es')
  })
})
