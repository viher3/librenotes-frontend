import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { languages } from '@codemirror/language-data'
import { EditorView } from '@codemirror/view'
import { useTheme } from '@/lib/theme'
import CodeMirror from '@uiw/react-codemirror'
import { useImperativeHandle, useMemo, useRef, type Ref } from 'react'

interface MarkdownEditorProps {
  value: string
  onChange: (value: string) => void
  /** Accessible name of the editing area. */
  label: string
  autoFocus?: boolean
  /** Lets the page put text where the cursor is (e.g. an attached image). */
  handleRef?: Ref<MarkdownEditorHandle>
}

export interface MarkdownEditorHandle {
  insert: (text: string) => void
}

/** Markdown source editor (CodeMirror 6). Code blocks are highlighted in their own language, loaded on demand. */
export default function MarkdownEditor({
  value,
  onChange,
  label,
  autoFocus,
  handleRef,
}: MarkdownEditorProps) {
  const view = useRef<EditorView | null>(null)
  const [theme] = useTheme()
  useImperativeHandle(
    handleRef,
    () => ({
      insert(text) {
        const editor = view.current
        if (!editor) return
        editor.dispatch({
          ...editor.state.replaceSelection(text),
          scrollIntoView: true,
          userEvent: 'input',
        })
        editor.focus()
      },
    }),
    [],
  )
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
      theme={theme}
      onCreateEditor={(created) => {
        view.current = created
        // The editor loads on demand, so it can arrive after the user has already started typing elsewhere (the
        // title, a tag): it may take the focus only if nobody has it.
        const active = document.activeElement
        if (autoFocus && (active === null || active === document.body)) created.focus()
      }}
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
