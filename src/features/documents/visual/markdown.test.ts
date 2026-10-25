import { afterEach, describe, expect, it } from 'vitest'
import { REPORT_DELAY_MS, createVisualEditor, type VisualEditorHandle } from './editor'
import { isSafeUrl } from './urls'

// ProseMirror puts an <img class="ProseMirror-separator"> after some inline content: not part of the document.
const REAL_IMG = 'img:not(.ProseMirror-separator)'

const open: VisualEditorHandle[] = []
afterEach(async () => {
  while (open.length) await open.pop()!.destroy()
})

async function load(markdown: string, onUserChange: (m: string) => void = () => {}) {
  const root = document.createElement('div')
  document.body.appendChild(root)
  const handle = await createVisualEditor({ root, value: markdown, label: 'Content', onUserChange })
  open.push(handle)
  return { handle, root }
}

/** Markdown -> editor -> Markdown. */
async function roundTrip(markdown: string) {
  return (await load(markdown)).handle.markdown().replace(/\n+$/, '')
}

describe('documents come back the way they went in', () => {
  it.each([
    ['paragraphs', 'One paragraph.\n\nAnother one.'],
    ['headings', '# One\n\n## Two\n\n### Three\n\n#### Four\n\n###### Six'],
    ['emphasis', 'Some **bold**, _italic_, `code` and ~~strike~~ text.'],
    ['bullet list', '- one\n- two\n  - nested\n  - nested too\n- three'],
    ['numbered list', '1. first\n2. second\n3. third'],
    ['task list', '- [ ] todo\n- [x] done'],
    ['quote', '> a quote\n>\n> second paragraph'],
    ['code block', '```js\nconst a = 1\n\nconsole.log(a)\n```'],
    ['code block without language', '```\nplain\n```'],
    ['rule', 'before\n\n---\n\nafter'],
    ['link', 'See [the docs](https://example.com/a?b=c#d).'],
    ['autolink', 'Visit <https://example.com> now.'],
    ['image', '![a diagram](https://example.com/a.png)'],
    ['attachment image', '![diagram](attachment:0b9f-1c2d)'],
    ['table', '| a | b |\n| - | - |\n| 1 | 2 |'],
  ])('%s', async (_name, markdown) => {
    expect(await roundTrip(markdown)).toBe(markdown)
  })

  it('keeps text that merely looks like markup or HTML', async () => {
    const source = 'Vec<String> and snake_case_name and a_b, also x < y > z & co.'
    expect(await roundTrip(source)).toBe(source)
  })

  it('keeps raw HTML exactly as typed, as text', async () => {
    const source = '<script>alert(1)</script>\n\n<b>bold?</b>\n\n<img src=x onerror=alert(1)>'
    expect(await roundTrip(source)).toBe(source)
  })

  it('writes a hard line break with a backslash', async () => {
    expect(await roundTrip('line one  \nline two')).toBe('line one\\\nline two')
  })

  it('writes the same style whatever style came in', async () => {
    expect(await roundTrip('* star\n* list')).toBe('- star\n- list')
    expect(await roundTrip('a\n\n***\n\nb')).toBe('a\n\n---\n\nb')
    expect(await roundTrip('__bold__ and *it*')).toBe('**bold** and _it_')
    expect(await roundTrip('| a | b |\n| --- | --- |\n| 1 | 2 |')).toBe(
      '| a | b |\n| - | - |\n| 1 | 2 |',
    )
  })

  it('does not choke on an empty document or a lone newline', async () => {
    expect(await roundTrip('')).toBe('')
    expect(await roundTrip('\n')).toBe('')
  })
})

describe('what the editor will not make into a link or an image', () => {
  it.each([
    'javascript:alert(1)',
    'JaVaScRiPt:alert(1)',
    'java\tscript:alert(1)',
    'data:text/html;base64,AAAA',
    'vbscript:msgbox(1)',
    'file:///etc/passwd',
  ])('%s', async (url) => {
    const link = `[click](${url})`
    const { handle, root } = await load(link)

    expect(root.querySelector('a')).toBeNull()
    // It is still there, as text, and survives a save (a tab inside is not even a link to begin with).
    expect(root.textContent).toContain(`](${url})`)
    expect(handle.markdown().replace(/\\|\n+$/g, '')).toBe(link)

    const image = `![x](${url})`
    const { root: imageRoot } = await load(image)
    expect(imageRoot.querySelector(REAL_IMG)).toBeNull()
  })

  it('keeps safe addresses as links', async () => {
    const { root } = await load('[a](https://a.co) [b](mailto:x@y.z) [c](/relative) [d](#top)')

    expect([...root.querySelectorAll('a')].map((a) => a.getAttribute('href'))).toEqual([
      'https://a.co',
      'mailto:x@y.z',
      '/relative',
      '#top',
    ])
  })

  it('opens links safely', async () => {
    const { root } = await load('[a](https://a.co)')

    const anchor = root.querySelector('a')!
    expect(anchor).toHaveAttribute('target', '_blank')
    expect(anchor).toHaveAttribute('rel', 'noopener noreferrer nofollow')
  })

  it('never builds elements from HTML in the text', async () => {
    const { root } = await load('<script>alert(1)</script> <img src=x onerror=alert(1)> <b>x</b>')

    expect(root.querySelector(`script, b, ${REAL_IMG}`)).toBeNull()
    expect(root.textContent).toContain('<script>alert(1)</script>')
  })
})

describe('isSafeUrl', () => {
  it('allows web, mail, phone, relative and anchors for links', () => {
    for (const url of [
      'https://a.co',
      'HTTP://A.CO',
      'mailto:a@b.c',
      'tel:+34123',
      '/x',
      'x/y',
      '#a',
      '?q=1',
      '',
    ]) {
      expect(isSafeUrl(url, 'link'), url).toBe(true)
    }
  })

  it('allows only web addresses and attachments for images', () => {
    expect(isSafeUrl('attachment:abc-123', 'image')).toBe(true)
    expect(isSafeUrl('attachment:abc-123', 'link')).toBe(false)
    expect(isSafeUrl('attachment:../x', 'image')).toBe(false)
    expect(isSafeUrl('mailto:a@b.c', 'image')).toBe(false)
    expect(isSafeUrl('https://a.co/i.png', 'image')).toBe(true)
  })

  it('refuses scripts however they are disguised', () => {
    for (const url of [
      'javascript:1',
      ' JAVASCRIPT:1',
      'jav\nascript:1',
      'java\u0000script:1',
      'data:x',
      'blob:x',
    ]) {
      expect(isSafeUrl(url, 'link'), JSON.stringify(url)).toBe(false)
    }
  })
})

describe('reporting changes', () => {
  it('does not report anything for a document that was only opened', async () => {
    const changes: string[] = []
    const { handle } = await load('# Title\n\n* odd style', (m) => changes.push(m))
    handle.markdown()
    await new Promise((r) => setTimeout(r, REPORT_DELAY_MS * 3))

    expect(changes).toEqual([])
  })

  it('does not report a replacement that came from outside', async () => {
    const changes: string[] = []
    const { handle } = await load('first', (m) => changes.push(m))

    handle.replace('second')
    await new Promise((r) => setTimeout(r, REPORT_DELAY_MS * 3))

    expect(changes).toEqual([])
    expect(handle.markdown().trim()).toBe('second')
  })
})

describe('knowing when the editor cannot show a document exactly', () => {
  it.each([
    ['headings, lists and tables', '# T\n\n- a\n- b\n\n| a | b |\n| - | - |\n| 1 | 2 |'],
    ['raw HTML', '<div>\n  <p>hi</p>\n</div>'],
    ['footnotes', 'text[^1]\n\n[^1]: the note'],
    ['another style of the same thing', 'Title\n=====\n\n* a\n* b\n\n***'],
    ['a document that is empty', ''],
  ])('says it is lossless for %s', async (_name, markdown) => {
    expect((await load(markdown)).handle.lossless).toBe(true)
  })

  it.each([
    ['reference-style links', '[a][ref]\n\n[ref]: https://x.co'],
    ['a link with no text', '[](https://x.co)'],
  ])('says it is not for %s', async (_name, markdown) => {
    expect((await load(markdown)).handle.lossless).toBe(false)
  })
})

describe('reporting edits', () => {
  it('does not count the paragraph the editor adds after a final block as an edit', async () => {
    const changes: string[] = []
    await load('text\n\n```js\ncode\n```', (m) => changes.push(m))

    await new Promise((r) => setTimeout(r, REPORT_DELAY_MS * 3))

    expect(changes).toEqual([])
  })

  it('reports once after a burst of changes, with the final text', async () => {
    const changes: string[] = []
    const { handle } = await load('a', (m) => changes.push(m))
    const { editorViewCtx } = await import('@milkdown/kit/core')
    const view = handle.editor.action((ctx) => ctx.get(editorViewCtx))

    for (const char of ['b', 'c', 'd'])
      view.dispatch(view.state.tr.insertText(char, view.state.doc.content.size - 1))
    await new Promise((r) => setTimeout(r, REPORT_DELAY_MS * 3))

    expect(changes).toEqual(['abcd\n'])
  })

  it('does not report a change that was undone before it was reported', async () => {
    const changes: string[] = []
    const { handle } = await load('a', (m) => changes.push(m))
    const { editorViewCtx } = await import('@milkdown/kit/core')
    const view = handle.editor.action((ctx) => ctx.get(editorViewCtx))
    const end = view.state.doc.content.size - 1

    view.dispatch(view.state.tr.insertText('b', end))
    view.dispatch(view.state.tr.delete(end, end + 1))
    await new Promise((r) => setTimeout(r, REPORT_DELAY_MS * 3))

    expect(changes).toEqual([])
  })

  it('reports at once when asked to flush', async () => {
    const changes: string[] = []
    const { handle } = await load('a', (m) => changes.push(m))
    const { editorViewCtx } = await import('@milkdown/kit/core')
    const view = handle.editor.action((ctx) => ctx.get(editorViewCtx))

    view.dispatch(view.state.tr.insertText('b', view.state.doc.content.size - 1))
    expect(changes).toEqual([])
    handle.flush()

    expect(changes).toEqual(['ab\n'])
  })

  it('reports what is pending when it is closed', async () => {
    const changes: string[] = []
    const { handle } = await load('a', (m) => changes.push(m))
    const { editorViewCtx } = await import('@milkdown/kit/core')
    const view = handle.editor.action((ctx) => ctx.get(editorViewCtx))

    view.dispatch(view.state.tr.insertText('z', view.state.doc.content.size - 1))
    await handle.destroy()

    expect(changes).toEqual(['az\n'])
  })
})
