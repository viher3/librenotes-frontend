import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { languages } from '@codemirror/language-data'
import { EditorView } from '@codemirror/view'
import CodeMirror from '@uiw/react-codemirror'
import { useMemo } from 'react'

interface MarkdownEditorProps {
  value: string
  onChange: (value: string) => void
  /** Accessible name of the editing area. */
  label: string
  autoFocus?: boolean
}

const isDark = () => document.documentElement.dataset.theme === 'dark'

/** Markdown source editor (CodeMirror 6). Code blocks are highlighted in their own language, loaded on demand. */
export default function MarkdownEditor({ value, onChange, label, autoFocus }: MarkdownEditorProps) {
  const extensions = useMemo(
    () => [
      markdown({ base: markdownLanguage, codeLanguages: languages }),
      EditorView.lineWrapping,
      EditorView.contentAttributes.of({ 'aria-label': label, 'aria-multiline': 'true' }),
    ],
    [label],
  )

  return (
    <CodeMirror
      value={value}
      onChange={onChange}
      extensions={extensions}
      theme={isDark() ? 'dark' : 'light'}
      autoFocus={autoFocus}
      height="100%"
      className="h-full"
      basicSetup={{
        lineNumbers: false,
        foldGutter: false,
        highlightActiveLine: false,
        highlightActiveLineGutter: false,
      }}
    />
  )
}
