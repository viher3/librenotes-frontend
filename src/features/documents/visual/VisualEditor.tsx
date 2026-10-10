import { editorViewCtx, parserCtx, type Editor } from '@milkdown/kit/core'
import { Slice } from '@milkdown/kit/prose/model'
import { useQueryClient } from '@tanstack/react-query'
import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type Ref,
} from 'react'
import { useTranslation } from 'react-i18next'
import { useRepositories } from '@/data/DataProvider'
import { attachmentKeys } from '@/lib/queryKeys'
import { BLOCKS, MARK_NAMES, runBlock, runMark, type BlockId, type MarkId } from './blocks'
import { createVisualEditor, type VisualEditorHandle } from './editor'
import { attachmentImageView } from './imageView'
import { interaction, type BubbleState, type SlashState } from './interaction'
import { BubbleMenu, SlashMenu } from './menus'
import { isSafeUrl } from './urls'

/** Test seam: the Milkdown editor behind the host element. Only set when running tests. */
export type TestHost = HTMLElement & { __editor?: Editor }

export interface EditorHandle {
  /** Puts Markdown at the cursor (an image, say). */
  insert: (markdown: string) => void
}

interface VisualEditorProps {
  value: string
  onChange: (value: string) => void
  /** Accessible name of the editing area. */
  label: string
  autoFocus?: boolean
  handleRef?: Ref<EditorHandle>
  /** Called once when the document uses Markdown that the visual editor cannot show exactly. */
  onLossy?: () => void
}

/**
 * The visual (WYSIWYG) editor: the page is edited as it looks, and what is stored is Markdown. It reads `value`
 * once and again only when it changes from outside; it reports a change only after the user edited something.
 */
export default function VisualEditor({
  value,
  onChange,
  label,
  autoFocus,
  handleRef,
  onLossy,
}: VisualEditorProps) {
  const { t } = useTranslation('documents')
  const { notes } = useRepositories()
  const queryClient = useQueryClient()
  const host = useRef<HTMLDivElement>(null)
  const handle = useRef<VisualEditorHandle | null>(null)
  const lastMarkdown = useRef(value)
  const trailingNewline = useRef(/\n$/.test(value))

  const latest = useRef({
    onChange,
    onLossy,
    placeholder: t('visual.placeholder'),
    notes,
    queryClient,
  })
  useEffect(() => {
    latest.current = { onChange, onLossy, placeholder: t('visual.placeholder'), notes, queryClient }
  })

  const [slash, setSlash] = useState<SlashState | null>(null)
  const [bubble, setBubble] = useState<BubbleState | null>(null)
  const [selected, setSelected] = useState(0)
  const linkInputActive = useRef(false)

  const items = useMemo(() => {
    const query = slash?.query.toLowerCase() ?? ''
    return BLOCKS.filter((id) => {
      if (query === '') return true
      const words =
        `${t(`visual.blocks.${id}.label`)} ${t(`visual.blocks.${id}.keywords`)}`.toLowerCase()
      return words.includes(query)
    })
  }, [slash?.query, t])

  const pick = useCallback(
    (id: BlockId) => {
      const current = handle.current
      if (!current || !slash) return
      const { from, to } = slash
      current.editor.action((ctx) => {
        const view = ctx.get(editorViewCtx)
        view.dispatch(view.state.tr.delete(from, to))
        view.focus()
      })
      runBlock(current.editor, id)
      setSlash(null)
    },
    [slash],
  )

  // The editor's plugin asks about keys through refs, so it never needs rebuilding.
  const menu = useRef({ items, selected, pick, open: slash !== null })
  useEffect(() => {
    menu.current = { items, selected, pick, open: slash !== null }
  })

  useEffect(() => {
    let cancelled = false
    const root = host.current
    if (!root) return
    const creating = createVisualEditor({
      root,
      value: lastMarkdown.current,
      label,
      onUserChange: (markdown) => {
        const text = markdown.replace(/\n+$/, '') + (trailingNewline.current ? '\n' : '')
        lastMarkdown.current = text
        latest.current.onChange(text)
      },
      plugins: [
        attachmentImageView((id) =>
          latest.current.queryClient.fetchQuery({
            queryKey: attachmentKeys.content(id),
            queryFn: () => latest.current.notes.downloadAttachment(id),
            staleTime: Infinity,
          }),
        ),
        interaction(
          () => ({
            onSlash: (state) => {
              setSlash(state)
              setSelected(0)
            },
            onBubble: (state) => {
              if (state === null && linkInputActive.current) return
              setBubble(state)
            },
            onSlashKey: (key) => {
              const { items: shown, selected: at, pick: choose, open } = menu.current
              if (!open || shown.length === 0)
                return key === 'Escape' && open ? (setSlash(null), true) : false
              if (key === 'ArrowDown') setSelected((at + 1) % shown.length)
              else if (key === 'ArrowUp') setSelected((at - 1 + shown.length) % shown.length)
              else if (key === 'Escape') setSlash(null)
              else choose(shown[Math.min(at, shown.length - 1)])
              return true
            },
          }),
          () => latest.current.placeholder,
        ),
      ],
    }).then((created) => {
      if (cancelled) {
        void created.destroy()
        return null
      }
      handle.current = created
      if (!created.lossless) latest.current.onLossy?.()
      // Tests drive ProseMirror directly (jsdom has no layout, so real typing is unreliable). Folded away in builds.
      if (import.meta.env.MODE === 'test') (root as TestHost).__editor = created.editor
      const active = document.activeElement
      if (autoFocus && (active === null || active === document.body)) {
        created.editor.action((ctx) => ctx.get(editorViewCtx).focus())
      }
      return created
    })
    // Anything typed in the last moments is reported before the page can go away or a save is asked for.
    const flush = () => handle.current?.flush()
    const onHide = () => {
      if (document.visibilityState === 'hidden') flush()
    }
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') flush()
    }
    document.addEventListener('visibilitychange', onHide)
    window.addEventListener('pagehide', flush)
    window.addEventListener('beforeunload', flush)
    window.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('visibilitychange', onHide)
      window.removeEventListener('pagehide', flush)
      window.removeEventListener('beforeunload', flush)
      window.removeEventListener('keydown', onKey, true)
      cancelled = true
      handle.current = null
      void creating.then((created) => created?.destroy())
    }
    // Created once per mount: later changes of value, label or placeholder are applied below or read through refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // When the page goes away, report what was typed in the last moments *before* the autosave of the page above
  // flushes its draft: layout-effect cleanups run before passive ones, so the order holds.
  useLayoutEffect(() => {
    return () => handle.current?.flush()
  }, [])

  // A change of `value` that is not what the editor itself just reported replaces the document.
  useEffect(() => {
    if (value === lastMarkdown.current || !handle.current) return
    lastMarkdown.current = value
    trailingNewline.current = /\n$/.test(value)
    handle.current.replace(value)
  }, [value])

  useImperativeHandle(
    handleRef,
    () => ({
      insert(markdown) {
        const current = handle.current
        if (!current) return
        // Parsed as Markdown (not through HTML, which would give an image its alt text as a title).
        current.editor.action((ctx) => {
          const view = ctx.get(editorViewCtx)
          const doc = ctx.get(parserCtx)(markdown)
          const first = doc.firstChild
          const content = doc.childCount === 1 && first?.isTextblock ? first.content : doc.content
          view.dispatch(view.state.tr.replaceSelection(new Slice(content, 0, 0)).scrollIntoView())
          view.focus()
        })
      },
    }),
    [],
  )

  // Tell assistive technology about the command menu through the editing area itself.
  const listId = 'visual-editor-slash'
  useEffect(() => {
    const area = host.current?.querySelector<HTMLElement>('[contenteditable]')
    if (!area) return
    area.setAttribute('aria-haspopup', 'listbox')
    area.setAttribute('aria-expanded', String(slash !== null))
    if (slash !== null) {
      area.setAttribute('aria-controls', listId)
      const id = items[Math.min(selected, items.length - 1)]
      if (id) area.setAttribute('aria-activedescendant', `${listId}-${id}`)
    } else {
      area.removeAttribute('aria-controls')
      area.removeAttribute('aria-activedescendant')
    }
  }, [slash, selected, items])

  const editor = (): Editor | null => handle.current?.editor ?? null

  const applyLink = (href: string): boolean => {
    const current = editor()
    if (!current || !isSafeUrl(href, 'link')) return false
    runMark(current, 'link', href.trim())
    return true
  }

  return (
    <>
      <div ref={host} className="visual-editor h-full" data-testid="visual-editor" />
      {slash && (
        <SlashMenu
          id={listId}
          anchor={slash}
          items={items}
          selected={Math.min(selected, Math.max(items.length - 1, 0))}
          onHover={setSelected}
          onPick={pick}
        />
      )}
      {bubble && !slash && (
        <BubbleMenu
          anchor={bubble}
          active={(Object.keys(MARK_NAMES) as MarkId[]).filter((id) =>
            bubble.marks.includes(MARK_NAMES[id]),
          )}
          onMark={(id) => {
            const current = editor()
            if (current) runMark(current, id)
          }}
          onLink={applyLink}
          onLinkInput={(active) => {
            linkInputActive.current = active
            if (!active) setBubble(null)
          }}
          onClose={() => {
            handle.current?.editor.action((ctx) => ctx.get(editorViewCtx).focus())
          }}
        />
      )}
    </>
  )
}
