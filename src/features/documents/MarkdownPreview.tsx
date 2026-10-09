import ReactMarkdown, { type Components } from 'react-markdown'
import rehypeHighlight from 'rehype-highlight'
import remarkGfm from 'remark-gfm'

// Safety rests on NOT enabling raw HTML (no `rehype-raw`): react-markdown then never turns markup typed in a
// note into elements. It shows it as text instead, so something like `Vec<String>` survives (a sanitizer would
// silently delete it) and nothing a note contains can run. URLs are filtered by react-markdown's own transform:
// only http(s), mailto, tel and relative addresses survive, never `javascript:` or `data:`.
// If raw HTML is ever needed, `rehype-sanitize` MUST be added back before rendering it.
const remarkPlugins = [remarkGfm]
const rehypePlugins: React.ComponentProps<typeof ReactMarkdown>['rehypePlugins'] = [
  [rehypeHighlight, { detect: false, ignoreMissing: true }],
]

const components: Components = {
  a: ({ href, children }) => {
    // In-page anchors stay in the page; everything else opens in a new tab without leaking the opener.
    if (href?.startsWith('#')) return <a href={href}>{children}</a>
    return (
      <a href={href} target="_blank" rel="noopener noreferrer nofollow">
        {children}
      </a>
    )
  },
  // Do not tell third-party servers which document is being read.
  img: ({ src, alt }) => (
    <img src={src} alt={alt ?? ''} loading="lazy" referrerPolicy="no-referrer" />
  ),
}

/** Renders Markdown (GitHub flavour) safely. */
export function MarkdownPreview({ source }: { source: string }) {
  return (
    <div className="prose prose-neutral dark:prose-invert max-w-none break-words">
      <ReactMarkdown
        remarkPlugins={remarkPlugins}
        rehypePlugins={rehypePlugins}
        components={components}
      >
        {source}
      </ReactMarkdown>
    </div>
  )
}
