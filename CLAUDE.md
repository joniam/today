# Today - Project Context for Claude Code

This is `today`, a single-list PWA todo app inspired by Clear, built for Jonathan's daily prioritization workflow. Data lives in a separate private GitHub repo as a markdown file, also synced to an Obsidian vault.

## Read these first, in order

1. `docs/design-spec.md` - what the app looks and feels like
2. `docs/tech-spec.md` - how it's built, data model, sync algorithm
3. `docs/build-plan.md` - phased plan you're executing

(`docs/setup.md` exists for human reference, environment setup. Not needed for executing the build.)

## Working agreement

- Execute one phase at a time. After each phase, stop and report what you did so Jonathan can verify.
- Make small commits with clear messages.
- Don't add dependencies beyond what's listed in the tech spec without flagging it.
- Don't change the markdown file format. It's an interop contract with Obsidian.
- The data repo is `today-data` (private, owner joniam). The app repo is this one (`today`, public, owner joniam).
- Never log or commit the GitHub PAT.
- When debugging animation or gesture bugs: add console.log instrumentation first, fix second. Never remove logs until the fix is confirmed by testing.

## Conventions

- TypeScript strict mode. No `any` without comment explaining why.
- No framework (no React, no Vue). Direct DOM. Vanilla TS.
- Vanilla CSS, no preprocessor. Use CSS custom properties for theme values.
- File organization per tech spec. Keep modules focused.
- Avoid em-dashes in any user-facing text or code comments (Jonathan's preference).

## What to verify after each phase

- `npm run build` succeeds.
- `npm run dev` runs and the app loads without console errors.
- Commit with a clear message: `Phase N: description`.

## When stuck

- Don't make up an API. Read the GitHub API docs if needed.
- Don't add libraries to "solve" gesture handling unless explicitly approved. Vanilla pointer events are the plan.
- If the spec is ambiguous, choose the simpler option and note the decision in the commit message.

## Things deliberately out of scope for v1

See design spec section "What we are not building in v1". Don't add these even if they seem easy.

## UI system

This section is a working reference for the rendered UI. The design spec covers intent; this covers mechanics.

### DOM structure and what each element represents

The DOM tree follows this hierarchy:

```
.app
  .list                         <-- scrolling column, also the drag-gap fill layer
    section.bucket[data-bucket] <-- one per bucket (today / soon / later)
      .bucket-header[data-bucket]
      .row[data-id]             <-- one per item; layout placeholder only
        .row-action.row-action-complete   <-- green layer behind content (left side)
        .row-action.row-action-delete     <-- dark/red layer behind content (right side)
        .row-content            <-- the visible tile; receives all transforms
          .row-text | .row-input
      .empty-hint               <-- shown instead of rows when bucket is empty
  .settings-button
```

Key distinctions:

- **`.row` is a layout box, not a visual element.** It holds the item's space in the flow. It never gets a `background`, `border`, or visual transform during normal rendering. During swipe and drag, transforms go on `.row-content`, not `.row`. This keeps the row's footprint stable so surrounding rows don't shift.

- **`.row-content` is the tile the user sees.** It carries the heat-map `background-image`, inset highlight/shadow, text color, and font weight. During swipe it translates horizontally. During drag it translates in both axes. When dragging, `.row` gets `overflow: visible` so the tile's drop shadow is not clipped.

- **`.row-action` layers sit behind `.row-content` (z-index 0 vs 1).** They are always present in the DOM but invisible until `.show-complete` or `.show-delete` is added to `.row`, which switches them from `display: none` to `display: flex`. The complete action is green on the left; the delete action is dark/red on the right.

- **`.bucket-header` participates in the heat map.** It uses a flat `backgroundColor` (no per-row mini-gradient) so it reads as a label, not another tile. It is `position: sticky` with `z-index: 5`. During drag it receives a `translateY` transform when the drag crosses its bucket boundary.

- **`.list` carries the drag-gap fill.** `render()` sets a `linear-gradient` on `.list` spanning the full heat-map range. While rows shift during drag, any exposed gap shows the correct gradient color rather than the dark page background.

- **`.empty-hint` is the only tap-to-add target in an empty bucket.** The header itself is not interactive. Tapping the hint calls `addItem('', bucket)` and sets `editingId` to the new item's id.

### Rendering pipeline

`render.ts` does a full `listEl.replaceChildren(...)` on every state change. There is no diffing.

The render cycle is:
1. `subscribe(scheduleRender)` in `init` — hooks state mutations to the render schedule.
2. `scheduleRender()` posts a `requestAnimationFrame` unless one is already pending and unless `dragActive` is true. The `dragActive` guard is critical: re-rendering while drag transforms are live would discard all in-flight transforms and snap everything back.
3. `render()` computes `flattenedForRender()` (all items across all buckets in order), assigns each item and each bucket header a position index in a combined sequence (headers count as positions), then builds the full DOM tree into a DocumentFragment and calls `replaceChildren`.
4. After replacing children, `render()` restores focus to the editing input if `editingId` is set.

`editingId` is module-level state in `render.ts`, not part of the data model. It is purely render-side. The `<input>` element is created during render when `item.id === editingId`; when `editingId` is null the same slot renders a `<span>`. When an item is in edit mode, `attachRowGestures` is not called for that row, so swipe and long-press are disabled while editing.

### Color and heat-map system

All color logic lives in `src/ui/colors.ts`.

`colorForPosition(index, total)` interpolates in HSL between:
- Index 0: `hsl(0, 75%, 50%)` -- saturated red
- Last index: `hsl(50, 85%, 55%)` -- yellow-gold

`total` = number of items + 3 (one for each bucket header). Each header occupies one index position immediately before its bucket's rows. The sequence is: today-header, today-rows..., soon-header, soon-rows..., later-header, later-rows..., which keeps the visible gradient monotonic.

`rowBackgroundForPosition(index, total)` takes the same base color and creates a vertical mini-gradient: `+5% lightness` at top, `-5% lightness` at bottom. This gives each tile a slightly raised, convex look.

How each element uses color:
- **Bucket headers:** `header.style.backgroundColor = colorForPosition(position, total)` -- flat fill, no gradient.
- **Active (not-done) rows:** `content.style.backgroundImage = rowBackgroundForPosition(index, total)` -- vertical mini-gradient on `.row-content`.
- **Done rows:** `backgroundImage` is not set in `render.ts` (skipped by the `if (!item.done)` guard). The CSS rule `.row-done .row-content { background: var(--done-bg); }` applies a flat `#0c0c0c` via the `background` shorthand, which resets `background-image` to none.
- **The list background fill:** `listEl.style.backgroundImage = linear-gradient(to bottom, colorForPosition(0, total), colorForPosition(total-1, total))` -- full-range gradient on the container, fills gaps during drag.
- **Past-threshold swipe (completing):** `.past-threshold.show-complete .row-content` overrides with `background-color: #1ec850 !important`, turning the tile solid green while above the commit threshold.

### Gesture handling

Two gesture modules work together. `gestures.ts` handles per-row swipe, tap, and long-press detection. `render.ts` `startDrag` handles the drag lifecycle after long-press fires.

**`attachRowGestures(row, callbacks)` in gestures.ts**

Runs a mode state machine on the row's pointer events: `idle → tracking → swipe | scroll | long-press`.

- `pointerdown`: enters `tracking`, records `startX/Y/Time`, starts the 300ms long-press timer.
- `pointermove`:
  - If movement exceeds 8px in any direction, cancels the long-press timer.
  - If `|dy| > |dx|` and `|dy| > 8px`: enters `scroll` mode, stops tracking (lets the browser scroll).
  - If `|dx| > 8px`: enters `swipe` mode, calls `setPointerCapture` to track outside element bounds.
  - In `swipe` mode: calls `applyVisualForDx(dx)` every frame. When `|dx| > 70px (SWIPE_THRESHOLD_PX)`, locks `.row-content` at ±70px, adds `past-threshold` class, fires a 10ms vibration. When falling back below threshold, removes `past-threshold`, fires [3,3,3] vibration.
- `pointerup`:
  - `tracking` mode within 400ms: fires `onTap()`.
  - `swipe` mode past threshold: fires `onCompleteCommit()` or `onDeleteCommit()`.
  - `swipe` mode below threshold: snaps `.row-content` back to 0 with a 150ms ease transition.
- Long-press timer fires while still in `tracking` mode: enters `long-press` mode and calls `onLongPress(pointerId, x, y)`. The gesture module then does nothing further on pointerup -- the drag controller owns the pointer from that point.

**`startDrag` in render.ts**

Called by the `onLongPress` callback. Owns the pointer for the rest of the drag.

On entry:
1. Sets `dragActive = true` (blocks re-renders).
2. Captures the pointer on the row element.
3. Snapshots `allRows`, `allHeaders`, `originalRowTops`, `originalRowBottoms` from live DOM. These snapshots are never refreshed during the drag.
4. Builds a `DragSlot[]` array. Each slot represents a valid drop position: `{ bucket, indexInBucket, flatIdx, midY }`. `flatIdx` counts row elements only (headers excluded). `midY` is the viewport Y coordinate used for hit-testing.
5. Adjusts all slot `midY` values by ±halfH around the source row's center, so the user has to move the tile's center past each boundary to trigger a slot change. Exception: cross-bucket slots that share `sourceFlatIdx` (the "end of previous bucket" and "start of this bucket" positions adjacent to the source) skip the adjustment because their natural `midY` falls in the header gap.
6. Applies the lift animation to `.row-content` (scale 1.06, `box-shadow` transition), sets `transform` transitions on all non-source rows and all headers, fires a 15ms vibration.

On `pointermove`:
1. Updates `.row-content` transform to `translate(dx, dy) scale(1.06)`, following the pointer directly with no easing.
2. Calls `findTargetSlot(clientY)` -- nearest slot by `|midY - clientY|` distance.
3. Calls `applyReflow(target)`, which only re-runs if `target.flatIdx` or `target.bucket` changed since last call.

`applyReflow(target)`:
- Rows: for each non-source row at index `i`, computes a `dy` shift using a uniform `±sourceHeight` (not per-row deltas). When target is below source (`targetFlatIdx > sourceFlatIdx`), rows at indices `(sourceFlatIdx, targetFlatIdx)` shift up by `sourceHeight`. When target is above source, rows at `[targetFlatIdx, sourceFlatIdx)` shift down by `sourceHeight`. When target bucket is empty, no rows shift at all -- the source tile floats over the hint with nothing moving.
- Headers: for each `.bucket-header` at bucket index `hdrBucketIdx`, shifts by `+sourceHeight` (down) if `srcBucketIdx >= hdrBucketIdx && tgtBucketIdx < hdrBucketIdx` (source is at or below the header, target crossed above it), or `-sourceHeight` (up) if `srcBucketIdx < hdrBucketIdx && tgtBucketIdx >= hdrBucketIdx`. The today header never shifts (nothing can drag from above index 0). Headers do not shift when target bucket is empty.

On `pointerup` / `pointercancel`:
1. Calls `applyReflow(target)` one last time to ensure final reflow state matches drop target.
2. Computes `finalDy` for the snap animation. **Invariant: `finalDy` must place `sourceContent`'s top edge exactly where the item will appear in the re-rendered DOM** -- not where the slot currently is. Each case models a specific post-render layout outcome. Key facts the math must account for: (a) when source leaves a non-empty bucket, that bucket shrinks by `sourceHeight`, pulling everything below it up; (b) when source is the only row in its bucket, the bucket stays the same height (hint fills it); (c) `allRows[target.flatIdx]` may not be in `target.bucket` -- when the target bucket is empty `flatIdx` points to the first row of the next bucket, so `originalRowTops[target.flatIdx]` is wrong; (d) when `target.indexInBucket > 0` but `allRows[target.flatIdx]` is in the next bucket, the target is end-of-bucket -- use `originalRowBottoms[target.flatIdx - 1]`.
3. Animates `.row-content` to `translateY(finalDy) scale(1.0)` over 150ms.
4. After 150ms: clears all transforms on rows, headers, and source content; sets `dragActive = false`; calls `commitDrop(target)`, which calls `moveItem()`/`reorderItem()` and triggers a re-render.

### Visual state to component state mapping

| Condition | CSS effect |
|---|---|
| `item.done` | `.row-done` on `.row`: done-bg/done-fg colors, strikethrough on `.row-text` |
| `editingId === item.id` | `.row-content` renders `<input>` instead of `<span>`; `attachRowGestures` not called |
| Swiping right (`dx > 0`) | `.show-complete` on `.row` (reveals green layer); `.row-action-complete { display: flex }` |
| Swiping left (`dx < 0`) | `.show-delete` on `.row` (reveals dark/red layer); `.row-action-delete { display: flex }` |
| `|dx| > 70px` while swiping | `.past-threshold` on `.row`; `.row-content` locked at ±70px, full-green bg if completing |
| Row is being dragged | `.dragging` on `.row` (`overflow: visible`, `touch-action: none`); transform on `.row-content` |
| Other rows during drag | `translateY` on `.row` element directly (not on `.row-content`) |
| Headers during cross-bucket drag | `translateY(±sourceHeight)` on `.bucket-header` |

### Patterns and conventions

**Transforms always go on `.row-content`, not `.row`, during swipe and drag.** `.row` is the layout placeholder; its dimensions stay fixed so sibling rows don't shift. Transforms on `.row-content` move the painted tile without affecting layout. The one exception is reflow during drag, where non-source rows get `translateY` on `.row` itself -- this is intentional because we want those rows to visually claim the space they'll occupy after drop.

**Full re-render is blocked during drag (`dragActive` flag).** Any state mutation during a drag is queued by the RAF guard in `scheduleRender` and fires after `dragActive` is cleared in the `finishDrag` timeout.

**DOM positions are snapshotted once at drag start and never re-queried.** `originalRowTops` and `originalRowBottoms` are captured before any transforms are applied. All reflow math and snap calculations reference these snapshots. This avoids forced reflows mid-drag.

**`order` uses fractional indexing.** When inserting between two items with orders 1.0 and 2.0, `commitDrop` assigns order 1.5. This avoids renumbering the whole list on every reorder. Over time the gaps narrow, but for a list of this size it is not a concern.

**`BUCKET_ORDER` is the single source of truth for bucket sequence.** Slot computation, header reflow direction, and `commitDrop` all index into `BUCKET_ORDER`. Never hard-code the bucket sequence elsewhere.

**`flatIdx` counts rows only (not headers).** In drag slot math, `flatIdx` is a position in `allRows` (the result of `querySelectorAll('.row')`). It is used for row reflow comparisons. `indexInBucket` is a separate field used by `commitDrop` to determine fractional order within the target bucket. They are different things and must not be conflated.

**Pointer capture is used in both gesture modules.** In `gestures.ts`, `setPointerCapture` is called when horizontal intent is confirmed (entering `swipe` mode). In `startDrag`, it is called immediately on drag entry. Capture lets the handler receive pointermove and pointerup events even when the pointer leaves the element's bounds, which is essential for smooth swipes and drags near the screen edges.

**`contextmenu` is suppressed on all rows.** `row.addEventListener('contextmenu', (e) => e.preventDefault())` in `gestures.ts` prevents the browser's long-press context menu from appearing and competing with the long-press drag trigger on mobile.

**Haptic feedback pattern:** long-press start = 15ms; swipe crosses threshold = 10ms; swipe falls back below threshold = [3,3,3] (triple pulse). Haptics are always wrapped in try/catch because `navigator.vibrate` is not available on iOS.

**`allRows[target.flatIdx]` may not be in `target.bucket`.** When a bucket is empty, its slot's `flatIdx` equals the `flatCursor` value at that point, which also indexes the first row of the next non-empty bucket. Any code that uses `allRows[target.flatIdx]` to get layout info must guard with `allRows[target.flatIdx].closest('.bucket').dataset.bucket === target.bucket` before trusting the element. Use the bucket's `.empty-hint` rect instead when the check fails.

**`flatIdx` and `indexInBucket` are different coordinate systems and must not be conflated.** `flatIdx` is position in `allRows` (rows only, no headers) -- used for reflow range math. `indexInBucket` is position within a specific bucket's item list -- used by `commitDrop` for fractional order calculation. They diverge wherever empty buckets sit.

**The adjacent-slot case (`target.flatIdx === sourceFlatIdx + 1`) is its own branch, not a subset of "target below source."** It can span a bucket boundary and requires checking whether the adjacent row actually belongs to `target.bucket` before applying standard below-source math.
