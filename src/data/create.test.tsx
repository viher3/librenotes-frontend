import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { DataProvider, useRepositories } from './DataProvider'
import { createRepositories } from './create'

describe('createRepositories', () => {
  it('builds the HTTP data layer by default', async () => {
    const repositories = await createRepositories({
      env: { VITE_API_URL: 'http://api.test', VITE_DATA_ADAPTER: 'http' },
    })

    expect(repositories.auth.login).toBeTypeOf('function')
    expect(repositories.notes.listNotes).toBeTypeOf('function')
    expect(repositories.session.hasSession).toBe(false)
  })

  it('fails with an actionable message when the backend URL is missing', async () => {
    await expect(
      createRepositories({ env: { VITE_API_URL: '', VITE_DATA_ADAPTER: 'http' } }),
    ).rejects.toThrow(/VITE_API_URL/)
  })

  it('serves the in-memory mock in development when asked for', async () => {
    const { auth } = await createRepositories({
      env: { VITE_API_URL: '', VITE_DATA_ADAPTER: 'mock' },
    })

    await expect(auth.login('demo@example.com', 'demo12345')).resolves.toMatchObject({
      email: 'demo@example.com',
    })
  })

  it('never serves the mock outside development, even if configured', async () => {
    vi.stubEnv('DEV', false)
    try {
      await expect(
        createRepositories({ env: { VITE_API_URL: '', VITE_DATA_ADAPTER: 'mock' } }),
      ).rejects.toThrow(/VITE_API_URL/)
    } finally {
      vi.unstubAllEnvs()
    }
  })
})

describe('DataProvider', () => {
  it('exposes the repositories to the tree and refuses to work without a provider', async () => {
    const repositories = await createRepositories({
      env: { VITE_API_URL: 'http://api.test', VITE_DATA_ADAPTER: 'http' },
    })
    const Probe = () => <p>{useRepositories() === repositories ? 'same' : 'different'}</p>

    render(
      <DataProvider repositories={repositories}>
        <Probe />
      </DataProvider>,
    )
    expect(screen.getByText('same')).toBeInTheDocument()

    const quiet = console.error
    console.error = () => {}
    expect(() => render(<Probe />)).toThrow(/DataProvider/)
    console.error = quiet
  })
})
