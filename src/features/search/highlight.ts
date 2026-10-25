export interface Piece {
  text: string
  match: boolean
}

/** Splits `text` into pieces, marking the ones that equal any of the terms (ignoring case). */
export function highlight(text: string, query: string): Piece[] {
  const terms = [...new Set(query.trim().split(/\s+/).filter(Boolean))]
    .sort((a, b) => b.length - a.length)
    .map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  if (terms.length === 0 || text === '') return [{ text, match: false }]
  const pieces: Piece[] = []
  let last = 0
  for (const found of text.matchAll(new RegExp(terms.join('|'), 'gi'))) {
    if (found.index > last) pieces.push({ text: text.slice(last, found.index), match: false })
    pieces.push({ text: found[0], match: true })
    last = found.index + found[0].length
  }
  if (last < text.length) pieces.push({ text: text.slice(last), match: false })
  return pieces.length > 0 ? pieces : [{ text, match: false }]
}
