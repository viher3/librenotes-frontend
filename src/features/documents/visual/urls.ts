/**
 * Which addresses the visual editor is willing to turn into a link or an image. Everything else is kept as the
 * text it was typed as (never dropped, never made clickable).
 */
const LINK_PROTOCOLS = new Set(['http:', 'https:', 'mailto:', 'tel:'])
const ATTACHMENT = /^attachment:[\w-]{1,64}$/

export function isSafeUrl(url: string, kind: 'link' | 'image'): boolean {
  const value = url.trim()
  if (value === '') return true
  if (kind === 'image' && ATTACHMENT.test(value)) return true
  // Strip what browsers ignore inside a scheme so "java\tscript:" cannot slip through.
  const compact = [...value]
    .filter((char) => {
      const code = char.charCodeAt(0)
      return code > 0x20 && (code < 0x7f || code > 0x9f)
    })
    .join('')
  const scheme = /^([a-zA-Z][a-zA-Z0-9+.-]*):/.exec(compact)
  if (!scheme) return true // relative, #anchor, /path, ?query, protocol-relative
  const protocol = `${scheme[1].toLowerCase()}:`
  return kind === 'image'
    ? protocol === 'http:' || protocol === 'https:'
    : LINK_PROTOCOLS.has(protocol)
}
