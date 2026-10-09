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

| Area            | Choice                                              | Reason                                                                   |
| --------------- | --------------------------------------------------- | ------------------------------------------------------------------------ |
| Build           | Vite + React 19 + TypeScript                        | Project requirement; typed from the start                                |
| Routing         | React Router                                        | Routes `/`, `/doc/:id`, `/folder/:id`                                    |
| Server state    | TanStack Query                                      | Caching, invalidation, loading states                                    |
| UI state        | Zustand (minimal)                                   | Sidebar open/closed, editor mode                                         |
| Editor          | CodeMirror 6 (`@uiw/react-codemirror`)              | Lightweight Markdown editing with syntax highlighting                    |
| Markdown render | `react-markdown` + `remark-gfm` + `rehype-sanitize` | GFM (tables, task lists) and XSS-safe                                    |
| Styles          | Tailwind CSS                                        | Speed; light/dark theme                                                  |
| i18n            | i18next + react-i18next                             | Multilingual (es/en initially), language detection and manual switcher   |
| Forms           | React Hook Form + Zod                               | Login/register and form validation                                       |
| Tests           | Vitest + Testing Library                            | Integrated with Vite                                                     |
| API client      | `openapi-typescript` + `openapi-fetch`              | Types and client generated from the Symfony backend's OpenAPI definition |
| Quality         | ESLint + Prettier                                   | —                                                                        |

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

- **Create** a new document (button and `Ctrl/Cmd+N` shortcut); default title "Untitled".
- **Edit** the title (header field) and the content (Markdown editor).
- **View**: switch between _Edit_, _Preview_ and _Split_ (editor + preview).
- **Autosave** with debounce (~800 ms) and a status indicator: "Saving…" / "Saved".
- **Delete** with confirmation. No trash in the MVP.
- **Pin** documents (shown at the top of the sidebar).
- Supported Markdown: headings, emphasis, lists, task lists, quotes, code (highlighted blocks), tables, links, images (GFM).

### 4.2 Organization

- Nested **folders**: create, rename, delete (with a warning if not empty), move documents between folders.
- **Tags**: add/remove on a document or link; filter by tag.
- **Sidebar** tree: Pinned → Folders → No folder; Links section.

### 4.3 Links

- Save a link (URL + title + optional note + tags).
- List view; links open in a new tab (`rel="noopener noreferrer"`).
- Edit and delete.
- In the MVP the user types the title; metadata is not extracted automatically.

### 4.4 Attachments

- Attach files to a document: button and _drag & drop_ onto the editor.
- Limit: 50 MB per file (a configuration constant; the backend enforces the real limit and the frontend validates before uploading).
- List of the document's attachments with download and delete.
- Images: "insert into document" option, which adds `![name](url)` at the cursor position.
- Upload progress bar and error handling.

### 4.5 Search

- Global search box (`Ctrl/Cmd+K`) over document titles and content and link titles.
- Results with a highlighted snippet; Enter opens the result.
- Search runs on the backend via `GET /search?q=` (debounced ~300 ms, cancelling the previous request); the frontend does not index content.

### 4.6 Authentication

- **Sign up** (email, name, password) and **sign in** (email + password).
- **Sign out** from the user menu.
- **Session**: the frontend keeps the access token in memory only and stores the refresh token in `localStorage` (the Symfony backend returns it in the response body, e.g. with `lexik/jwt-authentication-bundle` + `gesdinet/jwt-refresh-token-bundle`). The API is called with `Authorization: Bearer <jwt>`. On a `401` it tries to refresh once (a single refresh request shared among concurrent requests); if that fails, it clears the session and redirects to `/login`. Accepted trade-off: a refresh token in `localStorage` is reachable by XSS; this is mitigated with strict Markdown sanitization, CSP, refresh token rotation and a short JWT lifetime.
- **Protected routes**: everything except `/login` and `/register` requires a session; after login the user returns to the requested route.
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

- Light/dark theme: **dark by default** (set via `data-theme="dark"` on `<html>`), with a manual switcher to light; the choice is persisted in `localStorage`.
- Responsive layout: collapsible sidebar on small screens.
- Empty, loading and error states in every view.
- Basic accessibility: keyboard navigation, ARIA labels, adequate contrast.

## 5. Screens and routes

| Route         | Content                                     |
| ------------- | ------------------------------------------- |
| `/login`      | Sign in (public)                            |
| `/register`   | Sign up (public)                            |
| `/`           | Home: recent and pinned documents           |
| `/doc/:id`    | Document editor/preview + attachments panel |
| `/folder/:id` | Folder contents                             |
| `/links`      | Link list and management                    |
| `/tag/:name`  | Items with that tag                         |
| `*`           | 404                                         |

Layout: **Sidebar** (left) · **Main content** · optional **right side panel** (attachments, metadata) on `/doc/:id`.

## 6. Data layer

The backend is our own, so its REST API is the source of truth. To avoid blocking frontend development while the backend is being built, data access is defined as an interface with swappable adapters:

```ts
interface NotesRepository {
  listDocuments(): Promise<Document[]>
  getDocument(id: ID): Promise<Document>
  saveDocument(doc: Partial<Document> & { id?: ID }): Promise<Document>
  deleteDocument(id: ID): Promise<void>
  // ...equivalents for folders, links and attachments
  uploadAttachment(
    documentId: ID,
    file: File,
    onProgress?: (n: number) => void,
  ): Promise<Attachment>
}
```

- **`http` adapter** (production): REST against the Symfony backend (`VITE_API_URL`), with a client generated from its OpenAPI definition (`npm run api:fetch` downloads `/api/doc.json` into the versioned `openapi.json`, and `npm run api:generate` builds `src/data/api/schema.d.ts` from it); it attaches the JWT, refreshes the session and normalizes errors.
- **`mock` adapter** (development and tests only): in-memory/IndexedDB data with a fake user, to make progress without the backend. Not included in the production build.
- Selected via environment variable: `VITE_DATA_ADAPTER=http|mock` (defaults to `http`).
- A similar `AuthRepository` interface (`register`, `login`, `logout`, `refresh`, `me`, `updateProfile`) with the same two adapters.

### Backend status (from `openapi.json`, "Symfony DDD Core" v0.0.2)

The API is served at the host root (`VITE_API_URL=http://localhost`, e.g. `POST /login`); the OpenAPI document is published at `/api/doc.json` (Swagger UI at `/api/docs`).

**Available today**

| Area  | Endpoints                                                                                                                                                                                                                                                                                                                    |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Auth  | `POST /signup` (email, password ≥ 8, optional username; account is created inactive), `POST /users/activate` (email activation token; `404` unknown, `410` expired), `POST /login` (email + password), `PUT /token-renew` and `DELETE /token-renew` (logout), both with `{ "token": "..." }` in the body and a Bearer header |
| Users | `GET/POST /users`, `GET/PATCH/DELETE /users/{id}`, `PATCH /users/{id}/change-password`                                                                                                                                                                                                                                       |

**Implemented in the backend but not yet published in OpenAPI**: the `Notes` module (folders, notes, attachments, trash; see `librenotes/src/Notes`). Until it is documented, the generated client has no types for it and the frontend works against the `mock` adapter.

**Missing for the MVP** (full proposal in the backend repo: `librenotes/etc/specs/notes-data-model.md`): `GET /me` and a `locale` field on the user, attachments bound to a note (today they belong to a folder) and a file download endpoint, saved links, tags, pinned notes, paginated note lists, and `GET /search`. Also, the module currently uses camelCase in responses; the backend plans to move to snake_case before we integrate.

**Known issues to settle with the backend**

- Auth model differs from §4.6: there is a single token (`/login` returns a JWT; `/token-renew` swaps it for a new one while it is still valid) instead of access + refresh tokens. The `/login` and `/signup` success bodies are not described in the OpenAPI document.
- Self-registration requires **email activation** before login, so the UI needs a "check your email" screen and an `/activate?token=` route (previously out of the MVP).
- Error bodies are `{ "code": "security.bad_credentials", "message": "...", "params": [], "status": 401 }` (string codes, usable as i18n keys), but the OpenAPI document documents a different shape (`Error`, `ErrorNotFound`…); validation errors (`422`) carry `details`. Our client follows the real bodies.
- `POST /signup` with an empty body returns `500` (`Undefined array key "email"`) instead of `400`.
- The OpenAPI document is invalid: empty schemas are serialized as `[]` instead of `{}` (5 places). `scripts/generate-api.mjs` normalizes them; the root cause should be fixed in the backend.
- CORS is open (`Access-Control-Allow-Origin: *`), which is fine for a Bearer-token API but should be restricted in production.

Expected endpoints (initial contract for the missing resources, to be agreed with the backend):

| Resource    | Endpoints                                                                                        |
| ----------- | ------------------------------------------------------------------------------------------------ |
| Auth        | `POST /auth/register`, `/auth/login`, `/auth/logout`, `/auth/refresh`; `GET/PATCH /me`           |
| Documents   | `GET/POST /documents`, `GET/PATCH/DELETE /documents/:id`                                         |
| Folders     | `GET/POST /folders`, `PATCH/DELETE /folders/:id`                                                 |
| Links       | `GET/POST /links`, `PATCH/DELETE /links/:id`                                                     |
| Attachments | `POST /documents/:id/attachments` (multipart), `DELETE /attachments/:id`; authenticated download |
| Search      | `GET /search?q=&type=document,link&tag=`                                                         |
| Errors      | `{ "error": { "code": "...", "message": "..." } }` with stable codes                             |

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
- Markdown is always sanitized when rendered; no unsanitized `dangerouslySetInnerHTML`.
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

1. **Bootstrap**: Vite + React + TS, Tailwind, ESLint/Prettier, Vitest, router, i18n (es/en) and an empty layout.
2. **Data layer** (interfaces, HTTP client, mock adapter) + types + tests.
3. **Authentication**: login, register, protected routes, session refresh, language selector.
4. **Documents**: CRUD, editor, preview, autosave.
5. **Folders and tags** + sidebar.
6. **Links**.
7. **Attachments**.
8. **Search** and shortcuts.
9. Polish: theme, responsive, empty/error states, accessibility, translation review.

Steps 4–8 can proceed against the `mock` adapter until the backend publishes its contract.

## 11. Open questions

- Backend: document the `/login` and `/signup` responses, add the MVP resources listed in §6 (documents, folders, links, attachments, search, `/me`), and fix the OpenAPI/`signup` issues above.
- Session model: confirm whether `/token-renew` accepts an expired JWT (grace period) or only a valid one; this decides how the frontend recovers after being idle.
- JWT header authentication is already decided; revisit later whether to move the refresh token to an `HttpOnly` cookie (requires same-site or CORS with credentials).
- Total storage quota per user (the per-file limit is 50 MB).
