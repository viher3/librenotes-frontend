import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { useRepositories } from '@/data/DataProvider'
import { tagKeys } from '@/lib/queryKeys'

const PAGE_SIZE = 20

/** Every tag in use with how many items carry it, most used first. */
export function useTags() {
  const { notes } = useRepositories()
  return useQuery({ queryKey: tagKeys.list(), queryFn: () => notes.listTags() })
}

/** The documents that carry a tag, newest first, a page at a time. */
export function useTaggedNotes(name: string) {
  const { notes } = useRepositories()
  return useInfiniteQuery({
    queryKey: tagKeys.notes(name),
    initialPageParam: 1,
    queryFn: ({ pageParam }) =>
      notes.listNotes({
        tag: name,
        page: pageParam,
        size: PAGE_SIZE,
        orderBy: 'updatedAt',
        orderDirection: 'desc',
      }),
    getNextPageParam: (last) => (last.page < last.lastPage ? last.page + 1 : undefined),
  })
}

/** The links that carry a tag, newest first, a page at a time. */
export function useTaggedLinks(name: string) {
  const { notes } = useRepositories()
  return useInfiniteQuery({
    queryKey: tagKeys.links(name),
    initialPageParam: 1,
    queryFn: ({ pageParam }) =>
      notes.listLinks({
        tag: name,
        page: pageParam,
        size: PAGE_SIZE,
        orderBy: 'updatedAt',
        orderDirection: 'desc',
      }),
    getNextPageParam: (last) => (last.page < last.lastPage ? last.page + 1 : undefined),
  })
}
