import { EditorView } from '@codemirror/view'
import { screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { findEditor } from '@/test/editor'
import { ACCOUNT, createBackend, renderApp } from '@/test/renderApp'
import { applyStoredTheme, storedTheme } from '@/lib/theme'
import { openAccount } from '@/test/createMenu'

async function signedInBackend() {
  const mock = await createBackend()
  await mock.auth.login(ACCOUNT.email, ACCOUNT.password)
  return mock
}

/** Pretends the screen is narrow (the sidebar becomes a drawer). */
function narrowScreen() {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia
}

beforeEach(() => {
  localStorage.clear()
  document.documentElement.dataset.theme = 'dark'
})
afterEach(() => {
  // jsdom has no matchMedia: put it back as it was
  delete (window as { matchMedia?: unknown }).matchMedia
  localStorage.clear()
  document.documentElement.dataset.theme = 'dark'
})

describe('theme', () => {
  it('is dark unless the user chose otherwise', () => {
    expect(storedTheme()).toBe('dark')
    localStorage.setItem('librenotes.theme', 'nonsense')
    expect(storedTheme()).toBe('dark')
    localStorage.setItem('librenotes.theme', 'light')
    applyStoredTheme()
    expect(document.documentElement.dataset.theme).toBe('light')
  })

  it('is switched from the sidebar, applied at once and remembered', async () => {
    const mock = await signedInBackend()
    const { user } = await renderApp('/', mock)

    await openAccount(user)
    const select = await screen.findByRole('combobox', { name: 'Theme' })
    expect(select).toHaveValue('dark')
    await user.selectOptions(select, 'light')

    expect(document.documentElement.dataset.theme).toBe('light')
    expect(localStorage.getItem('librenotes.theme')).toBe('light')
    expect(select).toHaveValue('light')
  })

  it('is also available before signing in', async () => {
    const mock = await createBackend()
    const { user } = await renderApp('/login', mock)

    await user.selectOptions(await screen.findByRole('combobox', { name: 'Theme' }), 'light')

    expect(document.documentElement.dataset.theme).toBe('light')
  })

  it('changes the editor too', async () => {
    const mock = await signedInBackend()
    const note = await mock.notes.createNote({ title: 'Doc' })
    const { user } = await renderApp(`/doc/${note.id}`, mock)
    await screen.findByLabelText('Document content (Markdown)')
    const dark = async () => (await findEditor()).state.facet(EditorView.darkTheme)
    expect(await dark()).toBe(true)

    await openAccount(user)
    await user.selectOptions(screen.getByRole('combobox', { name: 'Theme' }), 'light')

    await waitFor(async () => expect(await dark()).toBe(false))
  })
})

describe('sidebar on a narrow screen', () => {
  it('starts closed, out of the tab order, and opens from the menu button', async () => {
    narrowScreen()
    const mock = await signedInBackend()
    const { user } = await renderApp('/', mock)

    const button = await screen.findByRole('button', { name: 'Open menu' })
    const sidebar = document.getElementById('sidebar')!
    expect(button).toHaveAttribute('aria-expanded', 'false')
    expect(sidebar).toHaveAttribute('inert')

    await user.click(button)

    expect(screen.getByRole('button', { name: 'Close menu' })).toHaveAttribute(
      'aria-expanded',
      'true',
    )
    expect(sidebar).not.toHaveAttribute('inert')
    expect(within(sidebar).getByRole('link', { name: 'Links' })).toBeInTheDocument()
  })

  it('closes when something is chosen, on Escape and on a click outside', async () => {
    narrowScreen()
    const mock = await signedInBackend()
    const { user } = await renderApp('/', mock)
    const sidebar = () => document.getElementById('sidebar')!

    await user.click(await screen.findByRole('button', { name: 'Open menu' }))
    await user.click(within(sidebar()).getByRole('link', { name: 'Links' }))
    expect(await screen.findByRole('heading', { name: 'Links' })).toBeInTheDocument()
    await waitFor(() => expect(sidebar()).toHaveAttribute('inert'))

    await user.click(screen.getByRole('button', { name: 'Open menu' }))
    expect(sidebar()).not.toHaveAttribute('inert')
    await user.keyboard('{Escape}')
    expect(sidebar()).toHaveAttribute('inert')

    await user.click(screen.getByRole('button', { name: 'Open menu' }))
    await user.click(screen.getByTestId('drawer-backdrop'))
    expect(sidebar()).toHaveAttribute('inert')
  })

  it('is always there on a wide screen', async () => {
    const mock = await signedInBackend()
    await renderApp('/', mock)

    await screen.findByRole('link', { name: 'Links' })
    expect(document.getElementById('sidebar')).not.toHaveAttribute('inert')
  })
})

describe('keyboard and screen readers', () => {
  it('lets the keyboard skip the sidebar', async () => {
    const mock = await signedInBackend()
    const { user } = await renderApp('/', mock)

    await screen.findByRole('link', { name: 'Links' })
    await user.tab()
    const skip = screen.getByRole('link', { name: 'Skip to content' })
    expect(skip).toHaveFocus()
    await user.keyboard('{Enter}')

    expect(screen.getByRole('main')).toHaveFocus()
  })

  it('names its landmarks', async () => {
    const mock = await signedInBackend()
    await renderApp('/', mock)

    await screen.findByRole('link', { name: 'Links' })
    expect(screen.getByRole('complementary', { name: 'Sidebar' })).toBeInTheDocument()
    expect(screen.getByRole('main')).toBeInTheDocument()
  })
})
