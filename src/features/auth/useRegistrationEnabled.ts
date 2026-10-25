import { useQuery } from '@tanstack/react-query'
import { useRepositories } from '@/data/DataProvider'

/**
 * Whether the backend accepts self-registrations: `undefined` while it is being asked. A failed lookup
 * counts as "no", so the sign-up entry points are only shown when the backend said so.
 */
export function useRegistrationEnabled(): boolean | undefined {
  const { auth } = useRepositories()
  const { data, isError } = useQuery({
    queryKey: ['registrationEnabled'],
    queryFn: () => auth.registrationEnabled(),
  })
  return isError ? false : data
}
