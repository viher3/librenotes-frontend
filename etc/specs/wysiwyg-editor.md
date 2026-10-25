# Visual document editor (WYSIWYG over Markdown)

Status: **implemented** (deliveries A and B, §10). Parent spec: [mvp.md](./mvp.md) §4.2.

## 1. Goal

Documents are edited visually, like Notion: the user types on the rendered page (headings, lists, tasks, quotes, code,
tables, images) instead of in a Markdown source pane next to a preview. **The stored format does not change: it is
still a Markdown string** (the backend, search, API, autosave and exports are untouched). A document can also be
edited as Markdown source, per document, with one click.

## 2. Decisions

| Decision          | Choice                                                                                  | Why                                                          |
| ----------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Editing model     | Visual by default; _Markdown_ source mode on demand                                     | Asked for by the product owner.                              |
| Source of truth   | The Markdown string in `content`                                                        | No migration, no lock-in, search keeps working.              |
| Library           | **Milkdown** (`@milkdown/kit`: ProseMirror + remark, commonmark + GFM presets)          | Markdown-native; best round-trip fidelity in the spike (§3). |
| Source mode       | The existing CodeMirror editor (`MarkdownEditor`)                                       | Already there, already tested.                               |
| Read-only preview | Removed (`MarkdownPreview`, `react-markdown`, `rehype-highlight`, `remark-gfm` deleted) | The visual editor _is_ the preview; nothing else used it.    |

## 3. Library spike (evidence)

Same corpus through Milkdown 7 and Tiptap 3 (with `@tiptap/markdown`), Markdown → document → Markdown:

| Case                                                 | Tiptap                                 | Milkdown                                                                       |
| ---------------------------------------------------- | -------------------------------------- | ------------------------------------------------------------------------------ |
| Raw HTML (`<script>…`, `<b>…`)                       | **Dropped / reinterpreted: data loss** | Kept verbatim as an inline node rendered with `textContent` (inert)            |
| `Vec<String>`                                        | Rewritten to `Vec&lt;String&gt;`       | Unchanged                                                                      |
| `<https://x>` autolink                               | Rewritten as `[x](x)`                  | Unchanged                                                                      |
| `_italic_`, `**bold**`, `~~s~~`, code fences, tables | Same (tables re-padded)                | Same (separator row shortened)                                                 |
| `* item` / `---`                                     | Normalised to `-` / `---`              | Normalised to `*` / `***` by default: **configurable** (`bullet`, `rule`)      |
| Image without title                                  | OK                                     | Throws (`title: null` is rejected by the schema): **needs a small remark fix** |

Milkdown wins on not losing the user's text and on sharing the remark pipeline with the preview we already ship. BlockNote
was excluded (its native format is block JSON; Markdown is a lossy export), Lexical for its thinner Markdown support.

## 4. Behaviour

### 4.1 Visual mode

- Blocks: paragraph, headings 1–3 (1–6 are preserved), bullet / numbered / task lists (nested), quote, code block with
  language, horizontal rule, GFM table, image.
- Marks: bold, italic, strikethrough, inline code, link.
- Typing shortcuts: `#`, `##`, `-`, `1.`, `[ ]`, `>`, ` ``` `, `**x**`, `_x_`, `` `x` ``.
- Keyboard: Ctrl/Cmd+B / I, Ctrl/Cmd+Z / Shift+Z, Tab / Shift+Tab to indent list items.
- **Slash menu** (`/`): inserts the blocks above; filters as you type; arrows + Enter; Escape closes.
- **Floating toolbar** on a text selection: bold, italic, strikethrough, code, link.
- Placeholder on an empty document ("Type `/` for blocks…").
- The editor has an accessible name and `aria-multiline`; everything is reachable by keyboard.

### 4.2 Source mode

- A _Visual / Markdown_ toggle in the document header (replaces the old Edit / Split / Preview switch).
- The choice is remembered per document in `localStorage` (default: visual).
- Switching converts nothing destructively: the Markdown string is what both editors read and write.

### 4.3 Attachments and images

- `![alt](attachment:ID)` renders through the authenticated data layer (same rule as the preview): loading and failed states, never a request to the raw `attachment:` URL.
- _Insert_ in the attachments panel puts the image at the cursor, in either mode.
- Dropping files anywhere on the page still attaches them (the page-level drop handler is unchanged and wins over the editor's own).

### 4.4 Safety (non-negotiable)

1. **No raw HTML is ever parsed into DOM.** HTML in Markdown is kept as text (an inline `html` node rendered with `textContent`) and written back unchanged.
2. Link and image URLs are filtered on input and on render: only `http(s)`, `mailto`, `tel`, relative, `#anchor` and (images only) `attachment:ID`. Anything else is shown as plain text and keeps its source.
3. Pasted HTML is reduced to what the schema allows (ProseMirror parse rules); no scripts, styles or event handlers survive.
4. Links open with `target=_blank rel="noopener noreferrer nofollow"`.

### 4.5 Round-trip rules (the part that can silently corrupt data)

- **Opening a document never changes it.** The editor reports a change only after a user edit that really changes the
  Markdown: it keeps a baseline (how the editor itself writes the document as opened) and reports only text that
  differs from it, so editor-made changes (the empty paragraph after a final code block) and undone edits are not
  reported. An untouched document is never saved.
- Reports are debounced (150 ms) because serialising a long page is slow (~100 ms for 5,000 lines), and are
  **flushed** before the page can go away: on leaving the page, tab hidden, `pagehide`/`beforeunload`, `Ctrl/Cmd+S`
  and unmount (a layout-effect cleanup, so it runs before the page's autosave flush). Milkdown's own listener is not
  used: it is debounced separately and would leave a window in which the last keystrokes are lost.
- Edited documents are re-serialised with fixed options: bullets `-`, rules `---`, emphasis `_`, strong `**`, fences ` ``` `.
- Normalisations that are accepted (documented, covered by tests): `*` bullets become `-`, `***` rules become `---`,
  table separator rows are re-padded, trailing whitespace and extra blank lines are trimmed, literal `*` may be escaped.
- Constructs the schema cannot represent (footnotes, definition lists, …) are kept as an opaque block/inline text node
  and written back verbatim. They are never dropped. If a document contains something the editor cannot round-trip
  exactly, a notice offers _Edit as Markdown_. "Exactly" is decided on meaning: the Markdown syntax tree (without
  positions and tight/loose list flags) of the original and of what the editor writes back must be equal.
- A test corpus runs Markdown → editor → Markdown for every construct above and for real-world samples; each case is
  either identical or in the accepted-normalisation list.

## 5. Architecture

```
DocumentPage ── mode (visual | markdown, per document)
   ├─ VisualEditor (lazy)   Milkdown: commonmark + gfm + history + listener + clipboard + slash + tooltip
   │     markdown.ts        remark fixes, stringify options, URL filtering, round-trip helpers
   │     imageView.ts       node view for `attachment:` images (authenticated blob)
   │     SlashMenu / BubbleMenu   small React components fed by Milkdown's slash/tooltip providers
   └─ MarkdownEditor (lazy) CodeMirror (unchanged)
```

- Both editors share one props contract: `{ value, onChange, label, autoFocus, handleRef }` with `handleRef.insert(text)`.
- `VisualEditor` is controlled by `value` but only re-reads it when it differs from the last Markdown it emitted (so typing never resets the document or the cursor).
- Both are loaded with `lazy`, so a document opens with only the editor in use.

## 6. Testing

- **Round-trip corpus** (`markdown.test.ts`): identity for each construct, accepted normalisations, HTML/`<`/`*` literals, `attachment:` images, untouched-document-is-not-emitted.
- **Safety**: `<script>`, `<img onerror>`, `javascript:` / `data:` links and images never become DOM elements or attributes; pasted HTML is stripped.
- **Component tests** (jsdom): visual mode is the default; toggle to Markdown shows the source and back; edits autosave as Markdown; opening a document does not save; per-document mode is remembered; Insert image at the cursor; slash menu and toolbar via the editor's commands.
- Existing document tests move to the Markdown mode helpers where they type source.
- Mutation checks on: the "emit only on user edit" guard, URL filter, stringify options, the HTML-as-text node.

## 7. Risks

| Risk                                 | Mitigation                                                                                             |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| Silent rewriting of existing notes   | §4.5: no emit on open, fixed options, corpus, visible fallback to source mode.                         |
| XSS through pasted/typed HTML        | §4.4; the `html` node renders as text; tests assert no element is created.                             |
| Bundle size                          | Lazy chunk; CodeMirror and Milkdown never load together unless the user toggles.                       |
| jsdom limits ProseMirror (no layout) | Test conversion and commands directly on the editor state; keep DOM assertions to what jsdom supports. |
| "Like Notion" scope creep            | The block list in §4.1 is the contract; block drag handles, columns, databases are out of scope (§8).  |

## 8. Known limits

- Code blocks are not syntax-highlighted in the visual editor (the source editor highlights).
- An image pasted as HTML takes its alt text as title; images inserted from the attachments panel do not.
- Tables are edited through the keyboard and the `/` menu; there are no row/column handles yet.

## 9. Out of scope (this spec)

Block drag handles and reordering (and table row/column handles), columns, callouts, toggles, databases, comments, real-time collaboration, `[[wikilinks]]`,
equation blocks, an HTML/PDF export.

## 10. Delivery

1. **A – core**: dependency, `markdown.ts` (+ corpus tests), `VisualEditor` with the blocks/marks in §4.1, attachment image view, mode toggle in `DocumentPage`, Insert image, safety tests, docs.
2. **B – Notion feel**: slash menu, floating toolbar, placeholder, exact-roundtrip notice. (Block drag handle stays out, §9.)
