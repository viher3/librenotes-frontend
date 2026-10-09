import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { MarkdownPreview } from './MarkdownPreview'

const renderMd = (source: string) => render(<MarkdownPreview source={source} />)

describe('MarkdownPreview', () => {
  it('renders GitHub-flavoured Markdown', () => {
    renderMd(
      [
        '# Title',
        '',
        'Some **bold**, _italic_ and ~~struck~~ text with `code`.',
        '',
        '- [x] done',
        '- [ ] todo',
        '',
        '| a | b |',
        '| - | - |',
        '| 1 | 2 |',
        '',
        '> quoted',
      ].join('\n'),
    )

    expect(screen.getByRole('heading', { level: 1, name: 'Title' })).toBeInTheDocument()
    expect(screen.getByText('bold').tagName).toBe('STRONG')
    expect(screen.getByText('struck').tagName).toBe('DEL')
    expect(screen.getAllByRole('checkbox')).toHaveLength(2)
    expect(screen.getAllByRole('checkbox')[0]).toBeChecked()
    expect(screen.getAllByRole('checkbox')[0]).toBeDisabled()
    expect(screen.getByRole('table')).toBeInTheDocument()
    expect(screen.getByText('quoted').closest('blockquote')).not.toBeNull()
  })

  it('highlights fenced code in its language', () => {
    const { container } = renderMd('```js\nconst answer = 42\n```')

    expect(container.querySelector('code.language-js')).not.toBeNull()
    expect(container.querySelector('.hljs-keyword')?.textContent).toBe('const')
    expect(container.querySelector('.hljs-number')?.textContent).toBe('42')
  })

  it('leaves unknown languages as plain code', () => {
    const { container } = renderMd('```nonsense\nhello\n```')

    expect(container.querySelector('pre code')?.textContent).toContain('hello')
  })

  it('opens links in a new tab without leaking the opener, except in-page anchors', () => {
    renderMd('[site](https://example.com) and [here](#section)')

    expect(screen.getByRole('link', { name: 'site' })).toHaveAttribute('target', '_blank')
    expect(screen.getByRole('link', { name: 'site' })).toHaveAttribute(
      'rel',
      'noopener noreferrer nofollow',
    )
    expect(screen.getByRole('link', { name: 'here' })).not.toHaveAttribute('target')
  })

  it('keeps remote images from learning which document is read', () => {
    renderMd('![diagram](https://example.com/a.png)')

    const image = screen.getByRole('img', { name: 'diagram' })
    expect(image).toHaveAttribute('referrerpolicy', 'no-referrer')
    expect(image).toHaveAttribute('loading', 'lazy')
  })

  describe('safety', () => {
    it('never turns markup typed in a note into elements, and shows it as text', () => {
      const { container } = renderMd(
        [
          '<script>window.__pwned = 1</script>',
          '<img src="x" onerror="window.__pwned = 2">',
          '<a href="https://ok.example" onclick="window.__pwned = 3">link</a>',
          '<iframe src="https://evil.example"></iframe>',
          '<style>body { display: none }</style>',
          '<div style="position:fixed;inset:0">overlay</div>',
        ].join('\n\n'),
      )

      expect(
        container.querySelector(
          '.prose script, .prose iframe, .prose style, .prose form, .prose div, [onerror], [onclick], [style]',
        ),
      ).toBeNull()
      expect(container.querySelector('img')).toBeNull()
      expect(container.textContent).toContain('<script>window.__pwned = 1</script>')
      expect((window as unknown as { __pwned?: number }).__pwned).toBeUndefined()
    })

    it('does not swallow angle brackets that merely look like HTML tags', () => {
      renderMd('Use Vec<String> or Array<number> here, and <b>not bold</b>.')

      expect(screen.getByText(/Use Vec<String> or Array<number> here/)).toBeInTheDocument()
      expect(screen.getByText(/<b>not bold<\/b>/)).toBeInTheDocument()
    })

    it.each([
      ['javascript:', '[x](javascript:alert(1))'],
      ['data:', '[x](data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==)'],
      ['vbscript:', '[x](vbscript:msgbox(1))'],
      ['an image with javascript:', '![x](javascript:alert(1))'],
      ['a reference link with javascript:', '[x][r]\n\n[r]: javascript:alert(1)'],
    ])('drops %s URLs', (_name, source) => {
      const { container } = renderMd(source)

      const urls = [...container.querySelectorAll('[href], [src]')].map(
        (node) => node.getAttribute('href') ?? node.getAttribute('src') ?? '',
      )
      expect(urls.join(' ')).not.toMatch(/javascript|data:|vbscript/i)
    })

    it('keeps ordinary URLs', () => {
      renderMd('[web](https://example.com/a?b=c) [mail](mailto:a@b.co) [rel](/docs/1)')

      expect(screen.getByRole('link', { name: 'web' })).toHaveAttribute(
        'href',
        'https://example.com/a?b=c',
      )
      expect(screen.getByRole('link', { name: 'mail' })).toHaveAttribute('href', 'mailto:a@b.co')
      expect(screen.getByRole('link', { name: 'rel' })).toHaveAttribute('href', '/docs/1')
    })

    it('does not let HTML inside code pass as markup', () => {
      const { container } = renderMd('`<script>alert(1)</script>`')

      expect(container.querySelector('script')).toBeNull()
      expect(container.querySelector('code')?.textContent).toBe('<script>alert(1)</script>')
    })
  })
})
