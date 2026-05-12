# Today - Technical Spec

## Stack

- **Language:** TypeScript
- **Build:** Vite
- **Deploy:** GitHub Actions to GitHub Pages
- **Framework:** None. Vanilla TS with small custom rendering. No React, no Vue. Direct DOM manipulation is plenty for this scope and easier to reason about for gesture handling.
- **Storage local:** IndexedDB (via the `idb` library wrapper)
- **Storage remote:** GitHub Contents API on a private data repo
- **PWA:** Web manifest + service worker for offline + update prompts

## Repos

- `today` (public, owner: `joniam`): the PWA. Source on `main`. GitHub Pages serves from `gh-pages` branch (built by Action).
- `today-data` (private, owner: `joniam`): contains `today.md`. Cloned into Obsidian vault separately.

App URL: `https://joniam.github.io/today/`

## Project structure

```
today/
├── .github/workflows/deploy.yml
├── public/
│   ├── manifest.webmanifest
│   ├── icon-192.png
│   ├── icon-512.png
│   └── apple-touch-icon.png
├── src/
│   ├── main.ts              # entry, app bootstrap
│   ├── state.ts             # in-memory state, mutations
│   ├── render.ts            # DOM rendering, diffing
│   ├── gestures.ts          # swipe, drag, long-press, pull
│   ├── sync/
│   │   ├── github.ts        # GitHub API client
│   │   ├── parser.ts        # markdown to/from state
│   │   ├── engine.ts        # sync loop, conflict resolution
│   │   └── storage.ts       # IndexedDB persistence
│   ├── ui/
│   │   ├── settings.ts      # settings sheet
│   │   ├── statusDot.ts     # sync status indicator
│   │   └── colors.ts        # heat map color function
│   ├── types.ts
│   └── styles.css
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
└── CLAUDE.md
```

## Data model

```typescript
type Bucket = 'today' | 'soon' | 'later';

interface Item {
  id: string;           // ULID, generated on creation
  text: string;
  done: boolean;
  bucket: Bucket;
  order: number;        // float, for cheap reordering (a la Figma)
}

interface AppState {
  items: Item[];
  lastSyncedSha: string | null;   // sha of the file as last seen on remote
  lastSyncedAt: number | null;    // ms epoch
  pendingChanges: boolean;
  authToken: string | null;       // GitHub PAT
  dataRepo: { owner: string; repo: string; path: string };
}
```

The `order` field uses fractional indexing: when inserting between items with order 1.0 and 2.0, the new item gets order 1.5. Avoids re-numbering on every reorder.

## Markdown parsing

Parse strategy: line-by-line state machine.

```
state: 'before-today' | 'today' | 'soon' | 'later'
```

- Line matches `^## Today\s*$`: state = 'today'
- Line matches `^## Soon\s*$`: state = 'soon'
- Line matches `^## Later\s*$`: state = 'later'
- Line matches `^- \[([ xX])\] (.*)$` and state is a bucket: create Item with `done = (group1 !== ' ')`, `text = group2`, `bucket = state`, `order = next available`.
- Other lines: ignored on parse, but see "unknown content preservation" below.

Serialize strategy:
- Always emit three sections in order: Today, Soon, Later.
- Items within a section in `order` ascending.
- Done items rendered as `- [x] text`, undone as `- [ ] text`.
- Trailing newline after each section.

**ID persistence:** Markdown has no place to store IDs. So IDs are local-only and assigned on parse by content+position heuristics. When syncing, we match items by `(bucket, normalized_text, done)` against the local set; if exact match, keep the local ID. If not, generate a new ID. This means an item edited externally may get a new ID, which is fine, the user never sees IDs.

**Unknown content preservation (v1 decision):** Don't try. The file is owned by the app. If Jonathan edits it in Obsidian, he edits the structure as defined. If he adds free-form notes, they'll be dropped on next app save. Documented in setup notes. (Future: store unknown lines in a side file or in a YAML frontmatter block.)

## Sync engine

### High level

Local state is authoritative for the in-flight session. Remote state is authoritative across sessions and devices. The sync engine reconciles them.

### Triggers for outbound sync (local to remote)

- Any state mutation that changes the markdown representation (add, edit text, toggle done, reorder, move bucket, delete).
- Debounced: 1500ms after last change. Reset timer on each new change.
- Force sync from settings UI.

### Triggers for inbound sync (remote to local)

- App start.
- Tab/app gains focus (`visibilitychange` to visible).
- After successful outbound sync (to fetch new SHA).
- Periodic poll while app is foregrounded: every 30s.
- Manual trigger from settings.

### Outbound algorithm

```
1. Serialize current state to markdown.
2. If markdown unchanged since last successful sync, return.
3. Fetch current file from GitHub (GET /repos/.../contents/today.md).
   This returns content and sha.
4. If returned sha == lastSyncedSha:
     No remote changes. PUT with new content and lastSyncedSha.
     On success, update lastSyncedSha.
5. If returned sha != lastSyncedSha:
     Remote changed. Run merge (see below).
     After merge, PUT merged content with the new returned sha.
     On 409 conflict, restart from step 3 (with cap of 3 retries).
6. On network error: keep pendingChanges=true, retry on next trigger.
```

### Inbound algorithm

```
1. GET file from GitHub.
2. If sha == lastSyncedSha: nothing to do.
3. Parse remote markdown to items.
4. If no local pending changes: replace local state, update lastSyncedSha.
5. If local pending changes exist: run merge (see below).
```

### Merge strategy

Three-way merge on items. We have:
- `base`: state at lastSyncedSha (we persist this in IndexedDB after each sync)
- `local`: current in-memory state
- `remote`: parsed from just-fetched file

For each item identified by `(bucket, normalized_text)` matching across the three sets:
- If item in base but not in remote: remote deleted it. If local hasn't changed it, accept delete. If local changed it, keep local (resurrection).
- If item in base but not in local: local deleted it. If remote hasn't changed it, accept delete. If remote changed it, keep remote (resurrection).
- If item in remote but not in base: remote added. Add to local.
- If item in local but not in base: local added. Keep local.
- If item changed in both: prefer local (we're the active editor). Log this for debugging.

Order: when both sides have the same items but different orders, prefer local order.

This is a "local wins on conflict" strategy because the app is the active editor; passive Obsidian edits rarely race with active app edits.

### Storage of base state

After every successful sync, persist the items array and `lastSyncedSha` to IndexedDB. On app start, load from IndexedDB before fetching remote. This makes startup instant and enables offline.

## GitHub API integration

Two endpoints used:
- `GET /repos/{owner}/{repo}/contents/{path}` returns `{ content, sha }`. Content is base64-encoded.
- `PUT /repos/{owner}/{repo}/contents/{path}` body `{ message, content, sha }`. Returns new sha.

Headers: `Authorization: Bearer {pat}`, `Accept: application/vnd.github+json`, `X-GitHub-Api-Version: 2022-11-28`.

Commit messages: `update from today app @ {ISO timestamp}`.

Rate limits: 5000 requests/hour authenticated. We're well under.

### PAT storage

Store in IndexedDB. Never in localStorage (slightly less safe). Never sent anywhere except api.github.com.

First run: app shows a setup screen asking for repo owner, repo name, file path (default `today.md`), and PAT. Validate by making one GET request. On success, save and proceed.

## Service worker / PWA

- Web manifest: name "Today", short_name "Today", icons, start_url "/", display "standalone", theme_color matching the warm palette, background_color similar.
- Service worker: cache-first for app shell (HTML, JS, CSS, icons). Network-first (with fast timeout) for the GitHub API (never cached).
- Update detection: on service worker `controllerchange`, show a small banner "New version available, tap to reload."
- Build version: injected at build time via Vite define plugin from git SHA + timestamp. Visible in settings sheet.

## Gestures implementation

No library. Custom pointer event handling.

### Swipe (horizontal)

- `pointerdown` on a row: record startX, startY, startTime. Capture pointer.
- `pointermove`: compute dx, dy. If `|dy| > |dx|` and `|dy| > 8`, it's a scroll, release pointer capture and stop tracking. Otherwise, set `translateX = dx` (with rubber-band resistance past row width).
- `pointerup`: if `|dx| > threshold` (say 40% of row width), commit (complete on right swipe, delete on left). Otherwise snap back.

### Long-press + drag

- `pointerdown`: start a 400ms timer.
- If `pointermove` exceeds 8px before timer fires: cancel timer (it's a swipe or scroll).
- If timer fires: enter drag mode. Scale row to 1.03, add shadow. Track pointer movement, translate row to follow. Determine which slot the row is currently over and animate other rows to make space.
- `pointerup` in drag mode: commit drop. Snap to slot. Update state (order, possibly bucket).

### Pull to add

- Only active when scroll position is 0 and pointer down was at the top of the list.
- `pointerdown` near top: record startY.
- `pointermove`: if dy > 0 (pulling down) and at scroll 0, prevent default scroll. Show empty row growing in height proportional to pull distance.
- `pointerup`: if pulled past threshold (~60px), commit (insert new row at top of Today, focus input). Otherwise snap back.

### Tap

- `pointerup` with minimal movement and short duration: treat as tap. If on a row, enter edit mode. If on an empty bucket area, insert + focus new row.

## Rendering

Direct DOM. On state change:
1. Compute the diff between rendered DOM and target state.
2. Apply: create new row elements for added items, remove DOM for deleted items, update text/class for changed items, reorder via DOM moves for changed positions.

For a list of this size (typically <50 items), full re-render on every change is also fine and simpler. Start with full re-render, optimize only if jank shows up. Use `requestAnimationFrame` to batch.

The heat map color is computed during render based on each item's index in the flattened visible order.

## Build and deploy

### Vite config

Base path: `/today/` (matches GitHub Pages URL).

Define plugin injects:
- `__BUILD_SHA__`: short git SHA at build time
- `__BUILD_TIME__`: ISO timestamp

### GitHub Action (`deploy.yml`)

Triggered on push to `main`. Steps:
1. Checkout (with full git history so we can read SHA)
2. Setup Node 20
3. `npm ci`
4. `npm run build`
5. Deploy `dist/` to `gh-pages` branch via `peaceiris/actions-gh-pages`

### Settings repo on GitHub Pages

In repo Settings to Pages, source = `gh-pages` branch, `/` root. URL becomes `https://joniam.github.io/today/`.

## Safari Web Inspector setup

Documented as part of setup instructions (separate doc). Summary: enable Web Inspector on iPhone (Settings to Safari to Advanced), enable Develop menu on Mac Safari (Safari to Settings to Advanced), connect phone via USB or Wi-Fi pairing, inspect from Mac.

## Open technical questions

None blocking. Items to revisit:
- Whether to add a soft delete / archive instead of hard delete after some user feedback.
- Whether to add a daily rollover (auto-archive completed items end of day).
- Whether to add YAML frontmatter to the markdown file for richer metadata.

These are future considerations, not v1.
