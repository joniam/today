# Today - Design Spec

## Purpose

A single-list todo app for daily prioritization, inspired by Clear (Realmac Software). Optimized for one user (Jonathan), three fixed buckets (Today / Soon / Later), and sync to a markdown file in an Obsidian vault via GitHub.

Not a general purpose todo system. Not a competitor to Things, Todoist, OmniFocus. Deliberately scoped to one list, one purpose: what am I focused on today.

## Core principles

1. **Open to the list.** No splash, no auth flow after first run, no list picker. The list is the app.
2. **Direct manipulation.** Tap to edit, drag to reorder, swipe to complete. No edit modes, no buttons for primary actions.
3. **The markdown file is the source of truth.** Anything visible in the app must round-trip through the markdown file unchanged.
4. **Local-first.** Every interaction is instant. Sync is background work.
5. **Nothing deletes without user action.** Completed items persist until explicitly removed.

## Visual design

### Layout

Single scrolling column. Full width on mobile, max-width container centered on desktop (around 500px feels right, refine in build).

Top: the Today section header sits flush at the top (under the safe-area inset). No separate status bar in the chrome; sync status surfaces in the settings sheet only (see Phase 10 of the build plan).

Body: the list. Three buckets, each preceded by a sticky header (TODAY, SOON, LATER).

Bottom-right: floating circular button for settings. Subtle, doesn't dominate.

### The heat map

Each row has a background color drawn from a red-to-yellow gradient based on its absolute position in the visible list (counting across all three buckets).

- Position 0 (top of Today): most saturated red
- Last position (bottom of Later): yellow

The gradient runs continuously across all buckets in v1. Build this as a single function `colorForPosition(index, totalCount)` so changing the scheme later (e.g. reset per bucket, or only Today gets warm colors) is one function swap.

Bucket headers also participate in the gradient. The total count includes the three bucket headers plus all visible rows; each header occupies one position in the linear sequence right before its bucket's rows. This keeps the visible top-to-bottom progression monotonic: header / rows / header / rows / header / rows, all warming together.

Color values:
- Top: `hsl(0, 75%, 50%)` (red)
- Bottom: `hsl(50, 85%, 55%)` (yellow-gold)
- Interpolate in HSL for smooth perceptual transition.

Each row also has its own vertical mini-gradient (±5% lightness around the row's base color), a 1px inset top highlight (`rgba(255,255,255,0.09)`), and a 1px inset bottom shadow (`rgba(0,0,0,0.09)`). Together these create a slightly raised "tile" look in the style of the Clear app.

Row text: white, font-weight 700, slight negative letter-spacing, very subtle dark drop shadow (`0 1px 0 rgba(0,0,0,0.1)`) to keep readability on the lighter yellow rows.

### Completed items

Solid near-black background (`#0c0c0c`), opaque mid-grey text and strikethrough (`#6e6e6e`), 2px stroke with `text-decoration-skip-ink: none` so the line draws unbroken. Opaque grey (not low-alpha white) so the line and glyph layers don't compound where they overlap.

Completed items keep their position in the heat-map sequence for v1. Sorting them to the bottom is a deferred decision (see build plan).

### Typography

System font stack (no web fonts to load, fast).
```
-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif
```

Row text: 17px on mobile, 16px on desktop. Comfortable line height (1.4).

### Bucket headers

Each bucket is preceded by a sticky header. The header is a slim row showing the bucket name (TODAY, SOON, LATER) centered, uppercase, lightly tracked-out, bold. The header's background uses `colorForPosition` for its position in the gradient (see "The heat map"), so it reads as a labeled colored band that fits the warm sequence.

Headers use a flat fill (no per-row mini-gradient) so they read as labels rather than rows. A 2px inset bottom shadow gives a clear "header ends here" edge before the first row.

`position: sticky` so when scrolling past one bucket into the next, the relevant header pins to the top of the viewport. This is how the user always knows which bucket they're looking at without explicit visual chrome.

An empty bucket still renders its header (so the section remains identifiable), followed by a "Tap to add" hint row on the dark page background. The hint is the only tap-to-add target; the header itself is not interactive.

### Sync status indicator

No always-visible chrome for sync status in v1. The sync status surfaces in the settings sheet (see Phase 10 of the build plan): last sync time, last commit SHA, pending change count, force-sync button. Users assume sync is working unless something fails; the settings sheet is where you check.

Earlier drafts placed a small colored dot at the top of the screen. Removed: it was visual noise that drew attention to a passive system most of the time.

## Interactions

### Adding items

**Pull-down from the top of the list:** adds a new item to the top of the Today bucket. Rubber-band physics: as you pull, an empty input row reveals itself. Release at a sufficient pull distance commits; release short of that snaps back. The new row gets keyboard focus.

**Tap on an empty bucket area or its divider:** inserts a new editable row at the bottom of that bucket. Keyboard focuses.

**Tap on empty space below the last item in a bucket:** inserts new row at the bottom of that bucket.

No other "add" affordance. No + button.

### Editing items

**Tap on an item:** the item becomes editable inline. Cursor positions at the tap point. Tap outside or press return to commit. Empty after commit = no change (the row stays with its previous text). To delete, use swipe.

### Completing items

**Swipe right on a row:** completes (or un-completes) it. As you swipe, a check icon reveals from the left. Past a threshold (~40% of row width), releasing commits. Below threshold, snaps back. The row stays in place visually after completion (no auto-archive). Text gets strikethrough, colors mute.

Swipe right again on a completed item: un-completes.

### Deleting items

**Swipe left on a row:** reveals delete affordance from the right side. Past threshold, releasing commits the delete. Below threshold, snaps back.

When delete commits, the row animates out (collapses height to 0) and the items below slide up. No confirmation dialog. (We rely on the user's explicit gesture as confirmation. If we ever add undo, this is where it'd go.)

### Reordering and moving between buckets

**Long-press on a row (about 400ms):** the row "picks up" with a subtle scale-up and shadow. You can then drag it anywhere in the list, including across bucket dividers. Other items animate to make space.

When you drop the item:
- If dropped in the same bucket: just a reorder.
- If dropped in a different bucket: moved to that bucket at the drop position. The heat map color updates on settle.

Releasing without dragging just dismisses the lifted state.

### Scrolling

Standard scroll. The pull-down-to-add gesture is distinguished from scroll by direction at the top of the list: if you're at scroll position 0 and you pull down, it's an add gesture. If you've scrolled down and pull, it's just scroll.

### The settings button

Floating circular button, bottom-right, about 48px diameter. Semi-transparent so it doesn't dominate. Tap opens a bottom sheet.

Settings sheet contents:
- **Sync status.** Last sync time, last commit SHA, pending changes count if any. A "Force sync now" button.
- **Theme.** For v1, just light/dark (auto by default, follows system). Future: alternate color palettes.
- **Font size.** Small / medium / large.
- **Build info.** Version, build timestamp, commit SHA. Tap to copy.
- **Auth.** Where you paste/update the GitHub PAT. Shows partial token (last 4 chars) once set.
- **Data.** "Open data file in GitHub" link, "Export current state as markdown" button.

Tap outside the sheet or pull down to dismiss.

## Animations

Keep them snappy. 150-200ms for most transitions. Use CSS transforms (translateX, scale, opacity) for performance.

- Row swipe: follows finger 1:1, no easing during drag. On release, snap with a short cubic-bezier ease.
- Row completion: ~200ms transition on background-color, text-decoration, and opacity.
- Row deletion: row collapses height + opacity over ~250ms while siblings slide up.
- Long-press pickup: ~150ms scale to 1.03 + shadow fade-in.
- Drag: row follows finger directly, others reflow with 150ms ease.
- Pull-to-add: row reveal grows in height as you pull, no fixed animation (driven by gesture).
- Heat map color updates: 300ms transition when an item's index changes (so reordering looks alive).

## Empty states

Empty bucket: the bucket's sticky header still renders (so the section is identifiable), followed by a single muted italic "Tap to add" hint row. Tapping the hint inserts a new editable row in that bucket.

(Earlier drafts had a special "Pull down to add your first item" hint for an empty Today. Restoring that copy is a follow-up once Phase 5 pull-to-add lands.)

## What we are not building in v1

- Multiple lists (this app is for Today only).
- Reminders / due dates / times.
- Notifications.
- Sharing or multi-user.
- Search.
- Tags or categories beyond the three buckets.
- Subtasks.
- Attachments.
- Custom bucket names (yet).
- A light theme (v1 is dark only; cream page bg fought with the bold heat-map rows).
- Themes beyond the v1 dark palette.
- Sound effects.

## Markdown file format

Single file in the data repo: `today.md`.

```markdown
## Today
- [ ] Email Marco about onboarding doc
- [ ] Finish CycleWatch offline sync prototype
- [x] Coffee with Sarah

## Soon
- [ ] Book flights for July
- [ ] Review skincare progress photos

## Later
- [ ] Research router table options
- [ ] Plan workshop layout
```

Rules:
- Three H2 headers, exactly: `## Today`, `## Soon`, `## Later`. Always present even if a bucket is empty.
- Items are GitHub-flavored markdown task list items: `- [ ]` or `- [x]`.
- Order within a bucket is preserved verbatim.
- No other content in the file. If the user edits it in Obsidian and adds notes outside this structure, the app should preserve unknown content as best as possible (see tech spec for parser behavior).

## Edge cases the design must handle

- **Editing an item that's mid-swipe:** swipe wins until released.
- **Sync update arrives while editing:** local edit wins until committed. Show the conflict subtly (sync dot turns yellow, message in popover).
- **Two devices edit same item:** last write wins at the line level. See tech spec for the merge strategy.
- **Empty bucket on save:** preserved as `## Soon\n\n## Later` with empty bodies.
- **Very long item text:** wraps to multiple lines, row grows in height.
- **Pasted multi-line text into an item:** newlines stripped, single line item.
