import { useQuery } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useRepositories } from '@/data/DataProvider'
import { attachmentKeys } from '@/lib/queryKeys'

/**
 * An attached image shown inside a document (`![name](attachment:ID)`). The file needs the session, so the
 * bytes are fetched with it and shown through an object URL.
 */
export function AttachmentImage({ id, alt }: { id: string; alt: string }) {
  const { t } = useTranslation('attachments')
  const { notes } = useRepositories()
  const query = useQuery({
    queryKey: attachmentKeys.content(id),
    queryFn: () => notes.downloadAttachment(id),
    staleTime: Infinity,
    gcTime: 5 * 60_000,
    retry: false,
    refetchOnWindowFocus: false,
  })
  const image = useRef<HTMLImageElement>(null)

  // The object URL is set on the element directly: its lifetime is exactly the effect's.
  useEffect(() => {
    const element = image.current
    if (!query.data || !element) return
    const objectUrl = URL.createObjectURL(query.data)
    element.src = objectUrl
    return () => {
      element.removeAttribute('src')
      URL.revokeObjectURL(objectUrl)
    }
  }, [query.data])

  if (query.isError) {
    return (
      <span
        role="img"
        aria-label={alt}
        className="text-sm text-neutral-600 dark:text-neutral-400 italic"
      >
        {t('image.failed')}
      </span>
    )
  }
  return (
    <>
      {!query.data && (
        <span
          role="img"
          aria-label={alt}
          aria-busy="true"
          className="text-sm text-neutral-600 dark:text-neutral-400 italic"
        >
          {t('image.loading')}
        </span>
      )}
      <img ref={image} alt={alt} hidden={!query.data} />
    </>
  )
}
