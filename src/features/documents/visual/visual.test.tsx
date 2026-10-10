import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AUTOSAVE_DEFAULTS } from '@/features/documents/useAutosave'
import { findVisualView, view$ } from '@/test/visualEditor'
import { ACCOUNT, createBackend, renderApp } from '@/test/renderApp'

type Backend = Awaited<ReturnType<typeof createBackend>>

const original = { ...AUTOSAVE_DEFAULTS }
beforeEach(() => {
  AUTOSAVE_DEFAULTS.delayMs = 25
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

async function openVisual(mock: Backend, content: string) {
  const note = await mock.notes.createNote({ title: 'Page', content })
  const app = await renderApp(`/doc/${note.id}`, mock, { editorMode: 'visual' })
  await screen.findByLabelText('Document title')
  const view = await findVisualView()
  return { note, view, ...app }
}

describe('visual editor', () => {
  it('does not lose the last keystrokes when the user leaves right away', async () => {
    const mock = await signedInBackend()
    AUTOSAVE_DEFAULTS.delayMs = 5000
    const { note, view, user } = await openVisual(mock, 'before')

    view$.end(view)
    view$.type(view, ' and the last words')
    await user.click(screen.getByRole('link', { name: 'Home' }))

    await waitFor(async () =>
      expect((await mock.notes.getNote(note.id)).content).toBe('before and the last words'),
    )
  })

  it('does not touch a document that ends in a code block', async () => {
    const mock = await signedInBackend()
    const text = 'intro\n\n```js\nconst a = 1\n```'
    const { note } = await openVisual(mock, text)
    const update = vi.spyOn(mock.notes, 'updateNote')

    await new Promise((r) => setTimeout(r, 400))

    expect(update).not.toHaveBeenCalled()
    expect((await mock.notes.getNote(note.id)).content).toBe(text)
  })

  it('is what a document opens in, with an accessible editing area', async () => {
    const mock = await signedInBackend()
    const note = await mock.notes.createNote({ title: 'Page', content: 'hello' })
    await renderApp(`/doc/${note.id}`, mock, { editorMode: 'visual' })

    const area = await screen.findByRole('textbox', { name: 'Document content (Markdown)' })
    expect(area).toHaveAttribute('aria-multiline', 'true')
    expect(area).toHaveAttribute('contenteditable', 'true')
    expect(document.querySelector('.cm-editor')).not.toBeInTheDocument()
  })

  it('does not touch a document that was only opened, whatever its Markdown style', async () => {
    const mock = await signedInBackend()
    const original = '* star bullets\n* second\n\n***\n\n__strong__'
    const { note } = await openVisual(mock, original)
    const update = vi.spyOn(mock.notes, 'updateNote')

    await new Promise((r) => setTimeout(r, 150))

    expect(update).not.toHaveBeenCalled()
    expect((await mock.notes.getNote(note.id)).content).toBe(original)
  })

  it('saves what is typed as Markdown, after a pause', async () => {
    const mock = await signedInBackend()
    const { note, view } = await openVisual(mock, '# Title')

    view$.end(view)
    view$.type(view, ' plus')

    await waitFor(async () =>
      expect((await mock.notes.getNote(note.id)).content).toBe('# Title plus'),
    )
  })

  it('keeps the rest of the document as it was when something is edited', async () => {
    const mock = await signedInBackend()
    const { note, view } = await openVisual(mock, '- one\n- two\n\n```js\nconst a = 1\n```\n\nend')

    view$.end(view)
    view$.type(view, '!')

    await waitFor(async () =>
      expect((await mock.notes.getNote(note.id)).content).toBe(
        '- one\n- two\n\n```js\nconst a = 1\n```\n\nend!',
      ),
    )
  })

  it('keeps raw HTML as text and never makes it run', async () => {
    const mock = await signedInBackend()
    const { note, view } = await openVisual(mock, '<img src=x onerror=alert(1)>\n\ntext')

    const page = screen.getByTestId('visual-editor')
    expect(page.querySelector('img:not(.ProseMirror-separator)')).toBeNull()
    view$.end(view)
    view$.type(view, '!')

    await waitFor(async () =>
      expect((await mock.notes.getNote(note.id)).content).toBe(
        '<img src=x onerror=alert(1)>\n\ntext!',
      ),
    )
  })

  it('can be switched to the source and back without losing edits', async () => {
    const mock = await signedInBackend()
    const { note, view, user } = await openVisual(mock, 'plain')

    view$.end(view)
    view$.type(view, ' text')
    await waitFor(async () =>
      expect((await mock.notes.getNote(note.id)).content).toBe('plain text'),
    )
    await user.click(screen.getByRole('button', { name: 'Markdown' }))

    const source = await screen.findByLabelText('Document content (Markdown)')
    await waitFor(() => expect(source).toHaveTextContent('plain text'))
    await user.click(screen.getByRole('button', { name: 'Visual' }))
    const again = await findVisualView()
    expect(view$.text(again)).toBe('plain text')
  })
})

describe('slash menu', () => {
  async function typeSlash(text = '/') {
    const mock = await signedInBackend()
    const ctx = await openVisual(mock, '')
    view$.select(ctx.view, 1)
    view$.type(ctx.view, text)
    return { mock, ...ctx }
  }

  it('opens when "/" is typed, listing the blocks', async () => {
    await typeSlash()

    const list = await screen.findByRole('listbox', { name: 'Blocks' })
    expect(
      within(list)
        .getAllByRole('option')
        .map((o) => o.querySelector('span')!.textContent),
    ).toEqual([
      'Heading 1',
      'Heading 2',
      'Heading 3',
      'Bulleted list',
      'Numbered list',
      'To-do list',
      'Quote',
      'Code block',
      'Table',
      'Divider',
    ])
    expect(screen.getByRole('textbox', { name: 'Document content (Markdown)' })).toHaveAttribute(
      'aria-expanded',
      'true',
    )
  })

  it('narrows as the user types, in the language of the interface', async () => {
    await typeSlash('/lis')

    const options = within(await screen.findByRole('listbox')).getAllByRole('option')
    expect(options.map((o) => o.querySelector('span')!.textContent)).toEqual([
      'Bulleted list',
      'Numbered list',
      'To-do list',
    ])
  })

  it('does not open for a slash inside a word, an address or a date', async () => {
    const mock = await signedInBackend()
    const { view } = await openVisual(mock, '')
    view$.select(view, 1)

    for (const text of ['and/or', 'https://a.co', '12/10/2026']) {
      view$.type(view, ` ${text}`)
      await new Promise((r) => setTimeout(r, 20))
      expect(screen.queryByRole('listbox'), text).not.toBeInTheDocument()
    }
  })

  it('says when nothing matches, and closes when the text stops being a command', async () => {
    const { view } = await typeSlash('/zzzz')
    expect(await screen.findByText('No blocks match.')).toBeInTheDocument()

    view$.type(view, ' ')

    await waitFor(() => expect(screen.queryByText('No blocks match.')).not.toBeInTheDocument())
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('turns the line into the chosen block with Enter, and the text typed after goes inside it', async () => {
    const { mock, note, view } = await typeSlash('/h2')
    await screen.findByRole('listbox')

    fireEvent.keyDown(view.dom, { key: 'Enter' })
    await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument())
    view$.type(view, 'Chapter')

    await waitFor(async () =>
      expect((await mock.notes.getNote(note.id)).content).toBe('## Chapter'),
    )
  })

  it('moves with the arrows and picks with a click', async () => {
    const { mock, note, view } = await typeSlash()
    await screen.findByRole('listbox')
    const options = () => within(screen.getByRole('listbox')).getAllByRole('option')
    expect(options()[0]).toHaveAttribute('aria-selected', 'true')

    fireEvent.keyDown(view.dom, { key: 'ArrowDown' })
    await waitFor(() => expect(options()[1]).toHaveAttribute('aria-selected', 'true'))
    fireEvent.keyDown(view.dom, { key: 'ArrowUp' })
    fireEvent.keyDown(view.dom, { key: 'ArrowUp' })
    await waitFor(() => expect(options()[9]).toHaveAttribute('aria-selected', 'true'))

    fireEvent.click(within(screen.getByRole('listbox')).getByRole('option', { name: /Quote/ }))
    await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument())
    view$.type(view, 'wise words')

    await waitFor(async () =>
      expect((await mock.notes.getNote(note.id)).content).toBe('> wise words'),
    )
  })

  it('closes with Escape and leaves what was typed', async () => {
    const { view } = await typeSlash('/h1')
    await screen.findByRole('listbox')

    fireEvent.keyDown(view.dom, { key: 'Escape' })

    await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument())
    expect(view$.text(view)).toBe('/h1')
  })

  it.each([
    ['/to-do', '- [ ] item'],
    ['/code', '```\nitem\n```'],
    ['/divider', '---'],
    ['/numbered', '1. item'],
  ])('%s', async (command, expected) => {
    const { mock, note, view } = await typeSlash(command)
    await screen.findByRole('listbox')
    fireEvent.keyDown(view.dom, { key: 'Enter' })
    await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument())
    if (command !== '/divider') view$.type(view, 'item')
    else view$.type(view, '')

    await waitFor(async () => {
      const content = (await mock.notes.getNote(note.id)).content.trim()
      expect(content.startsWith(expected.split('\n')[0])).toBe(true)
      if (command !== '/divider') expect(content).toBe(expected)
    })
  })
})

describe('floating toolbar', () => {
  const toolbar = () => screen.findByRole('toolbar', { name: 'Text formatting' })

  async function select(content = 'hello world') {
    const mock = await signedInBackend()
    const ctx = await openVisual(mock, content)
    view$.select(ctx.view, 1, 6) // "hello"
    return { mock, ...ctx }
  }

  it('appears over a text selection and is gone when it is collapsed', async () => {
    const { view } = await select()
    expect(await toolbar()).toBeInTheDocument()

    view$.select(view, 3)

    await waitFor(() => expect(screen.queryByRole('toolbar')).not.toBeInTheDocument())
  })

  it('makes the selection bold, and shows that it is', async () => {
    const { mock, note, user } = await select()

    await user.click(within(await toolbar()).getByRole('button', { name: 'Bold' }))

    await waitFor(async () =>
      expect((await mock.notes.getNote(note.id)).content).toBe('**hello** world'),
    )
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Bold' })).toHaveAttribute('aria-pressed', 'true'),
    )
    expect(screen.getByRole('button', { name: 'Italic' })).toHaveAttribute('aria-pressed', 'false')
  })

  it.each([
    ['Italic', '_hello_ world'],
    ['Strikethrough', '~~hello~~ world'],
    ['Code', '`hello` world'],
  ])('%s', async (name, expected) => {
    const { mock, note, user } = await select()

    await user.click(within(await toolbar()).getByRole('button', { name }))

    await waitFor(async () => expect((await mock.notes.getNote(note.id)).content).toBe(expected))
  })

  it('makes a link from a safe address', async () => {
    const { mock, note, user } = await select()

    await user.click(within(await toolbar()).getByRole('button', { name: 'Link' }))
    await user.type(screen.getByLabelText('Link address'), 'https://example.com{Enter}')

    await waitFor(async () =>
      expect((await mock.notes.getNote(note.id)).content).toBe(
        '[hello](https://example.com) world',
      ),
    )
  })

  it.each(['javascript:alert(1)', 'data:text/html;base64,AAAA'])(
    'refuses %s as a link',
    async (bad) => {
      const { mock, note, user } = await select()

      await user.click(within(await toolbar()).getByRole('button', { name: 'Link' }))
      const input = screen.getByLabelText('Link address')
      await user.type(input, `${bad}{Enter}`)

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Enter a web address starting with',
      )
      expect(input).toHaveAttribute('aria-invalid', 'true')
      await new Promise((r) => setTimeout(r, 80))
      expect((await mock.notes.getNote(note.id)).content).toBe('hello world')
    },
  )

  it('does not show over a code block', async () => {
    const mock = await signedInBackend()
    const { view } = await openVisual(mock, '```\ncode here\n```')

    view$.select(view, 2, 6)

    await new Promise((r) => setTimeout(r, 50))
    expect(screen.queryByRole('toolbar')).not.toBeInTheDocument()
  })
})

describe('task lists', () => {
  it('ticks and unticks a task by clicking its box', async () => {
    const mock = await signedInBackend()
    const { note, view, user } = await openVisual(mock, '- [ ] first\n- [x] second')
    const items = () => [...view.dom.querySelectorAll('li[data-item-type="task"]')]

    await user.click(items()[0])
    await waitFor(async () =>
      expect((await mock.notes.getNote(note.id)).content).toBe('- [x] first\n- [x] second'),
    )

    // Two clicks in a row at one spot are a double click to ProseMirror, which is something else.
    await new Promise((r) => setTimeout(r, 600))
    await user.click(items()[1])
    await waitFor(async () =>
      expect((await mock.notes.getNote(note.id)).content).toBe('- [x] first\n- [ ] second'),
    )
  })
})

describe('images from the attachments panel', () => {
  it('inserts at the cursor of the visual editor', async () => {
    const mock = await signedInBackend()
    Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:x'), revokeObjectURL: vi.fn() })
    const note = await mock.notes.createNote({ title: 'Pics', content: 'before after' })
    const picture = await mock.notes.uploadNoteAttachment(
      note.id,
      new File(['PNG'], 'chart.png', { type: 'image/png' }),
    )
    const { user } = await renderApp(`/doc/${note.id}`, mock, { editorMode: 'visual' })
    const view = await findVisualView()
    view$.select(view, 8) // between "before " and "after"

    await user.click(
      await screen.findByRole('button', { name: 'Insert chart.png into the document' }),
    )

    await waitFor(async () =>
      expect((await mock.notes.getNote(note.id)).content).toBe(
        `before ![chart.png](attachment:${picture.id})after`,
      ),
    )
    const page = screen.getByTestId('visual-editor')
    await waitFor(() =>
      expect(within(page).getByAltText('chart.png')).toHaveAttribute('src', 'blob:x'),
    )
  })
})

describe('documents the visual editor cannot show exactly', () => {
  it('warns and offers the Markdown editor', async () => {
    const mock = await signedInBackend()
    const { note, user } = await openVisual(mock, '[a][ref]\n\n[ref]: https://x.co')

    expect(await screen.findByText(/can't show exactly/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Edit as Markdown' }))

    const source = await screen.findByLabelText('Document content (Markdown)')
    await waitFor(() => expect(source).toHaveTextContent('[ref]: https://x.co'))
    expect(screen.queryByText(/can't show exactly/)).not.toBeInTheDocument()
    expect((await mock.notes.getNote(note.id)).content).toBe('[a][ref]\n\n[ref]: https://x.co')
  })

  it('stays quiet for an ordinary document', async () => {
    const mock = await signedInBackend()
    await openVisual(mock, '# Fine\n\n- a\n- b')

    await new Promise((r) => setTimeout(r, 80))
    expect(screen.queryByText(/can't show exactly/)).not.toBeInTheDocument()
  })
})
