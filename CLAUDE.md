# Today - Project Context for Claude Code

This is `today`, a single-list PWA todo app inspired by Clear, built for Jonathan's daily prioritization workflow. Data lives in a separate private GitHub repo as a markdown file, also synced to an Obsidian vault.

## Read these first, in order

1. `docs/design-spec.md` - what the app looks and feels like
2. `docs/tech-spec.md` - how it's built, data model, sync algorithm
3. `docs/build-plan.md` - phased plan you're executing

(`docs/SETUP.md` exists for human reference, environment setup. Not needed for executing the build.)

## Working agreement

- Execute one phase at a time. After each phase, stop and report what you did so Jonathan can verify.
- Make small commits with clear messages.
- Don't add dependencies beyond what's listed in the tech spec without flagging it.
- Don't change the markdown file format. It's an interop contract with Obsidian.
- The data repo is `today-data` (private, owner joniam). The app repo is this one (`today`, public, owner joniam).
- Never log or commit the GitHub PAT.

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
