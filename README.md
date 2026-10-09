# LibreNotes — Frontend

Notes app with Markdown documents, links and attachments. Full spec in [etc/specs/mvp.md](./etc/specs/mvp.md).

## Development

```bash
cp .env.example .env
npm install
npm run dev
```

| Script                 | Description                                                                   |
| ---------------------- | ----------------------------------------------------------------------------- |
| `npm run dev`          | Development server                                                            |
| `npm run build`        | Typecheck + production build                                                  |
| `npm test`             | Tests (Vitest)                                                                |
| `npm run lint`         | ESLint (includes the no-literal-strings-in-JSX rule)                          |
| `npm run format`       | Prettier                                                                      |
| `npm run api:fetch`    | Download the backend's OpenAPI document (`/api/doc.json`) into `openapi.json` |
| `npm run api:generate` | Generate `src/data/api/schema.d.ts` from `openapi.json`                       |

## Structure

See §7 of the spec. UI texts live in `src/locales/<es|en>/*.json`.
