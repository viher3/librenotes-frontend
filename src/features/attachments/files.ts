/** "1.5 MB" / "1,5 MB" in the given language. */
export function formatBytes(bytes: number, locale: string): string {
  const units = ['byte', 'kilobyte', 'megabyte', 'gigabyte'] as const
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  return new Intl.NumberFormat(locale, {
    style: 'unit',
    unit: units[unit],
    unitDisplay: 'short',
    maximumFractionDigits: unit === 0 ? 0 : 1,
  }).format(value)
}

/** The image types the backend is willing to serve inline, hence the ones a document can embed. */
const EMBEDDABLE = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp'])
export const isEmbeddableImage = (mimeType: string) => EMBEDDABLE.has(mimeType.toLowerCase())

/** Hands a downloaded file to the browser's "save as" flow. */
export function saveBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  anchor.rel = 'noopener'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  // The click has started the download by now; give the browser a moment before letting go of the bytes.
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

/** The Markdown that embeds an attachment as an image; `attachment:` is resolved by the preview. */
export function imageMarkdown(attachment: { id: string; fileName: string }): string {
  const alt = attachment.fileName.replace(/[[\]\\]/g, '\\$&')
  return `![${alt}](attachment:${attachment.id})`
}
