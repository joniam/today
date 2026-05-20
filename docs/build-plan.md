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

## Phase 4: Long-press, drag, reorder, bucket move ✅

- Long-press timer (400ms) on row.
- Drag mode: lift visual, follow pointer, reflow others.
- Drop: commit reorder. If crossed bucket boundary, change item bucket.
- Heat map updates animate on drop.

**Testable state:** Can reorder within a bucket and move between buckets via long-press drag.

Commit: "Phase 4: drag to reorder and move."

## Phase 5: Pull-to-add ✅

- Pull down from scroll top inserts new editable row at top of Today.
- Visual: empty row reveals proportional to pull distance.
- Threshold release commits, focuses input.

**Testable state:** Full interaction model complete. App works fully in isolation, just no persistence.

Commit: "Phase 5: pull to add."

## Phase 6: IndexedDB persistence ✅

- Implement `sync/storage.ts` wrapping `idb`.
- Schema: one object store for state (single record with id 'app').
- On mutation, save state (debounced).
- On app start, load state.
- Remove hardcoded sample data, default to empty state if nothing stored.

**Testable state:** App preserves state across reloads.

Commit: "Phase 6: IndexedDB persistence."

## Phase 7: Markdown parser and serializer ✅

- Implement `sync/parser.ts`.
- `parseMarkdown(text: string): Item[]` and `serializeMarkdown(items: Item[]): string`.
- Unit-test informally with a few round-trip examples in dev console.
- Make sure edge cases handled: empty buckets, completed items, items with special characters.

**Testable state:** Parser round-trips known good markdown.

Commit: "Phase 7: markdown parser."

## Phase 8: GitHub API + first run setup ✅

- Implement `sync/github.ts` with GET and PUT.
- Implement first-run screen: if no PAT stored, show setup form (repo owner, repo, path, PAT). Validate with a GET. Store on success.
- Settings sheet exposes auth section.
- No sync engine yet, just connectivity.

**Testable state:** Can configure auth, can manually call sync functions from console to fetch and push.

Commit: "Phase 8: GitHub API integration."

## Phase 9: Sync engine ✅

- Implement `sync/engine.ts`.
- Outbound: debounced 1500ms after any change, run outbound algorithm.
- Inbound: on app start, on visibility change, on interval (30s).
- Merge logic per spec.
- Store `lastSyncedSha` and base state in IndexedDB after each sync.
- Update status dot to reflect state (green/yellow/red).

**Testable state:** Changes propagate to GitHub. Edits in GitHub propagate back on focus/poll. Two-way sync works.

Commit: "Phase 9: sync engine."

## Phase 10: Sync status panel and settings ✅

Dropped the three-dot settings sheet entirely. Simplified to two surfaces:

- `ui/settings.ts`: first-run overlay only. Shows when no auth token is set; hides on successful connect. Fields: owner, repo, path, PAT. Validates with a GET before saving.
- `ui/syncDebug.ts`: sync status panel, opened by tapping the status dot. Bottom sheet with fixed height. Header (title + close button) and action row (Sync Now / Disconnect) are pinned; body scrolls.
  - Body sections: Connection, State (items, pending, last sync, SHA), Build (version + date), Recent events (last 5, live-updating every 2s).
  - Disconnect uses a two-button confirm flow: first tap swaps both buttons to Cancel / Confirm (danger), no auto-clear.
  - Sync Now triggers inbound + outbound and refreshes the panel after ~3.5s.
  - On open, `theme-color` meta is set dark so the iOS status bar joins the scrim; restored on close.
- Sync defers while an edit is in progress (inbound skipped; outbound completes but does not re-render).
- Outbound race condition fixed: items snapshot captured before awaits; `applyOutboundResult` used instead of `applySyncResult` so local mutations during a push are not clobbered.

**Testable state:** Status dot opens sync panel. First-run overlay appears when not authenticated.

Commit: "Phase 10: sync status panel and first-run settings."

## Phase 11: PWA polish ✅

- `vite-plugin-pwa` with `generateSW` strategy; precaches all built assets for offline shell.
- Manual SW registration in `src/pwa.ts`; skipped in dev mode.
- Update detection via `updatefound`/`statechange` events; sets dot to yellow (pulsing) when a new SW is waiting.
- `checkForUpdate()` called on every status panel open; "Apply →" row appears in Build section when update is available; tapping reloads with new SW.
- New app icon: 4-bar full-bleed heat-map gradient (red→orange→gold), bottom bar 25% swiped right revealing green — a spoof of Clear's icon. Generated PNG assets at 512, 192, 180px from SVG source.

**Testable state:** Installs as PWA. Loads offline. Deploy a new build, reopen app, yellow dot appears; open status panel, tap Apply, reloads with new version.

Commit: "Phase 11: PWA polish."

## Phase 12: Animations and polish pass

### 1. Swipe physics overhaul

**During drag (both directions):**
- Before threshold (70px): tile tracks finger 1:1 as today.
- Past threshold: apply rubber-band damping instead of locking. Each pixel of finger movement past the threshold moves the tile ~0.3px. Tile keeps moving but resists, preventing accidental full-screen flings.

**Delete (left swipe), release past threshold:**
1. Tile animates off to the left edge (translate to `-100vw` or similar, ~200ms).
2. Row height collapses to 0 (CSS transition, ~150ms, starts after or overlaps with step 1).
3. State mutation (`deleteItem`) fires after animation completes.
- Use a `swipeActive` flag (like `collapseActive`) to block re-renders during the animation.

**Complete (right swipe), release past threshold:**
1. Tile snaps back to x=0 (spring, ~150ms).
2. Tile transitions to done styling in place (strikethrough, done colors).
3. Tile animates downward to the top of the done section while items between its current position and the done section slide up to close the gap (~200ms).
4. State mutation (`toggleDone`) fires after animation completes.
- Destination Y: snapshot the position of the first existing done item in the bucket before animating (or the bottom of the last active item if no done items exist yet).
- Newly completed items go to the top of the done section. Implement by assigning `order = minDoneOrder - 1` on completion (or 0 if no done items). No `completedAt` timestamp needed.
- Uncompleting an item continues to append it to the bottom of active items (existing behavior).

### 2. Empty bucket drag fix

**Problem:** The `.empty-hint` placeholder in an empty bucket participates in reflow during drag as if it were a real row -- rows shift around it, making room for it. It should be inert: a visual drop target only.

**Fix:**
- At drag start, set `height: 0` (and `overflow: hidden`) on all `.empty-hint` elements so they occupy no space during reflow math.
- Restore hints on drag end (if the bucket is still empty after drop).
- In `applyReflow`, empty bucket slots no longer displace surrounding rows.
- Snap math for drops into empty buckets: use the hint element's pre-drag rect (captured at drag start before height is zeroed) as the destination position, so the tile lands cleanly where the placeholder was.

**Result:** During drag, the list looks like `[ task 1, soon header, task 2 (tile), later ]` -- no phantom placeholder shifting around.

### 3. iPhone test pass

- Tune any timings that feel off on real hardware.
- Check heat-map color transitions after reorder -- if the instant snap is noticeable, address it here.
- Fix anything else that feels off in daily use.

**Testable state:** Ready for daily use.

Commit: "Phase 12: animation polish."

## Bug / task backlog
### Features
- A divider line in the md file where I can put arbitrary notes that aren't part of the mobile UI
- Shake to undo: undo stack in state.ts (snapshot before each mutation, capped depth), undo() restores last snapshot, shake detection via DeviceMotionEvent, iOS 13+ requires permission via a user gesture (surface in status panel), brief "Undone" toast as feedback. Sync-incoming changes should not be pushed onto the undo stack. Useful feature because it's relatively easy to accidentally delete or change something important, particularly if I have notes and stuff.
- Try iOS haptics using this library - https://tijnjh-ios-haptics.mintlify.app/ (consider whether to use the library or just directly code it into my app)
- Notes - tasks should be able to have notes, with more details. Visually, in the Today app, this should have some sort of visual indicator, subtle, right aligned. When tapping on it, it opens the note UI. From there you can edit, save, delete. Within the document structure, notes is a bullet under the main task and itself can have sub bullets (these render as bullets in the note).

### Bugs
- Tap to add doesn't work. On desktop, it first creates a blank cell, the second actually gets it into edit mode. On mobile it seems to dismiss the keyboard and not even allow text entry. Focus on the desktop fix, I'll confirm whether that also fixes mobile.
- Dragging something down from an upper section to a lower section yields one of those animation snap bugs. I'm seeing this with a Today -> Later move. Here's what's happening - on drop, the item animates to top align with the later header. Then it redraws into the right spot. This only happens when attempting to drop into the top of the later list.


### Nits
- Menu scrim doesn't extend to the top of the screen on iOS (status bar area stays the app's red theme-color instead of matching the scrim).
- Still seeing white background on launching the PWA. Since this is locally stored now, I'd like a better loading state if possible - The red today header and black body would be ideal that then populates with the real UI.
- The yellow blinking dot indicating there's a software update didn't blink indefinitely until I updated. Just keep it going so I don't miss it.



Note: task notes and time estimates are tracked in docs/future.md (v2.2 and v1.2).