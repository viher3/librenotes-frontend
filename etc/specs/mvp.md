# LibreNotes — Frontend Spec (MVP)

Web app for storing notes in Markdown, links and file attachments. Inspired by Notion, but deliberately simple: documents instead of blocks, Markdown instead of a proprietary editor.

## 1. Goals and non-goals

**MVP goals**

- Create, edit and delete documents written in Markdown.
- Organize them in folders and tag them.
- Save links (with a title) and attach files to a document.
- Search by title and content.
- Feel fast and frictionless (autosave, keyboard shortcuts).
- User accounts with login: each user only sees their own data.
- Multilingual interface (Spanish and English in the MVP, extensible to more languages).
- Consume LibreNotes' own backend through a REST API.

**Out of the MVP** (see §9): real-time collaboration, draggable blocks, databases/tables, permissions, public sharing, native mobile app, plugins.

## 2. Stack

| Area            | Choice                                               | Reason                                                                          |
| --------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------- |
| Build           | Vite + React 19 + TypeScript                         | Project requirement; typed from the start                                       |
| Routing         | React Router                                         | Routes `/`, `/doc/:id`, `/folder/:id`                                           |
| Server state    | TanStack Query                                       | Caching, invalidation, loading states                                           |
| UI state        | Zustand (minimal)                                    | Sidebar open/closed, editor mode                                                |
| Editor          | CodeMirror 6 (`@uiw/react-codemirror`)               | Lightweight Markdown editing with syntax highlighting                           |
| Markdown render | `react-markdown` + `remark-gfm` + `rehype-highlight` | GFM (tables, task lists), highlighted code; raw HTML is never rendered (see §8) |
| Styles          | Tailwind CSS                                         | Speed; light/dark theme                                                         |
| i18n            | i18next + react-i18next                              | Multilingual (es/en initially), language detection and manual switcher          |
| Forms           | React Hook Form + Zod                                | Login/register and form validation                                              |
| Tests           | Vitest + Testing Library                             | Integrated with Vite                                                            |
| API client      | `openapi-typescript` + `openapi-fetch`               | Types and client generated from the Symfony backend's OpenAPI definition        |
| Quality         | ESLint + Prettier                                    | —                                                                               |

## 3. Data model

```ts
type ID = string // uuid

interface User {
  id: ID
  email: string
  displayName: string
  locale: string // "es" | "en" | ...
}

interface Folder {
  id: ID
  name: string
  parentId: ID | null
  createdAt: string // ISO
}

interface Document {
  id: ID
  title: string
  content: string // Markdown
  folderId: ID | null
  tags: string[]
  pinned: boolean
  createdAt: string
  updatedAt: string
}

interface Link {
  // saved link, independent of documents
  id: ID
  url: string
  title: string
  note?: string
  tags: string[]
  folderId: ID | null
  createdAt: string
}

interface Attachment {
  id: ID
  documentId: ID
  filename: string
  mimeType: string
  size: number // bytes
  url: string // download/view URL
  createdAt: string
}
```

## 4. MVP features

### 4.1 Documents

Implemented. The backend calls them _notes_.

- **Create** a document with the sidebar button or `Ctrl/Cmd+N`. Browsers reserve that combination for "new window" and often never deliver it to the page, so `Alt+N` works too. The document is named "Untitled" in the active language and opens with that title selected, so typing names it. Activating it twice in a row creates one document.
- **Edit** the title (header field) and the content (CodeMirror 6 Markdown editor, loaded on demand). The document opens from a snapshot: changes made elsewhere while it is open are not merged in (last write wins).
- **View**: _Edit_, _Split_ (default) and _Preview_, remembered in the browser. The preview updates as you type.
- **Autosave** with an 800 ms debounce and a status indicator (_Saved_ / _Saving…_ / _Couldn't save — retrying…_):
  - only the fields that changed are sent, one request at a time (edits made while saving go out right after);
  - a failure never clears the screen: it is retried after 2, 5, 15 and then every 30 seconds, or at once if the user types again;
  - an empty title is kept on screen but not saved ("A title is required to save"; leaving the field restores the last saved title) while the content is still saved;
  - `Ctrl/Cmd+S` saves at once, hiding the tab saves, and leaving the document sends what is pending;
  - closing or reloading the page while something is unsaved asks the browser for confirmation.
- **Delete** with confirmation; the document goes to the trash (the backend keeps it; the Trash view is still to be built). Pending edits of a deleted document are dropped.
- **Pin** documents; they are listed first on the home page.
- Home page: _Pinned_ and _Recent_ lists with tags and "updated 5 minutes ago".
- Supported Markdown: headings, emphasis, lists, task lists, quotes, code blocks highlighted in their language, tables, links, images (GFM).

### 4.2 Organization

Everything lives in one **tree** in the sidebar, like a workspace of pages: folders hold documents and links, and **a document can hold other documents and links too** (a page with sub-pages). Folders and documents can be mixed to any depth (folder → document → document → link ...). An item is in exactly one place; tags (below) give the second, cross-cutting way to organize.

- **Sidebar tree** (implemented): folders, then documents, then links, each level ordered by name. Branches load when they are opened and remember being open between visits; a document is expandable only when it has children. The page being shown is highlighted and its ancestors are opened. A link leads to its own page (`/link/:id`); its menu also offers _Open link in a new tab_.
- **Keyboard** follows the ARIA tree pattern: the tree is one tab stop; Up/Down, Home/End move; Right opens a branch and then enters it; Left closes it and then goes to the parent; Enter opens the item; the context-menu key (or Shift+F10) opens its actions.
- **Actions** per item, from the "…" menu: _New document inside_ / _New sub-document_, _New folder inside_ (folders), _Rename_ (folders; a document is renamed in its page), _Move to…_ and _Delete_. Deleting something that holds others says so and sends the whole subtree to the trash; restoring brings it back together.
- **Moving**: by dragging an item onto a folder, onto a document, or onto the empty space (top level), and with the _Move to…_ dialog, which works without a mouse. Folders can only go into folders or the top level. A document cannot be put inside itself or inside its own sub-documents (the picker does not offer them, and the server refuses it if a drop attempts it).
- **Folder page** (`/folder/:id`): breadcrumbs, the folder's sub-folders, documents and links, and _New document here_.
- **Breadcrumbs** on documents and folders show the whole way from the top level.
- **Sub-documents panel** on every document: what is directly under it, and _Add sub-document_.
- **Tags** (documents and links):
  - The document header has a tag editor: chips that link to the tag's page, each with a remove button, and a field with suggestions from the tags already in use. Enter or a comma adds what was typed, pasting a comma-separated list adds them all, and leaving the field adds what is pending.
  - Names are trimmed and lower-cased and duplicates are ignored, as the backend does. Longer than 50 characters or more than 20 tags are refused on the spot with a message, so an autosave never fails because of a tag. Tags are saved by the same autosave as the text.
  - The sidebar lists every tag in use with how many items carry it, most used first, and follows changes (tagging, deleting) without reloading.
  - `/tag/:name` lists the documents and links that carry a tag (newest first, 20 at a time, _Show more_). The address is case-insensitive.
- Files attached to a folder are listed on the folder page (not as rows of the tree).

### 4.3 Links

- Save a link (URL + title + optional note + tags) from the sidebar, a folder's or document's menu, the folder page or the sub-documents panel. Only `http://` and `https://` addresses are accepted. When no title is given, the site name is used.
- **Link page** (`/link/:id`, implemented): breadcrumbs (`path` from the link detail), editable title, address, note and tags with autosave (same rules as documents: an invalid address or empty title is not sent and the status says so; Ctrl/Cmd+S saves at once), an _Open_ button (`target="_blank" rel="noopener noreferrer nofollow"`) and delete (to the trash, after confirmation).
- **List view** (`/links`, implemented): newest first, 20 at a time, each entry leading to its page.
- In the MVP the user types the title; metadata is not extracted automatically.

### 4.4 Attachments

Implemented for documents and folders (`src/features/attachments`):

- **Attach**: _Attach files_ button (several at once) or drop files anywhere on the document or folder page. Files are sent one after another, each with a progress bar; a failed one stays in the list with _Try again_ and _Dismiss_ (dismissing cancels an upload in flight).
- **Limit**: 50 MB per file (`MAX_ATTACHMENT_BYTES`). Files over it, and empty files, are refused in the browser without calling the server; the backend enforces the real limit.
- **List** of the files with size, _Download_ and _Delete_ (asks first; the file goes to the trash). Downloads need the session, so the bytes are fetched through the data layer and handed to the browser as an object URL.
- **Images**: png, jpeg, gif and webp (the types the backend serves inline) get _Insert_, which writes `![name](attachment:ID)` at the cursor (at the end when only the preview is open). The preview resolves `attachment:ID` through the data layer. The scheme is accepted for images only and the id may contain nothing but letters, digits, `_` and `-`; links, other schemes and path-like ids stay blocked.
- A drop is taken before CodeMirror sees it (which would paste the file's bytes into the text), and only drags that carry files are treated as drops.
- Not done: files at the top level (the backend has none), showing files as rows in the tree.

### 4.5 Search

Implemented (`src/features/search`):

- **Search dialog**, opened with `Ctrl/Cmd+K` from anywhere in the signed-in area (also while typing in the editor; the browser's own use of the shortcut is suppressed) or with the sidebar's _Search_ button. Escape closes it and gives the focus back.
- Searches document titles and content and link titles, notes and addresses. Nothing is sent below 2 characters; typing is debounced (300 ms) and only the answer to the latest text is shown, results of an older text are hidden as soon as the text changes so Enter never opens something that no longer matches.
- Results: type (document / link), title, snippet and address with the matched terms marked (case-insensitive, characters taken literally), the total, and a note when more than the first 20 matched.
- **Keyboard** (ARIA combobox + listbox): Up/Down move through the results and wrap around, Enter opens the selected one (`/doc/:id` or `/link/:id`), click opens too.
- Runs on the backend via `GET /search?q=`; the frontend does not index content.
- Not done: a full results page, filtering by type or tag from the dialog.

### 4.6 Authentication

- **Sign up** (email, name, password) and **sign in** (email + password).
- **Sign out** from the user menu.
- **Session**: the frontend keeps the access token in memory only and stores the refresh token in `localStorage`. The API is called with `Authorization: Bearer <accessToken>`. On a `401` it renews once through `PUT /token-renew` (a single renewal shared among concurrent requests, because refresh tokens are single-use); if that fails, it clears the session and redirects to `/login`. Accepted trade-off: a refresh token in `localStorage` is reachable by XSS; this is mitigated with strict Markdown sanitization, CSP, the backend's refresh-token rotation with reuse detection and the 15-minute access-token lifetime.
- **Protected routes**: everything except `/login`, `/register`, `/register/check-email` and `/activate` requires a session. After signing in the user returns to the route they were heading to, except after an explicit sign-out. A session that ends on its own (refresh token rejected) sends the user to `/login` with a notice. Signed-in users are redirected away from the public pages. The query cache is cleared on sign-in and sign-out.
- **Activation**: signing up shows "check your email"; `/activate?token=` (opened from the email) activates the account and invites the user to sign in. The token works once, so the page requests it only once even under React StrictMode.
- Client-side form validation (email format, minimum password length) and translated server error messages.
- Out of the MVP: password recovery, email verification, OAuth (see §9).

### 4.7 Language (i18n)

- MVP languages: **Spanish** and **English**; the default language is detected from the browser, falling back to English.
- Language selector in the user menu; the choice is stored in the profile (`User.locale`) and in `localStorage` before login.
- No UI text is hardcoded: everything goes through keys in `src/locales/<lng>/*.json`, organized by _feature_ (namespaces).
- Dates, numbers and file sizes formatted with `Intl` according to the active language.
- The `<html>` `lang` attribute is updated when the language changes.
- i18next pluralization support. Ready to add RTL languages later (use logical CSS properties: `ms-*`, `me-*`).
- User-written content is not translated.
- Backend errors must arrive with a stable code (`error.code`) that the frontend maps to translation keys.

### 4.8 General

- Light/dark theme: **dark by default** (set via `data-theme="dark"` on `<html>`), with a switcher in the sidebar and on the sign-in pages; the choice is persisted in `localStorage` (`librenotes.theme`) and also themes the editor.
- Responsive layout: below 768 px the sidebar is a drawer opened from a top bar; it closes when something is chosen, on Escape and on a click outside, and while closed it is `inert` (out of the tab order and the accessibility tree).
- Empty, loading and error states in every view.
- Accessibility: a _Skip to content_ link, named landmarks, keyboard operation of the tree, search, dialogs and menus, `lang` following the interface language, and secondary text at WCAG AA contrast in both themes.
- **Trash** (`/trash`): lists deleted folders, documents, links and files with _Restore_ and _Delete forever_ (asks first), and _Empty trash_ (asks first). Restoring something whose folder or document is still in the trash explains what to restore first.
- Translations: a test keeps `es` and `en` in step (same keys and placeholders, nothing left untranslated).

## 5. Screens and routes

| Route         | Content                                     |
| ------------- | ------------------------------------------- |
| `/login`      | Sign in (public)                            |
| `/register`   | Sign up (public)                            |
| `/`           | Home: recent and pinned documents           |
| `/doc/:id`    | Document editor/preview + attachments panel |
| `/folder/:id` | Folder contents                             |
| `/link/:id`   | Link page (edit, open, delete)              |
| `/links`      | Link list                                   |
| `/trash`      | Trash: restore or delete for good           |
| `/tag/:name`  | Items with that tag                         |
| `*`           | 404                                         |

Layout: **Sidebar** (left) · **Main content** · optional **right side panel** (attachments, metadata) on `/doc/:id`.

## 6. Data layer

Status: **implemented** (`src/data`, see the README). The UI never calls the API directly: it uses two repository
interfaces obtained with `useRepositories()`, backed by interchangeable adapters.

```ts
interface AuthRepository {
  signUp(input): Promise<void>
  activate(token): Promise<void>
  login(email, password): Promise<User> // stores the session
  logout(): Promise<void> // revokes the refresh token, clears the session even if offline
  restoreSession(): Promise<User | null> // from the stored refresh token
  me(): Promise<User>
  updateProfile(input): Promise<User>
}

interface NotesRepository {
  folderContents(folderId?): Promise<FolderContents>
  createFolder / renameFolder / moveFolder / deleteFolder
  listNotes(params?): Promise<Page<NoteSummary>>
  getNote / createNote / updateNote / moveNote / deleteNote
  listLinks(params?): Promise<Page<Link>>
  getLink / createLink / updateLink / moveLink / deleteLink
  uploadNoteAttachment(noteId, file, { onProgress, signal }) / uploadFolderAttachment
  getAttachment / downloadAttachment(id): Promise<Blob> / deleteAttachment
  search(params): Promise<Page<SearchResult>>
  listTags(): Promise<TagCount[]>
  listTrash() / restore(kind, id) / deletePermanently(kind, id) / emptyTrash()
}
```

- **Domain types** are strict and camelCase (`src/data/types.ts`) and independent of the wire format: the generated
  OpenAPI types mark every response property optional (the backend declares no `required`), so each mapper checks what
  it needs and rejects with `invalid_response` if the contract drifts.
- **`http` adapter** (default): typed `openapi-fetch` client generated from the backend's OpenAPI document. It adds the
  Bearer header and, on `401`, renews the session once and retries; concurrent renewals share one request because
  refresh tokens are single-use, and a renewal that fails for transient reasons (offline, `429`, `5xx`) does not end the
  session. Uploads use `XMLHttpRequest` for progress, with the same renew-and-retry.
- **`mock` adapter** (development only, `VITE_DATA_ADAPTER=mock`): an in-memory backend with the same error codes,
  ownership, trash cascades, pagination and search, seeded with a demo account. It is removed from production builds.
- **Errors** are `ApiError` with `status`, a stable `code` (use it as an i18n key), `params`, and field-level `errors`
  for `400` validation failures. Network failures are `network_error` (status 0).
- **Development proxy**: the backend's CORS answers preflights with `Access-Control-Allow-Headers: *`, which browsers do
  not honour for `Authorization`. In development `VITE_API_URL=/backend` and Vite forwards `/backend` to the API, so no
  CORS is involved. Production needs either the same origin or an explicit `Authorization` in that header.
- **Tests**: unit tests per piece, a shared behaviour contract run against the mock, and an opt-in end-to-end smoke test
  against a live backend (`npm run test:e2e`).

### Backend contract (Symfony, `librenotes` repo)

The API is served at the host root (`VITE_API_URL=http://localhost`, e.g. `POST /login`). The OpenAPI document is published at `/api/doc.json` (Swagger UI at `/api/docs`); `npm run api:fetch && npm run api:generate` regenerate `src/data/api/schema.d.ts`. The backend's own spec, with every decision and deviation, is `librenotes/etc/specs/notes-data-model.md`. The frontend's "documents" are the backend's **notes**.

| Area        | Endpoints                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Auth        | `POST /signup` (email, password ≥ 8, optional username; account starts inactive), `POST /users/activate` (`{token}`; `404` unknown, `410` expired), `POST /login` → `{accessToken, refreshToken}`, `PUT /token-renew` (`{token: <refreshToken>}` → new `{accessToken, refreshToken}`), `DELETE /token-renew` (logout, revokes the refresh token)                                                                                                                                       |
| Profile     | `GET /me` (`id`, `email`, `username`, `locale`, `roles`, `active`, `email_validated`, `created_at`, `last_login_at`), `PATCH /me` (`username`, `locale` ∈ `en`/`es`)                                                                                                                                                                                                                                                                                                                   |
| Folders     | `POST /folders`, `GET /folders/contents?folder_id=` (sub-folders, notes, links, attachments; root when omitted; includes the folder's `path`), `PATCH /folders/{id}` (rename), `PATCH /folders/{id}/move`, `DELETE /folders/{id}` (to trash)                                                                                                                                                                                                                                           |
| Notes       | `POST /notes`, `GET /notes` (paginated; `parent_note_id` filter), `GET/PATCH/DELETE /notes/{id}` (detail includes `attachments`, `pinned`, `tags`, `parent_note_id`, `child_count` and `path`: the ancestors from the top level, folders then notes), `PATCH /notes/{id}/move`, `GET /notes/{id}/children` (the notes, with their `child_count`, and the links directly under a note). `POST` and `move` take `folder_id` or `parent_note_id`, never both; neither means the top level |
| Links       | `POST /links`, `GET /links` (paginated), `GET/PATCH/DELETE /links/{id}`, `PATCH /links/{id}/move` (same `folder_id` / `parent_note_id` rule as notes)                                                                                                                                                                                                                                                                                                                                  |
| Attachments | `POST /notes/{noteId}/attachments` and `POST /folders/{folderId}/attachments` (multipart field `file`), `GET /attachments/{id}` (metadata), `GET /attachments/{id}/content` (download, needs the Bearer header), `DELETE /attachments/{id}`                                                                                                                                                                                                                                            |
| Search/tags | `GET /search?q=&type=note,link&tag=&page=&size=`, `GET /tags` (`[{name, count}]`)                                                                                                                                                                                                                                                                                                                                                                                                      |
| Trash       | `GET /trash`, `DELETE /trash` (empty), `POST /trash/{folders\|notes\|links\|attachments}/{id}/restore`, `DELETE /trash/{folders\|notes\|links\|attachments}/{id}`                                                                                                                                                                                                                                                                                                                      |

Conventions the client relies on:

- **Nesting**: a document can sit under another document. "Top level" means no folder _and_ no parent document, so nested items do not appear there; moving to the top level means both are empty. Creating or moving takes a destination (`root`, a folder or a document). Cycles are refused (`note.cycle_detected`).
- **Lists** answer `{ meta: { page, size, total, last_page }, data: [...] }`; parameters `page`, `size` (max 100), `orderBy` (`updated_at`, `created_at`, `title`), `orderDirection`. Responses are snake_case.
- **Errors** are `{ "code": "note.not_found", "message": "...", "params": {}, "status": 404 }` with stable string codes (`security.bad_credentials`, `folder.not_found`, `link.invalid_url`, `tag.invalid`, `attachment.too_large`, `attachment.empty`, `search.query_too_short`, `notes.parent_folder_in_trash`...). Request-validation failures are `400 { "errors": ["[field] message"] }`. `429` on too many login/renew attempts.
- **Session**: the access token (JWT, 15 minutes, payload `{id}`) goes in `Authorization: Bearer`. Refresh tokens are single-use and rotated by `PUT /token-renew`; reusing a revoked one revokes all of the user's tokens, so concurrent renewals must share one request and the new refresh token must be stored before retrying anything.
- **Tags** are normalized by the backend (trimmed, lower-cased, ≤ 20 per item, ≤ 50 chars).
- **Trash exists** (soft delete with restore): the MVP list in §9 had it as backlog, but the API supports it, so the UI can offer a Trash view cheaply. Attachments follow their note.
- **Self-registration needs email activation** before login: the UI needs a "check your email" screen and an `/activate?token=` route.
- **Search** is substring-based and case/accent-insensitive, with a plain-text `snippet` per result for the client to highlight.
- Downloads cannot be plain `<a href>` / `<img src>` because they need the Bearer header: fetch as a Blob and use an object URL.

Known backend issues (reported in the backend spec, not blocking): any authenticated user can read/modify/delete another user through `/users/{id}`, CORS is `*`, and the `Configuration` module's tests need `CONFIGURATION_ENCRYPTION_KEYS` locally.

## 7. Project structure

```
src/
  app/            # providers, router, layout, protected routes
  features/
    auth/         # login, register, session
    documents/    # editor, preview, list
    folders/
    links/
    attachments/
    search/
  data/           # NotesRepository, http/mock adapters, types
  components/     # reusable UI (Button, Modal, Input…)
  hooks/
  lib/            # utilities (debounce, dates, markdown)
  locales/        # es/, en/ (JSON per namespace)
  styles/
  main.tsx
```

## 8. Non-functional requirements

- First load < 200 KB gzipped JS on the initial route (lazy-load the editor).
- Markdown never renders raw HTML: `rehype-raw` is not used, so markup typed in a note is shown as text and cannot run, links and images only keep http(s), mailto, tel and relative URLs, external links open with `noopener noreferrer nofollow` and images are requested without a referrer. A sanitizer was deliberately not added on top: with raw HTML off it protects nothing more, and it silently deletes legitimate text such as `Vec<String>`. If raw HTML is ever enabled, `rehype-sanitize` must come with it (the tests fail otherwise). No `dangerouslySetInnerHTML` anywhere.
- Security: access JWT in memory only, refresh token rotated by the backend, strict CSP, CORS configured for the frontend origin, attachments served with `Content-Disposition` and content type verified by the backend.
- On sign-out the TanStack Query cache is cleared so data does not leak between users.
- Lint rule forbidding string literals in JSX (`eslint-plugin-i18next`) and a check that `es` and `en` have the same keys.
- No data loss: if saving fails, keep the content on screen and retry; warn when closing with unsaved changes.
- Test coverage of the data logic and the key flows (create → edit → save → search).

## 9. Out of the MVP (backlog)

1. Password recovery, email verification, OAuth (Google/GitHub), 2FA.
2. Trash and version history.
3. Links between documents (`[[wikilinks]]`) and backlinks.
4. Automatic metadata extraction for links.
5. Export/import (zip of `.md` files).
6. Share a document via public URL.
7. "/" commands and a formatting toolbar (light WYSIWYG).
8. PWA / full offline mode.
9. Collaborative editing.
10. More languages and RTL support.
11. Total storage quota per user.

## 10. Delivery plan

1. ✅ **Bootstrap**: Vite + React + TS, Tailwind, ESLint/Prettier, Vitest, router, i18n (es/en) and an empty layout.
2. ✅ **Data layer** (interfaces, HTTP client with session renewal, mock adapter, contract and end-to-end tests).
3. ✅ **Authentication**: login, register, "check your email" and activation pages, protected routes, session restore and renewal, language selector saved to the profile.
4. ✅ **Documents**: create, edit, delete and pin; Markdown editor with preview; autosave.
5. ✅ **Folders, nesting and tags**: tree sidebar (folders and documents that hold documents), breadcrumbs, folder page, create / rename / move / delete, drag & drop; tag editor, tag list and tag page.
6. ✅ **Links**: link page with autosave, creation dialog from every entry point, link list, links in the tree and breadcrumbs.
7. ✅ **Attachments**: upload with progress (button and drop), download, delete, images embedded in documents, files on folder pages.
8. ✅ **Search** and shortcuts: `Ctrl/Cmd+K` search dialog with snippets and keyboard navigation (plus the existing `Ctrl/Alt+N` new document and `Ctrl/Cmd+S` save).
9. ✅ Polish: theme switcher, responsive drawer, skip link and contrast pass, trash page, translation parity test.

The backend already serves every resource these steps need (see §6), so they can be built against the real API; the `mock` adapter remains useful for unit tests and for working offline.

## 11. Open questions

- Confirm that the backend will restrict `/users/{id}` to admins or the owner (security issue, see the backend spec §9).
- Backend CORS: `Access-Control-Allow-Headers` must list `Authorization` explicitly (`etc/docker/nginx/conf/app.conf` in the backend) and `Access-Control-Allow-Origin` should be restricted to the frontend origin(s) before production; until then the frontend relies on the development proxy.
- Backend: the JWT authenticator answers `401` with the key `type` instead of `code` (`{"type":"security.unauthenticated",...}`) while every other error uses `code`. The client accepts both; it would be cleaner if the backend were consistent.
- Concurrent edits: the backend has no versioning, so two tabs or devices editing one document overwrite each other. Do we want optimistic concurrency (an `updated_at` check) before the MVP ships?
- Do we expose the Trash view in the MVP (the API supports it) or keep it for later?
- Total storage quota per user (the per-file limit is 50 MB).
