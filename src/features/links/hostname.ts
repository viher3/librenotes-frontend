/** The name of a site from its address ("https://www.example.com/a" → "example.com"); the address itself if it cannot be read. */
export function siteName(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '') || url
  } catch {
    return url
  }
}
