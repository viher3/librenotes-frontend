import { createBrowserRouter, type RouteObject } from 'react-router-dom'
import { ActivatePage } from '@/features/auth/ActivatePage'
import { AuthLayout } from '@/features/auth/AuthLayout'
import { CheckEmailPage } from '@/features/auth/CheckEmailPage'
import { PublicOnly, RequireAuth } from '@/features/auth/guards'
import { LoginPage } from '@/features/auth/LoginPage'
import { RegisterPage } from '@/features/auth/RegisterPage'
import { AppLayout } from './AppLayout'
import { HomePage } from '@/features/documents/HomePage'
import { NotFoundPage } from './pages'

export const routes: RouteObject[] = [
  {
    element: <AuthLayout />,
    children: [
      {
        element: <PublicOnly />,
        children: [
          { path: '/login', element: <LoginPage /> },
          { path: '/register', element: <RegisterPage /> },
          { path: '/register/check-email', element: <CheckEmailPage /> },
        ],
      },
      // Reachable whether or not someone is signed in: it is opened from an email.
      { path: '/activate', element: <ActivatePage /> },
    ],
  },
  {
    element: <RequireAuth />,
    children: [
      {
        element: <AppLayout />,
        children: [
          { path: '/', element: <HomePage /> },
          {
            path: '/folder/:id',
            lazy: async () => ({
              Component: (await import('@/features/folders/FolderPage')).default,
            }),
          },
          {
            path: '/link/:id',
            lazy: async () => ({
              Component: (await import('@/features/links/LinkPage')).default,
            }),
          },
          {
            path: '/links',
            lazy: async () => ({
              Component: (await import('@/features/links/LinksPage')).default,
            }),
          },
          {
            path: '/trash',
            lazy: async () => ({
              Component: (await import('@/features/trash/TrashPage')).default,
            }),
          },
          {
            path: '/tag/:name',
            lazy: async () => ({
              Component: (await import('@/features/tags/TagPage')).default,
            }),
          },
          {
            path: '/doc/:id',
            lazy: async () => ({
              Component: (await import('@/features/documents/DocumentPage')).default,
            }),
          },
          { path: '*', element: <NotFoundPage /> },
        ],
      },
    ],
  },
]

export const router = createBrowserRouter(routes)
