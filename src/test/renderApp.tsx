import { render } from '@testing-library/react'
import { StrictMode } from 'react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { Providers, createQueryClient } from '@/app/Providers'
import { routes } from '@/app/router'
import { activationTokenFor, createMockRepositories } from '@/data/mock'
import i18n from '@/lib/i18n'

export const ACCOUNT = { email: 'ada@example.com', password: 'secret123', username: 'ada' }

/** A mock backend with one activated account (not signed in). */
export async function createBackend(account = ACCOUNT) {
  const mock = createMockRepositories()
  await mock.auth.signUp(account)
  await mock.auth.activate(activationTokenFor(account.email))
  return mock
}

/** Renders the whole app at `path` against the given (mock) repositories. */
export async function renderApp(path: string, mock: Awaited<ReturnType<typeof createBackend>>) {
  await i18n.changeLanguage('en')
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  const user = userEvent.setup()
  const view = render(
    <StrictMode>
      <Providers
        repositories={{ auth: mock.auth, notes: mock.notes, session: mock.session }}
        queryClient={createQueryClient(false)}
      >
        <RouterProvider router={router} />
      </Providers>
    </StrictMode>,
  )
  return { ...view, user, router }
}
