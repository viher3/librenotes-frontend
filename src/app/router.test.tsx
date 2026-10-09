import { render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { Providers } from './Providers'
import { routes } from './router'
import i18n from '@/lib/i18n'

const renderAt = async (path: string, lng = 'en') => {
  await i18n.changeLanguage(lng)
  render(
    <Providers>
      <RouterProvider router={createMemoryRouter(routes, { initialEntries: [path] })} />
    </Providers>,
  )
}

describe('router', () => {
  it('renders home inside the layout', async () => {
    await renderAt('/')
    expect(screen.getByRole('heading', { name: 'Your notes' })).toBeInTheDocument()
  })

  it('translates when the language changes', async () => {
    await renderAt('/', 'es')
    expect(screen.getByRole('heading', { name: 'Tus notas' })).toBeInTheDocument()
  })

  it('renders 404 on unknown routes', async () => {
    await renderAt('/nope')
    expect(screen.getByRole('heading', { name: 'Page not found' })).toBeInTheDocument()
  })
})
