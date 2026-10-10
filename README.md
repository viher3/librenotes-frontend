# LibreNotes — Frontend

Notes app with Markdown documents, links and attachments. Full spec in [etc/specs/mvp.md](./etc/specs/mvp.md).

## Development

```bash
cp .env.example .env
npm install
npm run dev
```

By default the app talks to the Symfony backend through a same-origin proxy: the browser calls `/backend/...`
and the dev server forwards it to `BACKEND_PROXY_TARGET` (default `http://localhost`). The proxy is needed because
the backend's CORS configuration does not yet allow the `Authorization` header from another origin.

To work without a backend, set `VITE_DATA_ADAPTER=mock` in `.env`: an in-memory fake with demo data
(sign in with `demo@example.com` / `demo12345`). It only exists in development builds.

| Script                 | Description                                                                   |
| ---------------------- | ----------------------------------------------------------------------------- |
| `npm run dev`          | Development server                                                            |
| `npm run build`        | Typecheck + production build                                                  |
| `npm test`             | Unit tests (Vitest)                                                           |
| `npm run test:e2e`     | Smoke test of the data layer against a **running backend** (see below)        |
| `npm run lint`         | ESLint (includes the no-literal-strings-in-JSX rule)                          |
| `npm run format`       | Prettier                                                                      |
| `npm run api:fetch`    | Download the backend's OpenAPI document (`/api/doc.json`) into `openapi.json` |
| `npm run api:generate` | Generate `src/data/api/schema.d.ts` from `openapi.json`                       |

## Data layer (`src/data`)

Everything the UI needs from the server goes through two interfaces, `AuthRepository` and `NotesRepository`
(`repositories.ts`), working with the domain types in `types.ts` (camelCase, strict) and failing with `ApiError`
(`errors.ts`, whose `code` is the backend's stable error code, usable as a translation key).

| Piece                           | Role                                                                                                    |
| ------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `http/`                         | Adapter for the real API: typed client from the OpenAPI schema, mappers, multipart upload with progress |
| `http/client.ts`                | Adds the Bearer token; on `401` renews the session **once** (refresh tokens are single-use) and retries |
| `session.ts`                    | Access token in memory, refresh token in `localStorage`                                                 |
| `mock/`                         | In-memory backend with the same behaviour and error codes, for development and tests                    |
| `contract/`                     | Behaviour every implementation must share; run against the mock                                         |
| `create.ts`, `DataProvider.tsx` | Choose the adapter from `VITE_DATA_ADAPTER` and expose it with `useRepositories()`                      |
| `rules.ts`                      | Backend rules (tag normalization, URL check...) reusable by forms                                       |

### End-to-end smoke test

`npm run test:e2e` exercises the HTTP adapter against a live backend. It registers one throwaway account,
runs through every endpoint (including renewing an expired token and uploading a file), then deletes everything it
created. It needs `docker` to read the activation token from the backend's MySQL container, and uses 2 of the
backend's 5 logins per 15 minutes. Override the defaults with `E2E_API_URL`, `E2E_MYSQL_CONTAINER`,
`E2E_MYSQL_DATABASE` and `E2E_PHP_CONTAINER`. Do not point it at a database you care about.

## Tree (`src/features/tree`)

The sidebar is a tree of folders, documents (which can hold other documents) and links, following the ARIA tree
pattern. Branches load when opened; `queries.ts` holds the data hooks and the actions (create folder, rename, move,
delete) and invalidates everything that depends on the structure at once. Moving works by dragging and with a dialog.

## Links (`src/features/links`)

A link has its own page (`/link/:id`) with autosave, like documents, and a list at `/links`. `NewLinkProvider` exposes
`useNewLink().open(destination?)`, the dialog every "new link" entry point uses. Only `http(s)` addresses are accepted
(checked in the form and by the backend).

## Attachments (`src/features/attachments`)

`AttachmentsPanel` lists the files of a document or folder; `useAttachmentUploads` sends them one at a time with
progress and keeps failures for retry. Files need the session, so downloads and embedded images go through the data
layer (`downloadAttachment`) instead of a plain URL: documents embed an image as `![name](attachment:ID)`.

## Search (`src/features/search`)

`SearchProvider` binds `Ctrl/Cmd+K` and renders `SearchDialog`, a combobox over `GET /search`. Text is debounced and
results of an older text are never shown for a newer one.

## Theme, layout and trash

`src/lib/theme.ts` holds the dark/light choice (dark by default, saved in `localStorage`); `AppLayout` turns the sidebar
into a drawer on narrow screens; `src/features/trash` is the trash page. `src/locales/locales.test.ts` fails when a
translation is missing in one language or its placeholders differ.

## Structure

See §7 of the spec. UI texts live in `src/locales/<es|en>/*.json`.
