import { act, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { editorText, setEditorText } from '@/test/editor'
import { ACCOUNT, createBackend, renderApp } from '@/test/renderApp'
import { isEncryptedContent } from '@/lib/crypto/marker'
import { AUTOSAVE_DEFAULTS } from '@/features/documents/useAutosave'
import { AUTOLOCK_MS } from './EncryptionProvider'

// The algorithm is the real one; only its cost is lowered so each key does not take a second.
vi.mock('@/lib/crypto/kdf', async (original) => ({
  ...(await original<typeof import('@/lib/crypto/kdf')>()),
  DEFAULT_KDF: { m: 8, t: 1, p: 1 },
}))

type Backend = Awaited<ReturnType<typeof createBackend>>

const PASSWORD = 'correct horse battery'
const original = { ...AUTOSAVE_DEFAULTS }

beforeEach(() => {
  AUTOSAVE_DEFAULTS.delayMs = 25
  AUTOSAVE_DEFAULTS.retryDelaysMs = [25]
})
afterEach(() => {
  Object.assign(AUTOSAVE_DEFAULTS, original)
  vi.useRealTimers()
})

async function signedInBackend(): Promise<Backend> {
  const mock = await createBackend()
  await mock.auth.login(ACCOUNT.email, ACCOUNT.password)
  return mock
}

/** Records what the server is asked to store, so a test can prove plaintext never goes out. */
function spyOnWrites(mock: Backend) {
  const sent: string[] = []
  const { updateNote } = mock.notes
  mock.notes.updateNote = (id, input) => {
    if (input.content !== undefined) sent.push(input.content)
    return updateNote(id, input)
  }
  return sent
}

async function open(mock: Backend, content = '# Secret plan') {
  const note = await mock.notes.createNote({ title: 'Diary', content })
  const app = await renderApp(`/doc/${note.id}`, mock)
  await screen.findByLabelText('Document title')
  return { note, ...app }
}

async function encryptThroughTheUi(
  user: ReturnType<typeof import('@testing-library/user-event').default.setup>,
) {
  await user.click(screen.getByRole('button', { name: 'Encrypt' }))
  const dialog = await screen.findByRole('dialog', { name: 'Encrypt this document' })
  await user.type(within(dialog).getByLabelText('Password'), PASSWORD)
  await user.type(within(dialog).getByLabelText('Repeat the password'), PASSWORD)
  await user.click(within(dialog).getByRole('checkbox'))
  await user.click(within(dialog).getByRole('button', { name: 'Encrypt' }))
  await waitFor(() =>
    expect(screen.queryByRole('dialog', { name: 'Encrypt this document' })).not.toBeInTheDocument(),
  )
}

describe('encrypting a document', () => {
  it('stores ciphertext only: the server never receives the plaintext afterwards', async () => {
    const mock = await signedInBackend()
    const { note, user } = await open(mock)
    const sent = spyOnWrites(mock)

    await encryptThroughTheUi(user)

    const stored = (await mock.notes.getNote(note.id)).content
    expect(isEncryptedContent(stored)).toBe(true)
    expect(stored).not.toContain('Secret plan') // a space cannot occur in base64
    expect((await mock.notes.getNote(note.id)).encrypted).toBe(true)
    expect(sent).toHaveLength(1)

    // Keep typing: the autosave must encrypt too.
    await setEditorText('# Even more secret')
    await waitFor(async () => {
      expect((await mock.notes.getNote(note.id)).content).not.toBe(stored)
    })
    expect(sent.length).toBeGreaterThan(1)
    for (const content of sent) {
      expect(isEncryptedContent(content)).toBe(true)
      expect(content).not.toContain('Even more')
    }
    expect(await editorText()).toBe('# Even more secret')
  })

  it('needs matching passwords of enough length and an acknowledgement', async () => {
    const mock = await signedInBackend()
    const { note, user } = await open(mock)

    await user.click(screen.getByRole('button', { name: 'Encrypt' }))
    const dialog = await screen.findByRole('dialog', { name: 'Encrypt this document' })
    await user.type(within(dialog).getByLabelText('Password'), 'short')
    await user.type(within(dialog).getByLabelText('Repeat the password'), 'short')
    await user.click(within(dialog).getByRole('button', { name: 'Encrypt' }))
    expect(await within(dialog).findByText('Use at least 10 characters.')).toBeInTheDocument()

    await user.clear(within(dialog).getByLabelText('Password'))
    await user.type(within(dialog).getByLabelText('Password'), PASSWORD)
    await user.click(within(dialog).getByRole('button', { name: 'Encrypt' }))
    expect(await within(dialog).findByText('The passwords do not match.')).toBeInTheDocument()

    await user.type(within(dialog).getByLabelText('Repeat the password'), PASSWORD.slice(5))
    await user.clear(within(dialog).getByLabelText('Repeat the password'))
    await user.type(within(dialog).getByLabelText('Repeat the password'), PASSWORD)
    await user.click(within(dialog).getByRole('button', { name: 'Encrypt' }))
    expect(await within(dialog).findByText('Confirm that you understand.')).toBeInTheDocument()

    expect((await mock.notes.getNote(note.id)).encrypted).toBe(false)
  })
})

describe('opening an encrypted document', () => {
  async function encryptedNote(mock: Backend) {
    const { note, user, unmount } = await open(mock)
    await encryptThroughTheUi(user)
    unmount()
    return note
  }

  it('shows only the title until the right password is given', async () => {
    const mock = await signedInBackend()
    const note = await encryptedNote(mock)

    const { user } = await renderApp(`/doc/${note.id}`, mock)

    expect(await screen.findByText('This document is encrypted')).toBeInTheDocument()
    expect(screen.queryByLabelText('Document title')).not.toBeInTheDocument()
    expect(document.body.textContent).not.toContain('Secret plan')

    await user.type(screen.getByLabelText('Password'), 'not the password')
    await user.click(screen.getByRole('button', { name: 'Unlock' }))
    expect(
      await screen.findByText('Wrong password, or the document was altered.'),
    ).toBeInTheDocument()

    await user.clear(screen.getByLabelText('Password'))
    await user.type(screen.getByLabelText('Password'), PASSWORD)
    await user.click(screen.getByRole('button', { name: 'Unlock' }))

    await screen.findByLabelText('Document title')
    expect(await editorText()).toBe('# Secret plan')
  })

  it('locks again on demand', async () => {
    const mock = await signedInBackend()
    const note = await encryptedNote(mock)
    const { user } = await renderApp(`/doc/${note.id}`, mock)
    await user.type(await screen.findByLabelText('Password'), PASSWORD)
    await user.click(screen.getByRole('button', { name: 'Unlock' }))
    await screen.findByLabelText('Document title')

    await user.click(screen.getByRole('button', { name: 'Lock' }))
    expect(await screen.findByText('This document is encrypted')).toBeInTheDocument()
    expect(screen.queryByLabelText('Document title')).not.toBeInTheDocument()

    await user.type(screen.getByLabelText('Password'), PASSWORD)
    await user.click(screen.getByRole('button', { name: 'Unlock' }))
    await screen.findByLabelText('Document title')
  })

  it('locks by itself after a period of inactivity', async () => {
    const mock = await signedInBackend()
    const note = await encryptedNote(mock)
    // Installed before the timer is armed (unlocking arms it).
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const { user } = await renderApp(`/doc/${note.id}`, mock)
    await user.type(await screen.findByLabelText('Password'), PASSWORD)
    await user.click(screen.getByRole('button', { name: 'Unlock' }))
    await screen.findByLabelText('Document title')

    await act(async () => {
      await vi.advanceTimersByTimeAsync(AUTOLOCK_MS + 1000)
    })

    expect(await screen.findByText('This document is encrypted')).toBeInTheDocument()
    expect(screen.queryByLabelText('Document title')).not.toBeInTheDocument()
  })

  it('removes the encryption, storing plain text again', async () => {
    const mock = await signedInBackend()
    const note = await encryptedNote(mock)
    const { user } = await renderApp(`/doc/${note.id}`, mock)
    await user.type(await screen.findByLabelText('Password'), PASSWORD)
    await user.click(screen.getByRole('button', { name: 'Unlock' }))
    await screen.findByLabelText('Document title')

    await user.click(screen.getByRole('button', { name: 'Encryption' }))
    await user.click(await screen.findByRole('button', { name: 'Remove encryption' }))
    const confirm = await screen.findByRole('alertdialog', { name: 'Remove encryption?' })
    await user.click(within(confirm).getByRole('button', { name: 'Remove encryption' }))

    await waitFor(async () => {
      expect(await mock.notes.getNote(note.id)).toMatchObject({
        encrypted: false,
        content: '# Secret plan',
      })
    })
    expect(await screen.findByRole('button', { name: 'Encrypt' })).toBeInTheDocument()
  })

  it('changes the password: the old one stops working', async () => {
    const mock = await signedInBackend()
    const note = await encryptedNote(mock)
    const { user } = await renderApp(`/doc/${note.id}`, mock)
    await user.type(await screen.findByLabelText('Password'), PASSWORD)
    await user.click(screen.getByRole('button', { name: 'Unlock' }))
    await screen.findByLabelText('Document title')
    const before = (await mock.notes.getNote(note.id)).content

    await user.click(screen.getByRole('button', { name: 'Encryption' }))
    await user.click(await screen.findByRole('button', { name: 'Change password' }))
    const dialog = await screen.findByRole('dialog', { name: 'Change password' })
    await user.type(within(dialog).getByLabelText('Password'), 'a brand new phrase')
    await user.type(within(dialog).getByLabelText('Repeat the password'), 'a brand new phrase')
    await user.click(within(dialog).getByRole('button', { name: 'Change password' }))
    await waitFor(async () => {
      expect((await mock.notes.getNote(note.id)).content).not.toBe(before)
    })
    await user.click(screen.getByRole('button', { name: 'Lock' }))

    await user.type(await screen.findByLabelText('Password'), PASSWORD)
    await user.click(screen.getByRole('button', { name: 'Unlock' }))
    expect(
      await screen.findByText('Wrong password, or the document was altered.'),
    ).toBeInTheDocument()

    await user.clear(screen.getByLabelText('Password'))
    await user.type(screen.getByLabelText('Password'), 'a brand new phrase')
    await user.click(screen.getByRole('button', { name: 'Unlock' }))
    await screen.findByLabelText('Document title')
    expect(await editorText()).toBe('# Secret plan')
  })
})

describe('encrypted documents elsewhere in the app', () => {
  it('are found by title only, without exposing a snippet', async () => {
    const mock = await signedInBackend()
    await mock.notes.createNote({ title: 'Journal', content: 'lnenc:v1:' + btoa('zebra') })
    await mock.notes.createNote({ title: 'Open', content: 'zebra' })
    await renderApp('/', mock)

    const byContent = await mock.notes.search({ q: 'zebra' })
    const byTitle = await mock.notes.search({ q: 'Journal' })

    expect(byContent.items.map((i) => i.title)).toEqual(['Open'])
    expect(byTitle.items[0]).toMatchObject({ title: 'Journal', snippet: '', encrypted: true })
  })
})
