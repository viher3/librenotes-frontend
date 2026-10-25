import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/data/errors'
import { AUTOSAVE_DEFAULTS } from '@/features/documents/useAutosave'
import i18n from '@/lib/i18n'
import { ACCOUNT, createBackend, renderApp } from '@/test/renderApp'
import { TagEditor } from './TagEditor'

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

describe('TagEditor', () => {
  /** Keeps the tags in state like a real parent, and records every change it reports. */
  function Harness({ initial = [] as string[], suggestions = [] as string[], onChange = vi.fn() }) {
    const [tags, setTags] = useState(initial)
    return (
      <MemoryRouter>
        <form onSubmit={(event) => event.preventDefault()}>
          <TagEditor
            tags={tags}
            suggestions={suggestions}
            onChange={(next) => {
              onChange(next)
              setTags(next)
            }}
          />
        </form>
      </MemoryRouter>
    )
  }

  const setup = async (props: Parameters<typeof Harness>[0] = {}) => {
    await i18n.changeLanguage('en')
    const user = userEvent.setup()
    const onChange = props.onChange ?? vi.fn()
    render(<Harness {...props} onChange={onChange} />)
    return { user, onChange, input: screen.getByRole('combobox', { name: 'Add tag' }) }
  }
  const chips = () =>
    within(screen.getByRole('group', { name: 'Tags' }))
      .queryAllByRole('listitem')
      .map((li) => li.textContent?.replace('×', ''))

  it('shows the tags as links to their page, each with a remove button', async () => {
    await setup({ initial: ['work', 'home'] })

    expect(chips()).toEqual(['work', 'home'])
    expect(screen.getByRole('link', { name: 'work' })).toHaveAttribute('href', '/tag/work')
    expect(screen.getByRole('button', { name: 'Remove tag home' })).toBeInTheDocument()
  })

  it('encodes unusual names in the link', async () => {
    await setup({ initial: ['q&a/ideas'] })

    expect(screen.getByRole('link', { name: 'q&a/ideas' })).toHaveAttribute(
      'href',
      '/tag/q%26a%2Fideas',
    )
  })

  it('adds with Enter, normalizing the name, and clears the field', async () => {
    const { user, input, onChange } = await setup()

    await user.type(input, '  Work Stuff  {Enter}')

    expect(chips()).toEqual(['work stuff'])
    expect(input).toHaveValue('')
    expect(onChange).toHaveBeenLastCalledWith(['work stuff'])
  })

  it('does not submit the surrounding form when Enter is pressed', async () => {
    await i18n.changeLanguage('en')
    const submit = vi.fn((event: React.FormEvent) => event.preventDefault())
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <form onSubmit={submit}>
          <TagEditor tags={[]} onChange={() => {}} />
        </form>
      </MemoryRouter>,
    )

    await user.type(screen.getByRole('combobox', { name: 'Add tag' }), 'x{Enter}')

    expect(submit).not.toHaveBeenCalled()
  })

  it('ignores empty input and tags it already has, whatever their case', async () => {
    const { user, input, onChange } = await setup({ initial: ['work'] })

    await user.type(input, '   {Enter}')
    await user.type(input, 'WORK{Enter}')

    expect(chips()).toEqual(['work'])
    expect(input).toHaveValue('')
    expect(onChange).not.toHaveBeenCalled()
  })

  it('adds with a comma, and several at once when a list is pasted', async () => {
    const { user, input } = await setup()

    await user.type(input, 'one,')
    expect(chips()).toEqual(['one'])
    expect(input).toHaveValue('')

    await user.click(input)
    await user.paste('two, three, four')
    expect(chips()).toEqual(['one', 'two', 'three'])
    expect(input).toHaveValue(' four') // the last piece is still being typed
    await user.keyboard('{Enter}')
    expect(chips()).toEqual(['one', 'two', 'three', 'four'])
  })

  it('adds what was typed when the field loses focus', async () => {
    const { user, input } = await setup()

    await user.type(input, 'pending')
    await user.tab()

    expect(chips()).toEqual(['pending'])
  })

  it('removes a tag', async () => {
    const { user, onChange } = await setup({ initial: ['a', 'b', 'c'] })

    await user.click(screen.getByRole('button', { name: 'Remove tag b' }))

    expect(chips()).toEqual(['a', 'c'])
    expect(onChange).toHaveBeenLastCalledWith(['a', 'c'])
  })

  it('refuses a name longer than 50 characters, says so, and recovers as soon as the user types', async () => {
    const { user, input, onChange } = await setup()

    await user.type(input, `${'x'.repeat(51)}{Enter}`)

    expect(screen.getByRole('alert')).toHaveTextContent('A tag can have at most 50 characters.')
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(onChange).not.toHaveBeenCalled()
    expect(chips()).toEqual([])

    await user.clear(input)
    await user.type(input, 'ok')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('accepts exactly 50 characters', async () => {
    const { user, input } = await setup()

    await user.type(input, `${'x'.repeat(50)}{Enter}`)

    expect(chips()).toHaveLength(1)
  })

  it('refuses a 21st tag', async () => {
    const twenty = Array.from({ length: 20 }, (_, i) => `t${i}`)
    const { user, input, onChange } = await setup({ initial: twenty })

    await user.type(input, 'one more{Enter}')

    expect(screen.getByRole('alert')).toHaveTextContent('A document can have at most 20 tags.')
    expect(chips()).toHaveLength(20)
    expect(onChange).not.toHaveBeenCalled()
  })

  it('keeps the tags added before the limit was reached when a long list is pasted', async () => {
    const nineteen = Array.from({ length: 19 }, (_, i) => `t${i}`)
    const { user, input } = await setup({ initial: nineteen })

    await user.click(input)
    await user.paste('first, second, third')

    expect(chips()).toHaveLength(20) // "first" fitted
    expect(screen.getByRole('alert')).toHaveTextContent('at most 20 tags')
  })

  it('suggests the tags in use elsewhere, but not the ones it already has', async () => {
    await setup({ initial: ['work'], suggestions: ['work', 'home', 'ideas'] })

    const options = [...document.querySelectorAll('datalist option')].map((o) =>
      o.getAttribute('value'),
    )
    expect(options).toEqual(['home', 'ideas'])
  })
})

describe('tags in a document', () => {
  const tagsOf = async (mock: Backend, id: string) => (await mock.notes.getNote(id)).tags

  it('adds and removes tags, saved by the autosave', async () => {
    const mock = await signedInBackend()
    const note = await mock.notes.createNote({ title: 'Plan', tags: ['work'] })
    const update = vi.spyOn(mock.notes, 'updateNote')
    const { user } = await renderApp(`/doc/${note.id}`, mock)
    const group = await screen.findByRole('group', { name: 'Tags' })
    expect(within(group).getByRole('link', { name: 'work' })).toBeInTheDocument()

    await user.type(within(group).getByRole('combobox', { name: 'Add tag' }), 'Home{Enter}')

    await waitFor(async () => expect(await tagsOf(mock, note.id)).toEqual(['work', 'home']))
    expect(update).toHaveBeenCalledWith(note.id, { tags: ['work', 'home'] })

    await user.click(within(group).getByRole('button', { name: 'Remove tag work' }))
    await waitFor(async () => expect(await tagsOf(mock, note.id)).toEqual(['home']))
    await waitFor(() =>
      expect(screen.getAllByRole('status').some((el) => el.textContent === 'Saved')).toBe(true),
    )
  })

  it('removes the last tag', async () => {
    const mock = await signedInBackend()
    const note = await mock.notes.createNote({ title: 'Plan', tags: ['only'] })
    const { user } = await renderApp(`/doc/${note.id}`, mock)

    await user.click(await screen.findByRole('button', { name: 'Remove tag only' }))

    await waitFor(async () => expect(await tagsOf(mock, note.id)).toEqual([]))
  })

  it('never sends a tag the server would refuse', async () => {
    const mock = await signedInBackend()
    const note = await mock.notes.createNote({ title: 'Plan' })
    const update = vi.spyOn(mock.notes, 'updateNote')
    const { user } = await renderApp(`/doc/${note.id}`, mock)

    await user.type(
      await screen.findByRole('combobox', { name: 'Add tag' }),
      `${'x'.repeat(60)}{Enter}`,
    )
    await new Promise((r) => setTimeout(r, 80))

    expect(update).not.toHaveBeenCalled()
  })

  it('keeps the tag on screen and retries when saving fails', async () => {
    const mock = await signedInBackend()
    const note = await mock.notes.createNote({ title: 'Plan' })
    vi.spyOn(mock.notes, 'updateNote').mockRejectedValueOnce(
      new ApiError({ status: 0, code: 'network_error' }),
    )
    const { user } = await renderApp(`/doc/${note.id}`, mock)

    await user.type(await screen.findByRole('combobox', { name: 'Add tag' }), 'kept{Enter}')

    await waitFor(() =>
      expect(
        screen.getAllByRole('status').some((el) => /Couldn't save/.test(el.textContent ?? '')),
      ).toBe(true),
    )
    expect(screen.getByRole('link', { name: 'kept' })).toBeInTheDocument()
    await waitFor(async () => expect(await tagsOf(mock, note.id)).toEqual(['kept']))
  })

  it("suggests tags from the user's other documents", async () => {
    const mock = await signedInBackend()
    await mock.notes.createNote({ title: 'Other', tags: ['shared', 'extra'] })
    const note = await mock.notes.createNote({ title: 'Plan', tags: ['extra'] })

    await renderApp(`/doc/${note.id}`, mock)
    await screen.findByRole('group', { name: 'Tags' })

    await waitFor(() => {
      const options = [...document.querySelectorAll('datalist option')].map((o) =>
        o.getAttribute('value'),
      )
      expect(options).toEqual(['shared'])
    })
  })

  it('leads to the tag page from a chip', async () => {
    const mock = await signedInBackend()
    const note = await mock.notes.createNote({ title: 'Plan', tags: ['work'] })
    const other = await mock.notes.createNote({ title: 'Other work', tags: ['work'] })
    const { user, router } = await renderApp(`/doc/${note.id}`, mock)

    await user.click(
      within(await screen.findByRole('group', { name: 'Tags' })).getByRole('link', {
        name: 'work',
      }),
    )

    expect(await screen.findByRole('heading', { name: 'Tag: work' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/tag/work')
    const main = within(screen.getByRole('main'))
    expect(main.getByRole('link', { name: /Other work/ })).toHaveAttribute(
      'href',
      `/doc/${other.id}`,
    )
  })
})

describe('tag list', () => {
  const list = () => screen.getByRole('list', { name: 'Tags' })

  it('lists the tags in use with how many items carry each, most used first', async () => {
    const mock = await signedInBackend()
    await mock.notes.createNote({ title: 'a', tags: ['work', 'home'] })
    await mock.notes.createNote({ title: 'b', tags: ['work'] })
    await mock.notes.createLink({ title: 'c', url: 'https://a.co', tags: ['work', 'dev'] })
    await renderApp('/', mock)

    await waitFor(() => expect(within(list()).getAllByRole('link')).toHaveLength(3))
    const links = within(list()).getAllByRole('link')
    expect(links.map((l) => l.getAttribute('aria-label'))).toEqual([
      'work (3 items)',
      'dev (1 item)',
      'home (1 item)',
    ])
    expect(links[0]).toHaveAttribute('href', '/tag/work')
  })

  it('says when there are none', async () => {
    const mock = await signedInBackend()
    await renderApp('/', mock)

    expect(await screen.findByText('No tags yet')).toBeInTheDocument()
  })

  it('does not count what is in the trash', async () => {
    const mock = await signedInBackend()
    const gone = await mock.notes.createNote({ title: 'gone', tags: ['ghost'] })
    await mock.notes.createNote({ title: 'kept', tags: ['real'] })
    await mock.notes.deleteNote(gone.id)
    await renderApp('/', mock)

    await waitFor(() => expect(within(list()).getAllByRole('link')).toHaveLength(1))
    expect(within(list()).getByRole('link', { name: /real/ })).toBeInTheDocument()
  })

  it('follows tagging done in the document, with no reload', async () => {
    const mock = await signedInBackend()
    const note = await mock.notes.createNote({ title: 'Plan' })
    const { user } = await renderApp(`/doc/${note.id}`, mock)
    await screen.findByRole('group', { name: 'Tags' })
    await screen.findByText('No tags yet')

    await user.type(screen.getByRole('combobox', { name: 'Add tag' }), 'fresh{Enter}')

    await waitFor(() =>
      expect(within(list()).getByRole('link', { name: 'fresh (1 item)' })).toBeInTheDocument(),
    )
    await user.click(screen.getByRole('button', { name: 'Remove tag fresh' }))
    await waitFor(() => expect(screen.getByText('No tags yet')).toBeInTheDocument())
  })

  it('follows deleting a document', async () => {
    const mock = await signedInBackend()
    const note = await mock.notes.createNote({ title: 'Plan', tags: ['temp'] })
    const { user } = await renderApp(`/doc/${note.id}`, mock)
    await waitFor(() =>
      expect(within(list()).getByRole('link', { name: 'temp (1 item)' })).toBeInTheDocument(),
    )

    await user.click(await screen.findByRole('button', { name: 'Delete' }))
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Delete' }),
    )

    await waitFor(() => expect(screen.getByText('No tags yet')).toBeInTheDocument())
  })

  it('highlights the tag being shown', async () => {
    const mock = await signedInBackend()
    await mock.notes.createNote({ title: 'a', tags: ['work', 'home'] })
    await renderApp('/tag/home', mock)

    await waitFor(() => expect(within(list()).getAllByRole('link')).toHaveLength(2))
    expect(within(list()).getByRole('link', { name: /home/ })).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(within(list()).getByRole('link', { name: /work/ })).not.toHaveAttribute('aria-current')
  })
})

describe('tag page', () => {
  it('lists the documents and links that carry the tag, whatever the case of the address', async () => {
    const mock = await signedInBackend()
    const doc = await mock.notes.createNote({ title: 'Tagged doc', tags: ['work'], pinned: true })
    await mock.notes.createNote({ title: 'Untagged doc', tags: ['home'] })
    const link = await mock.notes.createLink({
      title: 'Tagged link',
      url: 'https://ref.example',
      tags: ['work'],
    })
    await mock.notes.createLink({
      title: 'Other link',
      url: 'https://other.example',
      tags: ['home'],
    })

    await renderApp('/tag/WORK', mock)

    expect(await screen.findByRole('heading', { name: 'Tag: work' })).toBeInTheDocument()
    const main = within(screen.getByRole('main'))
    const docs = await main.findByRole('region', { name: 'Documents' })
    expect(within(docs).getAllByRole('link')).toHaveLength(1)
    expect(within(docs).getByRole('link', { name: /Tagged doc/ })).toHaveAttribute(
      'href',
      `/doc/${doc.id}`,
    )
    const links = main.getByRole('region', { name: 'Links' })
    const anchor = within(links).getByRole('link', { name: /Tagged link/ })
    expect(anchor).toHaveAttribute('href', `/link/${link.id}`)
  })

  it('says when nothing carries the tag', async () => {
    const mock = await signedInBackend()
    await renderApp('/tag/nothing', mock)

    expect(await screen.findByText('Nothing is tagged “nothing”.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to documents' })).toHaveAttribute('href', '/')
  })

  it('shows more when there are more than a page', async () => {
    const mock = await signedInBackend()
    for (let i = 1; i <= 25; i += 1)
      await mock.notes.createNote({ title: `Doc ${String(i).padStart(2, '0')}`, tags: ['many'] })
    const { user } = await renderApp('/tag/many', mock)

    const main = within(await screen.findByRole('main'))
    const docs = await main.findByRole('region', { name: 'Documents' })
    expect(within(docs).getAllByRole('link')).toHaveLength(20)

    await user.click(screen.getByRole('button', { name: 'Show more' }))

    await waitFor(() =>
      expect(
        within(main.getByRole('region', { name: 'Documents' })).getAllByRole('link'),
      ).toHaveLength(25),
    )
    expect(screen.queryByRole('button', { name: 'Show more' })).not.toBeInTheDocument()
  })

  it('shows a recoverable error', async () => {
    const mock = await signedInBackend()
    await mock.notes.createNote({ title: 'Survivor', tags: ['work'] })
    const list = vi
      .spyOn(mock.notes, 'listNotes')
      .mockRejectedValue(new ApiError({ status: 0, code: 'network_error' }))
    const { user } = await renderApp('/tag/work', mock)

    expect(await screen.findByRole('alert')).toHaveTextContent("We couldn't load this tag.")

    list.mockRestore()
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(
      await within(screen.getByRole('main')).findByRole('link', { name: /Survivor/ }),
    ).toBeInTheDocument()
  })

  it('speaks Spanish when the account does', async () => {
    const mock = await signedInBackend()
    await mock.auth.updateProfile({ locale: 'es' })
    await mock.notes.createNote({ title: 'Hola', tags: ['trabajo'] })
    await renderApp('/tag/trabajo', mock)

    expect(await screen.findByRole('heading', { name: 'Etiqueta: trabajo' })).toBeInTheDocument()
    expect(
      await within(screen.getByRole('main')).findByRole('region', { name: 'Documentos' }),
    ).toBeInTheDocument()
    expect(
      within(screen.getByRole('list', { name: 'Etiquetas' })).getByRole('link', {
        name: 'trabajo (1 elemento)',
      }),
    ).toBeInTheDocument()
  })
})
