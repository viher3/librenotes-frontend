# LibreNotes — Bulk Actions (Frontend Spec)

> **Status: implemented** (see §8 for what differs from the proposal). Backend counterpart: `librenotes/etc/specs/bulk-actions.md` (endpoints `POST /bulk/move` and `POST /bulk/trash`). Extends [mvp.md](./mvp.md). The backend ships first: the client is regenerated from its OpenAPI (`npm run api:fetch && npm run api:generate`).

## 1. Goal

Let the user select several folders, documents, links and files and act on them at once:

1. **Move** them to another folder, under a document, or to the top level.
2. **Delete** them (they go to the trash and can be restored, same as deleting one).

Today everything is per item (card "Move" button, context menu, drag & drop in the sidebar).

**Out of scope**: permanent delete / restore from the trash page, multi-item drag & drop in the sidebar tree, copy, bulk tags/icons, selecting across different pages.

## 2. UX

### 2.1 Where

Wherever items are shown as cards: `FolderPage`, `HomePage`, `SubDocuments` (children of a document), `LinksPage` and the `AttachmentsPanel` of a folder or document. The sidebar tree is unchanged.

### 2.2 Selecting

- Each card gets a **checkbox** (top-start corner, mirroring the existing `CardMoveButton` on the end side). It is visible on hover/focus, and **always visible while a selection exists** (selection mode); on touch devices it is always visible.
- A **"Select"** button in the page header enters selection mode explicitly (checkboxes visible, card click toggles instead of navigating); it turns into **"Done"**.
- While in selection mode, clicking a card toggles it (it does not navigate). Outside selection mode, a normal click still navigates; the checkbox, `Ctrl/Cmd+click` start a selection.
- `Shift+click` selects the range from the last toggled card within the same section ordering shown on screen (folders, documents, links in that visual order).
- Keyboard: `Space` toggles the focused card, `Ctrl/Cmd+A` selects every item on the page (while in selection mode), `Esc` clears and leaves selection mode.
- Section headers ("Folders", "Documents", "Links") get a tri-state "select all in section" checkbox in selection mode.
- Selection is **per page**: navigating elsewhere clears it. After a refetch, ids that no longer exist are pruned from it.
- Files in `AttachmentsPanel` are selectable like cards (same checkbox, range and select-all rules, as a fourth section "Files"). A page can mix all four kinds.
- Selecting a container does not require selecting its files: they go with it (§2.4, §2.5).

### 2.3 Action bar

While ≥ 1 item is selected a **toolbar** (`role="toolbar"`, `aria-label`) appears — sticky at the top of the content on desktop, fixed at the bottom on small screens:

`N selected` · **Move to…** · **Delete** · **Clear**

The count is announced through an `aria-live="polite"` region. Buttons are disabled while a request is in flight.

### 2.4 Move

Reuses `MoveDialog`, generalised to a list of nodes:

- Title: "Move N items" (the single-item wording stays for one).
- Files cannot go to the top level: if the selection contains a file, "All documents" (root) is not offered.
- Destinations that are **invalid for the selection are not offered / are disabled**: every selected folder or note and everything inside them; and, if the selection contains a folder, every document (folders cannot live under documents — `canDrop` rules generalised: a destination is valid only if valid for **each** item).
- Server remains the authority (the dialog cannot see the whole tree); errors are shown inside the dialog and the selection is kept.
- On success: close, clear selection, refresh.

### 2.5 Delete

`ConfirmDialog`: "Move N items to the trash?" with a breakdown ("2 folders, 3 documents, 1 link, 4 files") and the same warning as today's folder/document delete when something contains children: _everything inside goes with it — attached files included — and can be restored from the trash_. Moving a folder or document likewise carries its files; nothing extra is shown. No type-to-confirm. On success: clear selection, refresh, and toast/status "N items moved to the trash" (no undo in this iteration; restore lives in the trash).

If the currently open document is inside the deleted set (e.g. bulk delete from `SubDocuments` of an open document is not affected, but deleting an ancestor of the open document is possible via folder pages only), navigate to `/` — the same handling the single delete uses.

### 2.6 Errors and states

- Atomic result: any error means **nothing changed**. Show it in the dialog (`Alert`) via `errorMessage`, keep the selection, offer retry.
- `*.not_found` (404): something was changed elsewhere → refresh the page data, prune the selection, message "Some of the selected items no longer exist. The list was updated."
- `validation_error` for > 100 items: the UI **prevents** it by disabling the actions with the hint "Select up to 100 items at a time".
- Encrypted documents move/delete like any other (no content is needed).

## 3. Data layer

Contract (`src/data/repositories.ts`, `NotesRepository`):

```ts
export type BulkItem = { kind: 'folder' | 'note' | 'link' | 'attachment'; id: ID }

/** All-or-nothing. Resolves with how many top-level items were affected (nested selections collapse). */
moveMany(items: BulkItem[], destination: Destination): Promise<{ count: number }>
deleteMany(items: BulkItem[]): Promise<{ count: number }>
```

- **HTTP** (`src/data/http/repositories.ts`): `POST /bulk/move` with `{ items: [{type, id}], folder_id? , parent_note_id? }` (destination mapped as in `moveNote`: root → neither field), `POST /bulk/trash`. Types come from the regenerated `schema.d.ts`; mapper in `mappers.ts`.
- **Mock** (`src/data/mock`): implements the same semantics as the backend — validation first, then apply; nested-selection normalisation; same error codes (`notes.invalid_location`, `attachment.invalid_location`, `folder.cycle_detected`, `note.cycle_detected`, `*.not_found`, `validation_error` > 100 / empty). This keeps the UI testable offline.
- **Contract tests** (`src/data/contract/repositoryContract.ts`): add a `bulk actions` block (mixed move to folder/note/root, including files; files to root rejected; a folder/note with files keeps them reachable after the move; atomic failure leaves everything unchanged; cycle and folder→note rejected; foreign items → 404; bulk trash cascades (files included) and is restorable, standalone files appear in the trash; nested selection counted once; limits). The same block runs against the mock and, in `realBackend.e2e.ts`, against the real backend.

## 4. UI implementation

- `src/features/tree/queries.ts`: add `bulkMove` and `bulkRemove` mutations to `useTreeActions` (both `onSuccess: invalidateStructure`; `bulkRemove` also `removeQueries(noteKeys.detail(id))` for each deleted note).
- **Selection state**: `src/features/tree/useSelection.ts` — a hook local to the page (not global store): `{ selected: Map<key, BulkItem>, isSelected, toggle, range, setMany, clear, count, active }`, key = `${kind}:${id}`; takes the ordered list of visible items to support ranges, select-all and pruning.
- **Components** (`src/components/ItemCard.tsx` + new files):
  - `ItemCard` gets optional `selection?: { selected: boolean; active: boolean; onToggle(event) }`; renders `CardSelectCheckbox` (`aria-label` "Select {{name}}"), highlights selected cards (ring + background, not colour alone), and in `active` mode swaps `Link` navigation for toggling.
  - `SelectionBar` (`src/features/tree/SelectionBar.tsx`): the toolbar of §2.3.
  - `MoveDialog`: accept `nodes: MoveItem[]`; generalise the "cannot pick the moved item / its contents / documents when a folder is included" logic; `useMoveDialog` gets `openMoveMany(items)`.
  - Delete confirmation reuses `ConfirmDialog` with the breakdown copy.
- Wire into `FolderPage`, `HomePage`, `SubDocuments`, `LinksPage`. The single "Move" button and the context menu keep working on one item. Right-clicking a card that is **part of a multi-selection** (including the sidebar-independent `EntityMenuProvider` menu on cards) shows the bulk menu for the whole selection: "Move N items to…", "Delete N items", "Clear selection". Right-clicking a card outside the selection acts on that card only (and does not change the selection). This is part of this iteration.
- **i18n**: new keys in `src/locales/{en,es}/tree.json` (`select`, `done`, `selectedCount_one/_other`, `selectAllInSection`, `bulk.move`, `bulk.delete`, `bulk.clear`, `bulk.moveTitle_other`, `bulk.deleteTitle_other`, `bulk.deleteBreakdown` (with `files_one/_other`), `bulk.trashed`, `bulk.staleItems`, `bulk.limit`); `locales.test.ts` already guards en/es parity. Spanish copy uses "Mover a…", "Eliminar", "N seleccionados".
- **Accessibility**: checkboxes are real `<input type="checkbox">`; toolbar is keyboard reachable and focus moves to the dialog and back; selection changes announced via the live region; focus returns to the "Select"/first card after the action.

## 5. Tests (Vitest + Testing Library, fake server/mock)

- Selection: checkbox toggle, Ctrl+click, Shift+click range, select all, section checkbox tri-state, Esc clears, navigation clears, pruning after refetch, card click toggles in selection mode and navigates otherwise.
- Bar: count + plural, buttons disabled in flight and above 100.
- Move: dialog hides invalid destinations (selected folder, its descendants, documents when a folder is selected), success refreshes page and tree, server error keeps the selection and shows the message.
- Delete: breakdown text, success moves items to the trash (visible in `TrashPage`), 404 path prunes selection, navigates away if the open document was removed.
- `dnd.test.ts` unaffected; add unit tests for the generalised destination validity helper.
- i18n parity (`locales.test.ts`) and `polish.test.tsx` a11y checks pass.

## 6. Delivery order

1. Backend (attachment move, `POST /bulk/trash`, `POST /bulk/move`) + OpenAPI; regenerate `openapi.json` / `schema.d.ts`.
2. Data layer: contract, HTTP, mock, contract tests.
3. `useSelection`, `ItemCard` checkbox, `SelectionBar`.
4. Bulk delete (confirm dialog) on `FolderPage`; then bulk move (`MoveDialog` generalisation).
5. Roll out to `HomePage`, `SubDocuments`, `LinksPage`; i18n; e2e against the real backend.

## 7. Open questions

1. **Undo toast** after bulk delete (restore the same N items in one click)? Needs a bulk restore endpoint (backend open question 2); until then the trash is the undo.
2. **Multi-item drag & drop** into the sidebar tree: natural next step reusing `moveMany`; the drag payload (`DRAG_TYPE`) would carry a list.
3. **Select across pages** (e.g. paginated `LinksPage`): selection is per loaded page today; "select all N results" would need server-side filtering.

## 8. Implementation notes and deviations

- **Where it lives.** `features/tree/useSelection.ts` (state of one page), `SelectionBar.tsx` (toolbar and the Select/Done toggle), `useBulkActions.tsx` (move and delete dialogs plus the selection's right-click menu), `bulk.test.tsx`. `ItemCard` gained `selection`, `SelectCheckbox`, `SectionCheckbox` and `pickHandlers`; `MoveDialog` takes `nodes`; `EntityMenuProvider` gained `openCustom` for menus of the caller's own.
- **Pages.** `FolderPage`, `HomePage`, `LinksPage`, and `DocumentPage` (sub-documents, links and files together via `SubDocuments` and `AttachmentsPanel`). The sidebar tree is unchanged.
- **One pick per item.** A document listed twice on the home page (recent and root) is one pick.
- **No "moved to the trash" toast.** After a successful bulk delete the selection clears and the items disappear; the trash page is the undo (open question 1). Navigating away when the open document is removed is not needed: the pages that offer bulk actions only list things _inside_ the open page.
- **Single vs bulk.** Actions started from a selection always use the bulk endpoints, even for one item; the per-item "Move" button and menu still use the single endpoints.
- **Destination text.** The backend answers `note.parent_not_found` (not `note.not_found`) for a missing destination note of a file move; the mock now does the same.
- **Real-backend smoke test.** `data/e2e/realBackend.e2e.ts` has a bulk test; it needs a backend with registration enabled, which the local one did not have, so it was not run here. The same behaviour is covered by the backend's acceptance tests.
