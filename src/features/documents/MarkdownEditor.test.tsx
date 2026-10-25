import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { editorText, findEditor, setEditorText } from '@/test/editor'
import MarkdownEditor from './MarkdownEditor'

describe('MarkdownEditor', () => {
  it('shows the value, is labelled for assistive technology and reports every edit', async () => {
    const onChange = vi.fn()
    render(<MarkdownEditor value="# Hello" onChange={onChange} label="Document content" />)

    expect(await editorText()).toBe('# Hello')
    const area = screen.getByLabelText('Document content')
    expect(area).toHaveAttribute('aria-multiline', 'true')
    expect(area).toHaveAttribute('contenteditable', 'true')

    await setEditorText('# Hello\n\nworld')
    expect(onChange.mock.lastCall?.[0]).toBe('# Hello\n\nworld')
  })

  it('wraps long lines and knows Markdown', async () => {
    render(<MarkdownEditor value={'```js\nconst a = 1\n```'} onChange={() => {}} label="x" />)

    const view = await findEditor()
    expect(view.contentDOM.classList.contains('cm-lineWrapping')).toBe(true)
    expect(
      view.state.facet(await import('@codemirror/language').then((m) => m.language))?.name,
    ).toBe('markdown')
  })
})
