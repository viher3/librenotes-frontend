import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'
import { Providers } from '@/app/Providers'
import { router } from '@/app/router'
import { createRepositories } from '@/data/create'
import './index.css'

async function bootstrap() {
  const root = createRoot(document.getElementById('root')!)
  try {
    const repositories = await createRepositories()
    root.render(
      <StrictMode>
        <Providers repositories={repositories}>
          <RouterProvider router={router} />
        </Providers>
      </StrictMode>,
    )
  } catch (error) {
    // Misconfiguration (e.g. missing VITE_API_URL): fail visibly instead of showing a blank page.
    console.error(error)
    document.getElementById('root')!.textContent =
      error instanceof Error ? error.message : String(error)
  }
}

void bootstrap()
