# Today - Future Considerations

This doc captures features and architectural directions explored during v1 planning but deliberately deferred. Use this as the input when prioritizing v2+ work after living with v1 for a few weeks.

## Guiding principle

Don't act on anything here until v1 has been in daily use for at least a few weeks. The point of v1 is to discover what's actually missing through real usage, not to speculate about it.

Re-evaluate quarterly. Some of these will feel essential. Others will feel like overhead you don't want. Some new ideas not listed here will emerge.

---

## Feature roadmap

### v1.1: Stable IDs

**Why:** Prerequisite for nearly everything below. Currently items are matched by `(bucket, normalized_text)`, which breaks the moment metadata gets attached or an item gets renamed.

**Approach:** Store ULIDs in HTML comments after the task text:

```markdown
- [ ] Email Marco about onboarding doc <!-- t01HQX4K2 -->
```

HTML comments don't render in Obsidian's reading mode. They're visible in source mode but unobtrusive. The app strips them on display and adds them on save.

**Migration:** First app save after upgrade assigns IDs to all existing items. Cost: one commit. Backward-compatible with raw markdown editing in Obsidian (just don't strip the comments).

### v1.2: Inline time-estimate metadata

**Why:** A task list by itself doesn't tell you whether your day is realistic. Time estimates + a roll-up at the top do.

**Approach:** Inline suffix syntax:

```markdown
- [ ] Email Marco {30m} <!-- t01HQX4K2 -->
- [ ] Finish CycleWatch offline sync {2h}
```

App parses and renders estimate as a badge or muted text. Header shows roll-up: "Today: 3h 45m planned". Obsidian shows raw text, which is readable.

No AI involved in this phase. Just the data model and UI.

### v1.3: PWA-side time estimation via LLM

**Why:** Manually estimating every task is overhead. An LLM can suggest reasonable estimates from the task text.

**Approach:** When user adds a new task, app calls an LLM API (Anthropic or OpenAI) with the task text and asks for a duration estimate. User accepts or edits. API key stored locally, like the GitHub PAT.

**Concerns:** API costs are trivial (single-user, small prompts) but real. Privacy: task text goes to a third party. Documented and opt-in via settings.

### v2.0: GitHub Action for daily processing

**Why:** Some processing genuinely benefits from running on a schedule without requiring the app or laptop to be active. Daily rollover, graveyard suggestions, agent-driven cleanup.

**Approach:** GitHub Action in the `today-data` repo, cron-scheduled (e.g., 6 AM daily). Reads the markdown, applies rules:

- Increment punt counters for items that rolled from Today to Soon, or Soon to Later, without being completed
- Suggest graveyard candidates (e.g., items punted 3+ times)
- Optionally call an LLM for analysis ("which items look stale?")
- Write results back to a `today.md` or to a sidecar `meta.json`
- Commit with a clear message

Free tier of GitHub Actions covers this easily (2000 minutes/month, we'd use a few minutes/day).

**Concerns:** Conflict risk between the agent's commit and a user's in-flight app edit. Mitigation: agent only runs at a time the user is unlikely to be editing (early AM), and uses the same merge strategy as the app.

### v2.1: Calendar integration

**Why:** "Will I actually accomplish what I plan today?" requires comparing planned time vs. available calendar time.

**Approach:** PWA-side OAuth to Google Calendar. Triggered on demand from settings sheet: "Fit check". Pulls today's events, computes free time, compares to roll-up of task estimates. Result: "You have 4h 30m free; planned 6h 15m. Suggest moving 2 items to Soon."

OAuth in a PWA is doable but involves a redirect dance. Tokens stored locally.

**Concerns:** Google's OAuth requires app verification for production use. For a single-user app, we can run in "Testing" mode indefinitely with our user account whitelisted.

### v2.2: Notes attached to tasks

**Why:** Some tasks need a paragraph of context, not just a line.

**Approach:** Wikilink syntax in markdown, pointing to a separate vault note:

```markdown
- [ ] Email Marco about onboarding doc ↗ [[task-notes/t01HQX4K2]]
```

The `↗` is the app's visual indicator that notes exist. Tap the task in the app to reveal notes inline. App reads/writes the linked note via GitHub.

**Concerns:** Sync engine becomes multi-file. The "atomic commit" property weakens (notes and task list could go out of sync briefly). Manageable but real.

### v2.3: Graveyard

**Why:** Aspirational tasks that never get done shouldn't stay visible forever.

**Approach:** When v2.0 punt counter exceeds threshold (default 3), the daily Action moves the item to a `graveyard.md` in the data repo. The app shows graveyard contents in a separate view (accessible from settings). User can resurrect items or delete permanently.

Depends on v2.0 (punt counters) being in place.

---

## Architectural alternatives considered

Before adding more features, we considered whether the current architecture (PWA + GitHub + markdown + launchd pull to Obsidian) was the right foundation for v2.

### The current architecture's strengths

- Trivial backend (GitHub is the backend)
- Data is human-readable markdown, owned by user
- Obsidian integration is "free" (just file format compatibility)
- Vibe-coding friendly (single-language, no compilation)
- Local-first by default
- Zero infrastructure to maintain

### The current architecture's limits

These come into play only for specific features:

- **Real-time multi-device sync:** GitHub's polling-based sync is fine for single user. Adding multi-user (e.g., sharing a list with someone) would strain it.
- **Reliable iOS push notifications:** PWAs on iOS have flaky web push support.
- **Native iOS features:** widgets, Shortcuts, Siri, share sheet are unreachable.
- **Always-on scheduled processing:** GitHub Actions works for daily jobs but isn't true always-on (5-minute cron minimum, occasional missed runs).
- **Rich data model with relationships:** markdown is bad at metadata. Sidecar files work but add complexity.

### The "proper" alternative architecture

If we re-architected, it would look like:

- **Backend:** Cloudflare Worker or Fly.io app, with Turso (SQLite) or Supabase (Postgres). Free tiers cover single-user use.
- **Frontend:** Native iOS app (Swift/SwiftUI). Optional web client for desktop.
- **Obsidian:** receives markdown projections of the data via an export, OR an Obsidian plugin reads from the backend API. Vault becomes a viewer, not the source of truth.
- **Agent:** runs server-side, has clean access to DB and external APIs. No git in the runtime path.

### Why we're NOT re-architecting (yet)

1. **Cost of being wrong about v2.** Building the proper architecture is months of work for a single user. If v2 features turn out to be overhead we don't want, that work is wasted.
2. **Most v2 features don't require re-architecture.** Time estimates, calendar comparison, punt counters, notes, and daily processing all reachable from the current architecture, less elegantly but viably.
3. **Vibe-coding loop is faster with the current stack.** Native iOS + backend has a higher floor for "get something working." We'd lose pace.
4. **Obsidian-as-source-of-truth narrative weakens.** In the current architecture, the markdown file IS your data. In the backend architecture, the markdown is a projection. Less satisfying conceptually.

### When to re-architect

Trigger criteria: re-architect when we want a specific feature that the current architecture genuinely cannot deliver. Examples:

- Sharing lists with another person in real time
- Reliable iOS push notifications
- Native widgets, Siri integration, or Shortcuts
- A scheduled agent more sophisticated than what GitHub Actions can run
- Cross-list relationship queries

Until one of those is on the table, the current architecture is the right tool. When one IS on the table, we re-architect with eyes open and real requirements, not speculation.

---

## Things considered and rejected (for now)

- **Custom Obsidian plugin as primary processing layer.** Only runs when Obsidian is open. Mobile plugin support is limited. Doesn't help the PWA. Could be valuable later as an Obsidian-side viewer/dashboard, but not as the processing engine.
- **Capacitor/Tauri to wrap the PWA as native.** Buys iOS filesystem access and some native features, but the dev loop becomes Xcode + signing + TestFlight. Loses the push-and-refresh workflow. Defer until a feature genuinely requires native APIs.
- **Always-on Raspberry Pi or VPS for sync.** Removes the "laptop must be awake" limitation but adds a piece of infrastructure to maintain. Not worth it for the current scope.
- **Obsidian Sync (paid) instead of git.** Would work for vault sync but doesn't help the app. The app needs an API-accessible source of truth, which Obsidian Sync doesn't expose.

---

## Tooling for working with the list via Claude

Two complementary pieces, both deferred until v1 is stable:

### A Today skill (reactive)

A `SKILL.md` file that teaches Claude how to read and edit the Today list correctly. Lives in the `today-data` repo at `.claude/skills/today/SKILL.md` so it travels with the data.

Contents: file location, current format (sections, item syntax, metadata conventions), common operations (add/complete/move/reorder), and explicit DO-NOTs (no extra sections, no frontmatter, don't reformat existing items, don't delete completed without permission).

Activates when you ask Claude (in Claude Code or any environment with file access) to do something with the list. Use cases:

- "Create new todos based on these meeting notes"
- "How many hours of tasks do I have today?"
- "Which Today items look stale?"
- "Move everything I haven't touched in a week to Later"

Don't write this until the format stabilizes (post-v1.2 at earliest). Writing it earlier means rewriting it as IDs and metadata get added.

### A scheduled agent (proactive)

This is v2.0 in the roadmap above. A GitHub Action that runs daily, reads the file, applies rules, optionally calls an LLM, and commits results back. Does work without being asked.

Use cases:

- Increment punt counters when items roll over without completion
- Surface graveyard candidates
- Daily summary of what got done vs. planned

### How they relate

The skill is documentation Claude reads when you invoke it. The agent is code that runs on a schedule. Both reference the same file format. Build the agent first (v2.0); write the skill when you've used the format long enough to know it's not going to change much.

---

## How to use this doc

When v1 is in daily use and you start feeling friction:

1. Identify the specific friction. "I keep wanting X" or "Y is annoying."
2. Find the matching feature here, OR add a new one if it's not listed.
3. Evaluate against the "re-architect criteria" above. Most things won't trigger it.
4. Pick the smallest version of the feature that scratches the itch.
5. Build it. Use it. Re-evaluate.

Don't batch features. Don't speculate ahead. Don't pre-build for hypothetical needs.
