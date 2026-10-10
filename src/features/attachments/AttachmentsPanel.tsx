import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Alert } from '@/components/Alert'
import { Button } from '@/components/Button'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import type { Attachment } from '@/data/types'
import { errorMessage } from '@/features/auth/errors'
import { formatBytes, isEmbeddableImage, saveBlob } from './files'
import {
  useDeleteAttachment,
  useDownloadAttachment,
  type AttachmentOwner,
  type AttachmentUploads,
} from './queries'

interface AttachmentsPanelProps {
  owner: AttachmentOwner
  attachments: Attachment[]
  uploads: AttachmentUploads
  /** True while files are being dragged over the page. */
  dragging: boolean
  /** When given, images get an _Insert_ button that embeds them in the document. */
  onInsert?: (attachment: Attachment) => void
}

/** The files of a document or folder: add (button or drop), download, delete and, for images, embed. */
export function AttachmentsPanel({
  owner,
  attachments,
  uploads,
  dragging,
  onInsert,
}: AttachmentsPanelProps) {
  const { t, i18n } = useTranslation('attachments')
  const language = i18n.resolvedLanguage ?? 'en'
  const input = useRef<HTMLInputElement>(null)
  const download = useDownloadAttachment()
  const remove = useDeleteAttachment(owner)
  const [downloading, setDownloading] = useState<string | null>(null)
  const [downloadFailed, setDownloadFailed] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<Attachment | null>(null)

  const onPick = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? [])
    event.target.value = '' // so picking the same file again still counts
    if (files.length > 0) uploads.add(files)
  }

  const save = (attachment: Attachment) => {
    setDownloadFailed(null)
    setDownloading(attachment.id)
    download.mutate(attachment, {
      onSuccess: ({ blob, fileName }) => saveBlob(blob, fileName),
      onError: () => setDownloadFailed(attachment.fileName),
      onSettled: () => setDownloading(null),
    })
  }

  const confirmDelete = () => {
    if (!deleting) return
    remove.mutate(deleting.id, { onSuccess: () => setDeleting(null) })
  }

  const empty = attachments.length === 0 && uploads.uploads.length === 0

  return (
    <section
      aria-label={t('title')}
      className={`flex flex-col gap-2 rounded-md border border-dashed p-3 text-sm ${
        dragging
          ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/40'
          : 'border-neutral-300 dark:border-neutral-700'
      }`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-medium text-neutral-600 dark:text-neutral-400">
          {t('title')}
          {attachments.length > 0 && ` (${attachments.length})`}
        </h3>
        <Button
          variant="secondary"
          className="px-2 py-0.5 text-xs"
          onClick={() => input.current?.click()}
        >
          {t('attach')}
        </Button>
        <input
          ref={input}
          type="file"
          multiple
          hidden
          tabIndex={-1}
          aria-label={t('attach')}
          onChange={onPick}
        />
        {dragging ? (
          <span className="text-xs text-neutral-600 dark:text-neutral-400" role="status">
            {t('dropping')}
          </span>
        ) : (
          empty && (
            <span className="text-xs text-neutral-600 dark:text-neutral-400">{t('hint')}</span>
          )
        )}
      </div>

      {downloadFailed && (
        <Alert tone="error">{t('downloadFailed', { name: downloadFailed })}</Alert>
      )}

      {(attachments.length > 0 || uploads.uploads.length > 0) && (
        <ul className="flex flex-col divide-y divide-neutral-200 dark:divide-neutral-800">
          {attachments.map((attachment) => (
            <li key={attachment.id} className="flex flex-wrap items-center gap-2 py-1.5">
              <span aria-hidden="true">{isEmbeddableImage(attachment.mimeType) ? '🖼️' : '📎'}</span>
              <span className="min-w-0 flex-1 truncate" title={attachment.fileName}>
                {attachment.fileName}
              </span>
              <span className="text-xs text-neutral-600 dark:text-neutral-400">
                {formatBytes(attachment.sizeBytes, language)}
              </span>
              {onInsert && isEmbeddableImage(attachment.mimeType) && (
                <Button
                  variant="ghost"
                  className="px-2 py-0.5 text-xs"
                  aria-label={t('insertLabel', { name: attachment.fileName })}
                  onClick={() => onInsert(attachment)}
                >
                  {t('insert')}
                </Button>
              )}
              <Button
                variant="ghost"
                className="px-2 py-0.5 text-xs"
                aria-label={t('downloadLabel', { name: attachment.fileName })}
                disabled={downloading === attachment.id}
                onClick={() => save(attachment)}
              >
                {t('download')}
              </Button>
              <Button
                variant="ghost"
                className="px-2 py-0.5 text-xs"
                aria-label={t('deleteLabel', { name: attachment.fileName })}
                onClick={() => {
                  remove.reset()
                  setDeleting(attachment)
                }}
              >
                {t('delete')}
              </Button>
            </li>
          ))}
          {uploads.uploads.map((upload) => (
            <li key={upload.key} className="flex flex-wrap items-center gap-2 py-1.5">
              <span aria-hidden="true">⏳</span>
              <span className="min-w-0 flex-1 truncate" title={upload.file.name}>
                {upload.file.name}
              </span>
              {upload.error ? (
                <>
                  <span role="alert" className="text-xs text-red-600 dark:text-red-400">
                    {upload.error}
                  </span>
                  {upload.file.size > 0 && (
                    <Button
                      variant="ghost"
                      className="px-2 py-0.5 text-xs"
                      onClick={() => uploads.retry(upload.key)}
                    >
                      {t('retry')}
                    </Button>
                  )}
                </>
              ) : (
                <progress
                  aria-label={t('progress', { name: upload.file.name })}
                  value={Math.round(upload.progress * 100)}
                  max={100}
                  className="h-2 w-32"
                />
              )}
              <Button
                variant="ghost"
                className="px-2 py-0.5 text-xs"
                onClick={() => uploads.dismiss(upload.key)}
              >
                {t('dismiss')}
              </Button>
            </li>
          ))}
        </ul>
      )}

      {deleting && (
        <ConfirmDialog
          title={t('deleteDialog.title')}
          confirmLabel={t('deleteDialog.confirm')}
          cancelLabel={t('deleteDialog.cancel')}
          destructive
          busy={remove.isPending}
          onConfirm={confirmDelete}
          onCancel={() => setDeleting(null)}
        >
          <p>{t('deleteDialog.body', { name: deleting.fileName })}</p>
          {remove.isError && (
            <div className="mt-3">
              <Alert tone="error">{errorMessage(remove.error)}</Alert>
            </div>
          )}
        </ConfirmDialog>
      )}
    </section>
  )
}
