# Today - Build Plan

Phased plan for Claude Code to execute. Each phase ends at a testable, committable state. Run each phase, verify, then proceed.

## Phase 0: Project setup ✅

- Initialize Vite + TypeScript project in repo root.
- Install dependencies: `idb`, `ulid`. No others in v1.
- Create the file structure as in tech spec.
- Add `vite.config.ts` with base path `/today/` and define plugin for build SHA/time.
- Add `tsconfig.json` with strict mode.
- Add `.gitignore` for node_modules, dist, .DS_Store.
- Create empty stub files for all modules so imports resolve.
- Add minimal `index.html` with mount point.
- Add `.github/workflows/deploy.yml` for build + deploy.
- Add web manifest and placeholder icons (solid color, generate from a simple SVG).
- Commit: "Initial project scaffold."

**Testable state:** `npm run dev` starts dev server with blank page. `npm run build` produces `dist/`.

## Phase 1: Rendering and state, no persistence ✅

- Implement `types.ts` with the data model.
- Implement `state.ts` with in-memory state, plus mutation functions: addItem, editItem, toggleDone, moveItem, reorderItem, deleteItem.
- Implement `render.ts` doing full re-render to DOM on state change.
- Implement `ui/colors.ts` with `colorForPosition(index, total)`.
- Implement basic CSS: layout, row styles, heat map application, bucket dividers, settings button placement.
- Seed with hardcoded sample items (3-5 in Today, a few in Soon, a few in Later).
- Status dot in top center, no real status yet.

**Testable state:** Page loads, shows three buckets with sample items, heat map colors applied, dividers visible. Settings button visible bottom-right but does nothing. Nothing interactive yet beyond viewing.

Commit: "Phase 1: render initial state."

## Phase 2: Tap to edit, basic editing ✅

- Click/tap on a row enters edit mode (replace text with input element, focus, select).
- Blur or Enter commits. Escape cancels.
- Click on empty bucket area appends new row in edit mode.
- All mutations go through state, trigger re-render.

**Testable state:** Can add and edit items by tapping. No swipe yet.

Commit: "Phase 2: tap to edit."

## Phase 3: Swipe gestures ✅

- Implement `gestures.ts` swipe handler.
- Right swipe past threshold toggles done. Left swipe past threshold deletes.
- Visual feedback during swipe (background reveal, follows finger).
- Snap back below threshold, commit past threshold.
- Handle scroll vs swipe disambiguation (vertical movement wins early).

**Testable state:** Can complete items by right-swipe, delete by left-swipe. Edit still works.

Commit: "Phase 3: swipe gestures."

## Phase 4: Long-press, drag, reorder, bucket move

- Long-press timer (400ms) on row.
- Drag mode: lift visual, follow pointer, reflow others.
- Drop: commit reorder. If crossed bucket boundary, change item bucket.
- Heat map updates animate on drop.

**Testable state:** Can reorder within a bucket and move between buckets via long-press drag.

Commit: "Phase 4: drag to reorder and move."

## Phase 5: Pull-to-add

- Pull down from scroll top inserts new editable row at top of Today.
- Visual: empty row reveals proportional to pull distance.
- Threshold release commits, focuses input.

**Testable state:** Full interaction model complete. App works fully in isolation, just no persistence.

Commit: "Phase 5: pull to add."

## Phase 6: IndexedDB persistence

- Implement `sync/storage.ts` wrapping `idb`.
- Schema: one object store for state (single record with id 'app').
- On mutation, save state (debounced).
- On app start, load state.
- Remove hardcoded sample data, default to empty state if nothing stored.

**Testable state:** App preserves state across reloads.

Commit: "Phase 6: IndexedDB persistence."

## Phase 7: Markdown parser and serializer

- Implement `sync/parser.ts`.
- `parseMarkdown(text: string): Item[]` and `serializeMarkdown(items: Item[]): string`.
- Unit-test informally with a few round-trip examples in dev console.
- Make sure edge cases handled: empty buckets, completed items, items with special characters.

**Testable state:** Parser round-trips known good markdown.

Commit: "Phase 7: markdown parser."

## Phase 8: GitHub API + first run setup

- Implement `sync/github.ts` with GET and PUT.
- Implement first-run screen: if no PAT stored, show setup form (repo owner, repo, path, PAT). Validate with a GET. Store on success.
- Settings sheet exposes auth section.
- No sync engine yet, just connectivity.

**Testable state:** Can configure auth, can manually call sync functions from console to fetch and push.

Commit: "Phase 8: GitHub API integration."

## Phase 9: Sync engine

- Implement `sync/engine.ts`.
- Outbound: debounced 1500ms after any change, run outbound algorithm.
- Inbound: on app start, on visibility change, on interval (30s).
- Merge logic per spec.
- Store `lastSyncedSha` and base state in IndexedDB after each sync.
- Update status dot to reflect state (green/yellow/red).

**Testable state:** Changes propagate to GitHub. Edits in GitHub propagate back on focus/poll. Two-way sync works.

Commit: "Phase 9: sync engine."

## Phase 10: Settings sheet UI

- Implement `ui/settings.ts`.
- Bottom sheet: tap floating button to open, tap outside or swipe down to close.
- Sections: sync status, font size, build info, auth, data. (Theme switcher dropped for v1; we ship a single dark theme. See deferred decisions.)
- Wire up "Force sync now", "Open data file in GitHub", "Export markdown".

**Testable state:** Settings sheet works.

Commit: "Phase 10: settings sheet."

## Phase 11: PWA polish

- Service worker for offline shell caching.
- Update detection banner.
- Web manifest fully configured.
- Apple touch icons.
- Verify install-to-home-screen works on iOS.

**Testable state:** Can install as PWA on iPhone. Works offline (reading; sync waits for connection).

Commit: "Phase 11: PWA polish."

## Phase 12: Animations and polish pass

- Tune timings.
- Add color transitions on heat map updates after reorder.
- Tighten swipe physics.
- Test on actual iPhone, fix anything that feels off.

**Testable state:** Ready for daily use.

Commit: "Phase 12: animation polish."

## Phase 13 (optional): Sync status popover

- Tap status dot reveals a small popover with last sync time, commit SHA of last sync, error details if any.
- Long-press status dot forces a sync.

Commit: "Phase 13: status popover."

## Deferred decisions

Tracked here so they don't get lost between phases.

- **Completed items sort to the bottom.** Decided during the Phase 1 visual pass. Looked noisier when done items were interleaved with active ones. Should land alongside Phase 4 (reorder logic) or as its own micro-phase before it.
- **Light theme.** v1 ships dark only. The warm cream page bg fought visually with the bold heat-map rows. Light theme (or alternate palettes) is a v2 concern.

## Verification points where Jonathan should check in

- After Phase 1: does the visual feel right? Heat map readable? Dividers right?
- After Phase 4: do the gestures feel good on phone?
- After Phase 9: is sync reliable end to end? Test edits from both sides.
- After Phase 12: daily-use ready check.
