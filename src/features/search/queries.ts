import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useRepositories } from '@/data/DataProvider'
import { searchKeys } from '@/lib/queryKeys'

export const SEARCH_DEFAULTS = { delayMs: 300, minLength: 2, size: 20 }

/** The value, but only after it has stopped changing for `delayMs`. */
export function useDebounced<T>(value: T, delayMs: number): T {
  const [settled, setSettled] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delayMs)
    return () => clearTimeout(timer)
  }, [value, delayMs])
  return settled
}

export function useSearchResults(q: string) {
  const { notes } = useRepositories()
  const enabled = q.length >= SEARCH_DEFAULTS.minLength
  return useQuery({
    queryKey: searchKeys.query(q),
    queryFn: () => notes.search({ q, size: SEARCH_DEFAULTS.size }),
    enabled,
    // Content changes all the time and a search is cheap: always ask again, but keep what was shown meanwhile.
    staleTime: 0,
    gcTime: 30_000,
    retry: false,
  })
}
