import { createContext, useContext, type ReactNode } from 'react'
import type { Repositories } from './create'

const DataContext = createContext<Repositories | null>(null)

export function DataProvider({
  repositories,
  children,
}: {
  repositories: Repositories
  children: ReactNode
}) {
  return <DataContext.Provider value={repositories}>{children}</DataContext.Provider>
}

export function useRepositories(): Repositories {
  const repositories = useContext(DataContext)
  if (!repositories) throw new Error('useRepositories must be used inside <DataProvider>')
  return repositories
}

/** Like `useRepositories`, but `null` outside a provider (for components that also render without the app). */
export function useOptionalRepositories(): Repositories | null {
  return useContext(DataContext)
}
