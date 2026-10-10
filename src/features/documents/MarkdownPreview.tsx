import ReactMarkdown, {
  defaultUrlTransform,
  type Components,
  type UrlTransform,
} from 'react-markdown'
import rehypeHighlight from 'rehype-highlight'
import remarkGfm from 'remark-gfm'
import { AttachmentImage } from '@/features/attachments/AttachmentImage'

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
  img: ({ src, alt }) => {
    const attachment = typeof src === 'string' ? ATTACHMENT_SRC.exec(src) : null
    if (attachment) return <AttachmentImage id={attachment[1]} alt={alt ?? ''} />
    return <img src={src} alt={alt ?? ''} loading="lazy" referrerPolicy="no-referrer" />
  },
}

// `attachment:<id>` points at a file attached to the app's own backend. It is accepted for images only, with an
// id that cannot be anything but an id, and is loaded through the data layer (never as a URL of its own).
const ATTACHMENT_SRC = /^attachment:([\w-]{1,64})$/

const urlTransform: UrlTransform = (url, key, node) =>
  key === 'src' && node.tagName === 'img' && ATTACHMENT_SRC.test(url)
    ? url
    : defaultUrlTransform(url)

/** Renders Markdown (GitHub flavour) safely. */
export function MarkdownPreview({ source }: { source: string }) {
  return (
    <div className="prose prose-neutral dark:prose-invert max-w-none break-words">
      <ReactMarkdown
        remarkPlugins={remarkPlugins}
        rehypePlugins={rehypePlugins}
        components={components}
        urlTransform={urlTransform}
      >
        {source}
      </ReactMarkdown>
    </div>
  )
}
