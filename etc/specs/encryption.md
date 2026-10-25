# Per-document encryption — Frontend Spec

Lets the user encrypt individual documents with a password only they know. Encryption and decryption happen in the browser; the server stores an opaque blob and never sees the password or the plaintext.

## 1. Goals and non-goals

**Goals**

- Opt-in, per document: the user decides which documents are encrypted.
- The key never leaves the browser and is never persisted.
- Autosave, editors (visual and Markdown) and the rest of the app keep working unchanged on plaintext.

**Non-goals (this version)**

- Encrypting titles, tags, folder or dates: they stay in clear text (they remain searchable and visible in the tree).
- Encrypting attachments. A document that embeds attached images leaks them; the UI must say so.
- Password recovery. Losing the password means losing the content.
- Searching inside encrypted content (server-side search skips it).

## 2. Decisions

| Topic        | Decision                                                                               |
| ------------ | -------------------------------------------------------------------------------------- |
| Cipher       | AES-256-GCM via WebCrypto                                                              |
| KDF          | Argon2id (m=64 MiB, t=3, p=1) with `hash-wasm`, lazy-loaded, run in a Web Worker       |
| Nonce        | 96 random bits, new on every save. The salt is fixed per document                      |
| AAD          | The note `id` (a blob cannot be moved to another note)                                 |
| Title        | Not encrypted                                                                          |
| Attachments  | Not encrypted for now                                                                  |
| Auto-lock    | Yes: keys are dropped on logout and after an inactivity timeout                        |
| Key lifetime | Non-extractable `CryptoKey`, in memory only, one per document. Never in `localStorage` |

## 3. Envelope

Stored in `Note.content`:

```
lnenc:v1:<base64( JSON { kdf: "argon2id", m, t, p, salt, nonce, ct } )>
```

KDF parameters travel in the envelope so they can be raised later without breaking old documents. An unknown version is shown as an error, never as garbage.

## 4. Structure

```
src/lib/crypto/            envelope.ts, kdf.ts, kdf.worker.ts, *.test.ts
src/features/encryption/   EncryptionProvider.tsx   in-memory key cache, locking
                           LockedDocument.tsx       unlock screen
                           EncryptDialog.tsx        enable / remove / change password
                           useNoteCipher.ts
src/locales/{es,en}/encryption.json
```

## 5. Flows

1. **Open.** `DocumentPage` sees the `lnenc:` prefix (or the backend flag) and renders `LockedDocument` instead of `DocumentEditor`. The title stays visible. On unlock the content is decrypted and `DocumentEditor` is mounted with the plaintext plus an encryption context.
2. **Save.** The `save` given to `useAutosave` is wrapped: when the document is encrypted and `changes.content` is present, it is encrypted first. The query cache holds the ciphertext, like the server. The draft stays plaintext in memory only.
3. **Enable.** Button in the document header. The dialog asks for password and confirmation plus an "I understand there is no recovery" checkbox, then `flush()`es, encrypts the current content and saves.
4. **Remove / change password.** Only while unlocked: save as plaintext, or re-encrypt with a new salt.
5. **Lock.** Logout clears the key cache; an inactivity timer does the same and returns open encrypted documents to the unlock screen.

## 6. Backend contract

The backend never holds the key; it only recognises the `lnenc:` prefix of `content`:

- `is_encrypted` is **derived from the prefix** on notes (detail, lists, children, folder contents) and on search results. There is no column and no client-supplied flag that could get out of step with the content.
- Search skips the content of encrypted notes (only title and tags match) and returns an empty snippet, so ciphertext never matches nor leaks as a "snippet".
- `content` has no length limit beyond the column type; the envelope is about 33% larger than the plaintext (base64) plus a fixed header.
- The mock adapter implements the same rules, and `contract/` checks them.

## 7. Tests

- jsdom may lack `crypto.subtle`: set up `node:crypto` `webcrypto` in the test setup.
- Unit: round trip, wrong password, tampered ciphertext, AAD from another note, fresh nonce on every encryption, unknown version.
- Integration invariant: the repository **never receives plaintext** for an encrypted note (spy on `updateNote`).
- Components: unlock screen, enable flow, change password, hidden snippet in search, auto-lock.

## 8. Status

| Phase                                                | Status                                       |
| ---------------------------------------------------- | -------------------------------------------- |
| 1. Backend: flag and search exclusion                | Done (derived from the prefix, no migration) |
| 2. `lib/crypto` with tests                           | Done                                         |
| 3. Lock/unlock in `DocumentPage`, encrypted autosave | Done                                         |
| 4. Enable / remove / change-password dialogs, es/en  | Done                                         |
| 5. Lock icon in tree, lists and search               | Done                                         |
| 6. Auto-lock timer                                   | Done (`AUTOLOCK_MS`, 10 minutes)             |
| 6. Strict CSP                                        | Deployment concern, see below                |
| 7. Attachment encryption                             | Not started (out of this version)            |

**CSP.** Serve the app with a strict policy. Argon2id runs as WebAssembly, so `script-src` needs `'wasm-unsafe-eval'`; the KDF worker is a same-origin module (`worker-src 'self'`). Example:

```
Content-Security-Policy: default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'; connect-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'
```

It is not set from `index.html` because the dev server injects inline scripts; it belongs in the web server in front of the built `dist/`.

## 9. Known limits

- The JavaScript is served by the same server: whoever compromises it can ship code that steals the password. A strict CSP and serving static assets separately reduce, not remove, the risk.
- Plaintext lives in memory while a document is open; browser extensions and XSS can read it.
