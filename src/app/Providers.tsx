import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { useState } from 'react'
import { DataProvider } from '@/data/DataProvider'
import { isApiError } from '@/data/errors'
import type { Repositories } from '@/data/create'
import { AuthProvider } from '@/features/auth/AuthProvider'
import '@/lib/i18n'

/** One retry for transient failures; a 4xx means the request itself is wrong, so repeating it is pointless. */
const retryTransientOnce = (failures: number, error: unknown) =>
  !(isApiError(error) && error.status >= 400 && error.status < 500) && failures < 1

export const createQueryClient = (retry: typeof retryTransientOnce | false = retryTransientOnce) =>
  new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, retry } } })

export function Providers({
  repositories,
  queryClient: provided,
  children,
}: {
  repositories: Repositories
  /** Replaceable in tests. */
  queryClient?: QueryClient
  children: ReactNode
}) {
  const [queryClient] = useState(() => provided ?? createQueryClient())
  return (
    <DataProvider repositories={repositories}>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>{children}</AuthProvider>
      </QueryClientProvider>
    </DataProvider>
  )
}
