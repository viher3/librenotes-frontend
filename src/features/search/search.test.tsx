import { screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/data/errors'
import { ACCOUNT, createBackend, renderApp } from '@/test/renderApp'
import { highlight } from './highlight'
import { SEARCH_DEFAULTS } from './queries'

type Backend = Awaited<ReturnType<typeof createBackend>>

const original = { ...SEARCH_DEFAULTS }
beforeEach(() => {
  SEARCH_DEFAULTS.delayMs = 20
})
afterEach(() => {
  Object.assign(SEARCH_DEFAULTS, original)
  vi.restoreAllMocks()
})

async function signedInBackend(): Promise<Backend> {
  const mock = await createBackend()
  await mock.auth.login(ACCOUNT.email, ACCOUNT.password)
  return mock
}

const box = () => screen.getByRole('combobox', { name: 'Search documents and links' })
const dialog = () => screen.getByRole('dialog', { name: 'Search' })

async function withContent(mock: Backend) {
  const apples = await mock.notes.createNote({
    title: 'Fruit diary',
    content: 'Today I ate an apple pie with cinnamon.',
  })
  const trees = await mock.notes.createNote({ title: 'Apple trees', content: 'Plant in spring.' })
  const link = await mock.notes.createLink({
    title: 'Orchard guide',
    url: 'https://orchard.example/apple',
    note: 'How to grow things',
  })
  return { apples, trees, link }
}

describe('highlight', () => {
  it('marks every occurrence of every term, ignoring case', () => {
    expect(highlight('Apple pie and apple tart', 'apple tart')).toEqual([
      { text: 'Apple', match: true },
      { text: ' pie and ', match: false },
      { text: 'apple', match: true },
      { text: ' ', match: false },
      { text: 'tart', match: true },
    ])
  })

  it('takes the characters of a query literally', () => {
    expect(highlight('1+1 (maybe) .*', '1+1 (maybe) .*')).toEqual([
      { text: '1+1', match: true },
      { text: ' ', match: false },
      { text: '(maybe)', match: true },
      { text: ' ', match: false },
      { text: '.*', match: true },
    ])
    expect(highlight('abc', '.')).toEqual([{ text: 'abc', match: false }])
  })

  it('prefers the longest term where they overlap, and copes with nothing to mark', () => {
    expect(highlight('application', 'app application')).toEqual([
      { text: 'application', match: true },
    ])
    expect(highlight('', 'x')).toEqual([{ text: '', match: false }])
    expect(highlight('text', '   ')).toEqual([{ text: 'text', match: false }])
  })
})

describe('opening the search', () => {
  it.each([
    ['Ctrl+K', '{Control>}k{/Control}'],
    ['Cmd+K', '{Meta>}k{/Meta}'],
  ])('opens with %s, with the cursor in the box', async (_name, keys) => {
    const mock = await signedInBackend()
    const { user } = await renderApp('/', mock)
    await screen.findByRole('button', { name: 'New document' })

    await user.keyboard(keys)

    expect(await screen.findByRole('dialog', { name: 'Search' })).toBeInTheDocument()
    expect(box()).toHaveFocus()
  })

  it('opens from the sidebar button and closes with Escape, giving the focus back', async () => {
    const mock = await signedInBackend()
    const { user } = await renderApp('/', mock)

    const button = await screen.findByRole('button', { name: /^Search/ })
    await user.click(button)
    await screen.findByRole('dialog', { name: 'Search' })
    await user.keyboard('{Escape}')

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(button).toHaveFocus()
  })

  it('works while typing in the editor, and does not type the k', async () => {
    const mock = await signedInBackend()
    const note = await mock.notes.createNote({ title: 'Doc' })
    const { user } = await renderApp(`/doc/${note.id}`, mock)
    await screen.findByLabelText('Document content (Markdown)')

    await user.keyboard('{Control>}k{/Control}')

    expect(await screen.findByRole('dialog', { name: 'Search' })).toBeInTheDocument()
    await user.keyboard('{Escape}')
    expect(screen.getByLabelText('Document content (Markdown)')).toHaveTextContent('')
  })

  it('takes the shortcut away from the browser', async () => {
    const mock = await signedInBackend()
    await renderApp('/', mock)
    await screen.findByRole('button', { name: 'New document' })

    const event = new KeyboardEvent('keydown', {
      key: 'k',
      ctrlKey: true,
      cancelable: true,
      bubbles: true,
    })
    document.body.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(true)
    await screen.findByRole('dialog', { name: 'Search' })
  })

  it('ignores other combinations with K', async () => {
    const mock = await signedInBackend()
    const { user } = await renderApp('/', mock)
    await screen.findByRole('button', { name: 'New document' })

    await user.keyboard('k{Shift>}{Control>}k{/Control}{/Shift}{Alt>}{Control>}k{/Control}{/Alt}')

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})

describe('searching', () => {
  it('asks for two characters before searching at all', async () => {
    const mock = await signedInBackend()
    const search = vi.spyOn(mock.notes, 'search')
    const { user } = await renderApp('/', mock)
    await user.keyboard('{Control>}k{/Control}')
    await screen.findByRole('dialog')

    expect(within(dialog()).getByText('Type at least 2 characters.')).toBeInTheDocument()
    await user.type(box(), 'a')
    await new Promise((r) => setTimeout(r, 80))

    expect(search).not.toHaveBeenCalled()
    expect(within(dialog()).getByText('Type at least 2 characters.')).toBeInTheDocument()
  })

  it('waits for a pause in typing and asks once, with the whole text', async () => {
    SEARCH_DEFAULTS.delayMs = 60
    const mock = await signedInBackend()
    await withContent(mock)
    const search = vi.spyOn(mock.notes, 'search')
    const { user } = await renderApp('/', mock)
    await user.keyboard('{Control>}k{/Control}')
    await screen.findByRole('dialog')

    await user.type(box(), '  apple pie ')

    await within(dialog()).findByRole('option', { name: /Fruit diary/ })
    expect(search).toHaveBeenCalledTimes(1)
    expect(search.mock.calls[0][0]).toMatchObject({ q: 'apple pie' })
  })

  it('finds by title, content and address, says what each is, and marks the match', async () => {
    const mock = await signedInBackend()
    await withContent(mock)
    const { user } = await renderApp('/', mock)
    await user.keyboard('{Control>}k{/Control}')
    await screen.findByRole('dialog')

    await user.type(box(), 'apple')

    const options = await within(dialog()).findAllByRole('option')
    expect(options.map((o) => within(o).getAllByText(/./)[1].textContent)).toEqual(
      expect.arrayContaining(['Apple trees', 'Fruit diary', 'Orchard guide']),
    )
    expect(options).toHaveLength(3)
    expect(within(dialog()).getByText('3 results')).toBeInTheDocument()

    const diary = options.find((o) => o.textContent?.includes('Fruit diary'))!
    expect(within(diary).getByText('Document')).toBeInTheDocument()
    expect(diary.querySelector('mark')).toHaveTextContent('apple')
    expect(diary).toHaveTextContent('apple pie with cinnamon')

    const orchard = options.find((o) => o.textContent?.includes('Orchard guide'))!
    expect(within(orchard).getByText('Link')).toBeInTheDocument()
    expect(orchard).toHaveTextContent('https://orchard.example/apple')
    expect(orchard.querySelector('mark')).toHaveTextContent('apple')
  })

  it('hides results of an older text as soon as the text changes, so Enter cannot open them', async () => {
    SEARCH_DEFAULTS.delayMs = 300
    const mock = await signedInBackend()
    await withContent(mock)
    const { user } = await renderApp('/', mock)
    await user.keyboard('{Control>}k{/Control}')
    await screen.findByRole('dialog')
    await user.type(box(), 'apple')
    await within(dialog()).findAllByRole('option', undefined, { timeout: 2000 })

    await user.type(box(), ' pie')

    expect(within(dialog()).queryByRole('option')).not.toBeInTheDocument()
    expect(within(dialog()).getByText('Searching…')).toBeInTheDocument()
    expect(
      await within(dialog()).findByRole('option', { name: /Fruit diary/ }, { timeout: 2000 }),
    ).toBeInTheDocument()
  })

  it('says when nothing matches', async () => {
    const mock = await signedInBackend()
    await withContent(mock)
    const { user } = await renderApp('/', mock)
    await user.keyboard('{Control>}k{/Control}')
    await screen.findByRole('dialog')

    await user.type(box(), 'zzzz')

    expect(await within(dialog()).findByText('No results for “zzzz”.')).toBeInTheDocument()
    expect(within(dialog()).queryByRole('option')).not.toBeInTheDocument()
  })

  it('shows the answer to the last text, even if an older one arrives later', async () => {
    const mock = await signedInBackend()
    await withContent(mock)
    const real = mock.notes.search.bind(mock.notes)
    vi.spyOn(mock.notes, 'search').mockImplementation(async (params) => {
      if (params.q === 'apple') await new Promise((r) => setTimeout(r, 150))
      return real(params)
    })
    const { user } = await renderApp('/', mock)
    await user.keyboard('{Control>}k{/Control}')
    await screen.findByRole('dialog')

    await user.type(box(), 'apple')
    await new Promise((r) => setTimeout(r, 40)) // the slow search is on its way
    await user.type(box(), ' pie')

    await within(dialog()).findByRole('option', { name: /Fruit diary/ })
    await new Promise((r) => setTimeout(r, 250))
    expect(within(dialog()).getAllByRole('option')).toHaveLength(1)
  })

  it('says how many were left out when there are more than it shows', async () => {
    const mock = await signedInBackend()
    for (let i = 1; i <= 25; i += 1) await mock.notes.createNote({ title: `Report ${i}` })
    const { user } = await renderApp('/', mock)
    await user.keyboard('{Control>}k{/Control}')
    await screen.findByRole('dialog')

    await user.type(box(), 'report')

    await waitFor(() => expect(within(dialog()).getAllByRole('option')).toHaveLength(20))
    expect(within(dialog()).getByText('25 results')).toBeInTheDocument()
    expect(
      within(dialog()).getByText(
        'Showing the first 20 of 25. Refine your search to narrow it down.',
      ),
    ).toBeInTheDocument()
  })

  it('shows a failure and can try again', async () => {
    const mock = await signedInBackend()
    await withContent(mock)
    const search = vi
      .spyOn(mock.notes, 'search')
      .mockRejectedValueOnce(new ApiError({ status: 0, code: 'network_error' }))
    const { user } = await renderApp('/', mock)
    await user.keyboard('{Control>}k{/Control}')
    await screen.findByRole('dialog')

    await user.type(box(), 'apple')
    expect(await within(dialog()).findByRole('alert')).toHaveTextContent(
      "We couldn't search right now.",
    )
    search.mockRestore()
    await user.click(within(dialog()).getByRole('button', { name: 'Try again' }))

    expect(await within(dialog()).findByRole('option', { name: /Fruit diary/ })).toBeInTheDocument()
    expect(within(dialog()).queryByRole('alert')).not.toBeInTheDocument()
  })
})

describe('choosing a result', () => {
  // Long enough that the whole text is typed before the search starts: the options must not change under a click.
  beforeEach(() => {
    SEARCH_DEFAULTS.delayMs = 80
  })

  async function openWith(mock: Backend, text = 'apple') {
    const app = await renderApp('/', mock)
    await app.user.keyboard('{Control>}k{/Control}')
    await screen.findByRole('dialog')
    await app.user.type(box(), text)
    await within(dialog()).findAllByRole('option')
    return app
  }

  it('opens the first one with Enter', async () => {
    const mock = await signedInBackend()
    const { apples, trees, link } = await withContent(mock)
    const { user, router } = await openWith(mock)
    const first = within(dialog()).getAllByRole('option')[0]
    expect(first).toHaveAttribute('aria-selected', 'true')
    expect(box()).toHaveAttribute('aria-activedescendant', first.id)

    await user.keyboard('{Enter}')

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await waitFor(() =>
      expect([`/doc/${apples.id}`, `/doc/${trees.id}`, `/link/${link.id}`]).toContain(
        router.state.location.pathname,
      ),
    )
  })

  it('moves with the arrows, wrapping around, and opens what is selected', async () => {
    const mock = await signedInBackend()
    await withContent(mock)
    const { user, router } = await openWith(mock)
    const options = within(dialog()).getAllByRole('option')

    await user.keyboard('{ArrowDown}')
    expect(options[1]).toHaveAttribute('aria-selected', 'true')
    expect(options[0]).toHaveAttribute('aria-selected', 'false')
    await user.keyboard('{ArrowUp}{ArrowUp}')
    expect(options[options.length - 1]).toHaveAttribute('aria-selected', 'true')
    expect(box()).toHaveAttribute('aria-activedescendant', options[options.length - 1].id)
    await user.keyboard('{ArrowDown}{ArrowDown}')
    expect(options[1]).toHaveAttribute('aria-selected', 'true')

    await user.keyboard('{Enter}')

    await waitFor(() => expect(router.state.location.pathname).not.toBe('/'))
    const [, id] = router.state.location.pathname.match(/^\/(?:doc|link)\/(.+)$/)!
    expect(options[1].textContent).toContain(
      (await mock.notes.search({ q: 'apple' })).items.find((r) => r.id === id)!.title,
    )
  })

  it('opens a link result on the link page, by click', async () => {
    const mock = await signedInBackend()
    const { link } = await withContent(mock)
    const { user, router } = await openWith(mock, 'orchard')

    await user.click(within(dialog()).getByRole('option', { name: /Orchard guide/ }))

    await waitFor(() => expect(router.state.location.pathname).toBe(`/link/${link.id}`))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('opens a document result on its page', async () => {
    const mock = await signedInBackend()
    const { apples } = await withContent(mock)
    const { user, router } = await openWith(mock, 'cinnamon')

    await user.click(within(dialog()).getByRole('option', { name: /Fruit diary/ }))

    expect(router.state.location.pathname).toBe(`/doc/${apples.id}`)
    expect(await screen.findByLabelText('Document title')).toHaveValue('Fruit diary')
  })

  it('does nothing on Enter when there is nothing to open', async () => {
    const mock = await signedInBackend()
    const { user, router } = await renderApp('/', mock)
    await user.keyboard('{Control>}k{/Control}')
    await screen.findByRole('dialog')
    await user.type(box(), 'zzzz{Enter}')

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/')
  })
})

it('speaks Spanish when the account does', async () => {
  const mock = await signedInBackend()
  await mock.auth.updateProfile({ locale: 'es' })
  await withContent(mock)
  const { user } = await renderApp('/', mock)

  await user.keyboard('{Control>}k{/Control}')
  const dialogEs = await screen.findByRole('dialog', { name: 'Buscar' })
  expect(within(dialogEs).getByText('Escribe al menos 2 caracteres.')).toBeInTheDocument()
  await user.type(
    within(dialogEs).getByRole('combobox', { name: 'Buscar documentos y enlaces' }),
    'zzzz',
  )

  expect(await within(dialogEs).findByText('Sin resultados para «zzzz».')).toBeInTheDocument()
})
