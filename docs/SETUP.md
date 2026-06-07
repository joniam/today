# Today - Setup Instructions

Follow these steps in order. Should take about 30 minutes total. Most of it is GitHub clicking; the only fiddly bit is the launchd job.

---

## Step 0 (one-time, optional): Global git ignore

If you don't already have a global gitignore set up, do this once. It saves you from re-adding `.DS_Store` and editor junk to every project's `.gitignore`.

```bash
git config --global core.excludesfile ~/.gitignore_global

cat > ~/.gitignore_global << 'EOF'
# macOS
.DS_Store
.AppleDouble
.LSOverride

# Editor / IDE
.vscode/
.idea/
*.swp
*.swo
*~

# Misc
*.log
EOF
```

---

## Step 1: Create the GitHub repos (~3 minutes)

Go to github.com and create two new repos under your account (`joniam`):

1. **`today`** (public)
   - Don't initialize with README, .gitignore, or license. Just empty.
2. **`today-data`** (private)
   - Do NOT initialize with a README. Leave it empty. We want a clean repo with just `today.md` in it later.

---

## Step 2: Create a Personal Access Token (~2 minutes)

1. github.com → click your avatar → **Settings** → **Developer settings** → **Personal access tokens** → **Fine-grained tokens**.
2. Click **Generate new token**.
3. **Token name:** `today-app-data-access`
4. **Expiration:** 1 year out (or "No expiration" if visible).
5. **Resource owner:** `joniam`.
6. **Repository access:** **Only select repositories** → select `today-data`.
7. **Permissions** → **Repository permissions** → set **Contents: Read and write**. Leave all others as "No access".
8. Click **Generate token**. Copy it. Stash it in 1Password or similar. The app will hold the working copy once you paste it in on first run.

---

## Step 3: Clone the app repo locally (~1 minute)

```bash
mkdir -p ~/Developer
cd ~/Developer
git clone https://github.com/joniam/today.git
```

You should now have `~/Developer/today/`.

Note: we're not cloning `today-data` here. It only needs to live inside your Obsidian vault (Step 4), since the app talks to GitHub directly via API and doesn't need a local clone for development.

---

## Step 4: Put a copy of the data repo in your Obsidian vault (~3 minutes)

This is so Obsidian can see `today.md` as part of your vault.

Clone into your vault and rename the folder to `Today` for a nicer Obsidian sidebar entry:

```bash
cd /path/to/your/vault
git clone https://github.com/joniam/today-data.git Today
```

Since the repo was created empty, you'll get a warning that you cloned an empty repository. That's fine. We'll populate it in Step 9.

Once `today.md` exists (after Step 9), star it in Obsidian for visibility:

1. In Obsidian's file explorer, navigate to `Today/today.md`.
2. Right-click → **Add to bookmarks** (or **Star** on older Obsidian versions).
3. It'll appear in the Bookmarks pane in the left sidebar, regardless of folder depth.

If the Bookmarks pane isn't visible: enable it via Settings → Core plugins → Bookmarks.

### Note for later: iCloud + git interaction

If your vault is in iCloud (which it likely is if you sync Obsidian between Mac and iPhone), there's a known but rare class of issues where iCloud and git fight over the `.git` folder. Symptoms would show up as errors in `/tmp/today-sync.err` (see Step 5), or files showing as `.icloud` placeholders in Finder.

**For now, just be aware.** If things start misbehaving, the fix is the `.nosync` symlink trick on the `.git` folder, plus "Keep Downloaded" on the `Today` folder in Finder. Don't bother unless you actually see problems.

---

## Step 5: Set up the launchd job for auto-pull (~15 minutes)

This makes your Mac silently `git pull` the vault-side copy every 30 seconds so Obsidian sees fresh data from the app.

### Limitation to be aware of

This job only runs while your Mac is awake. If your Mac is asleep or closed, the vault won't update on either device. The app itself (PWA on phone) continues to work fine, talking directly to GitHub. But Obsidian's view of `today.md` will be stale until the laptop wakes and the job catches up.

For a daily-use todo list this is usually fine. The app is the source of truth on mobile; Obsidian is just a window into the data.

### Configure git identity

The sync script commits on your behalf, so git needs to know who you are. If you haven't already set this globally:

```bash
git config --global user.email "your@email.com"
git config --global user.name "Your Name"
```

### Create the script

The script is two-way: it commits and pushes any local Obsidian edits first, then pulls remote changes (from the app) down.

```bash
mkdir -p ~/bin
cat > ~/bin/today-sync.sh << 'EOF'
#!/bin/bash
# Two-way sync for the today-data repo inside the Obsidian vault.
# Edit the VAULT_DATA_REPO path below.

VAULT_DATA_REPO="/path/to/your/vault/Today"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

log "run started"
if ! cd "$VAULT_DATA_REPO"; then
    log "cd failed: $VAULT_DATA_REPO"
    exit 1
fi

# Push any local changes (Obsidian edits) up to GitHub first
if ! git diff --quiet || ! git diff --cached --quiet; then
    git add -A
    commit_out=$(git commit -m "obsidian edit @ $(date '+%Y-%m-%d %H:%M:%S')" 2>&1)
    log "commit: $commit_out"
    push_out=$(git push 2>&1)
    log "push: $push_out"
fi

# Pull any remote changes (app edits) down
output=$(git pull --rebase 2>&1)
log "pull: $output"
log "run finished"
EOF

chmod +x ~/bin/today-sync.sh
```

### Edit the path

Open the script in TextEdit and replace `/path/to/your/vault/Today` with the real path:

```bash
open -e ~/bin/today-sync.sh
```

If your vault is in iCloud, the path will look like:
`/Users/YOUR_USERNAME/Library/Mobile Documents/iCloud~md~obsidian/Documents/YOUR_VAULT_NAME/Today`

**TextEdit gotcha:** if TextEdit converts straight quotes (`"`) to curly quotes (`"`), the script will break. To prevent this: TextEdit menu → Edit → Substitutions → uncheck "Smart Quotes". Or use a real code editor (VS Code, etc.) if you have one.

Save (Cmd+S) and close.

### Test the script

```bash
~/bin/today-sync.sh
echo "Exit: $?"
```

Should print `Exit: 0`. The script writes to the log, not to stdout, so you won't see "run started" / "run finished" inline. Check the log:

```bash
cat /tmp/today-sync.log
```

You should see timestamped `run started` / `run finished` lines. If you see `cd failed`, the path in the script is wrong.

### Grant Full Disk Access to bash

This is critical for iCloud Drive paths. Without it, the script works when you run it manually but fails when launchd runs it, with errors like `fatal: Unable to read current working directory: Operation not permitted`.

1. Open **System Settings** → **Privacy & Security** → **Full Disk Access**.
2. Click the **+** button (unlock with password if prompted).
3. Press **Cmd+Shift+G** to "Go to Folder".
4. Type `/bin/bash` and press Return.
5. Click **Open**.
6. `/bin/bash` should appear in the list. Toggle it **on**.

Tradeoff note: this grants FDA to any bash script on your machine. On a single-user laptop, this is generally fine. If you want narrower access, it's possible but launchd jobs are finicky with narrower permissions.

### Create the LaunchAgent plist

```bash
cat > ~/Library/LaunchAgents/com.joniam.today-sync.plist << 'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.joniam.today-sync</string>
    <key>ProgramArguments</key>
    <array>
        <string>/Users/YOUR_MAC_USERNAME/bin/today-sync.sh</string>
    </array>
    <key>StartInterval</key>
    <integer>30</integer>
    <key>RunAtLoad</key>
    <true/>
    <key>StandardOutPath</key>
    <string>/tmp/today-sync.log</string>
    <key>StandardErrorPath</key>
    <string>/tmp/today-sync.err</string>
</dict>
</plist>
EOF
```

**Edit the plist** to replace `YOUR_MAC_USERNAME` with your actual macOS username. Run `whoami` if you're not sure.

### Load the job

```bash
launchctl load ~/Library/LaunchAgents/com.joniam.today-sync.plist
```

### Verify it's working

Clear the logs and watch fresh output:

```bash
> /tmp/today-sync.log
> /tmp/today-sync.err
tail -f /tmp/today-sync.log /tmp/today-sync.err
```

Within 30 seconds you should see:

```
[2026-05-12 14:23:01] run started
[2026-05-12 14:23:01] git: Already up to date.
[2026-05-12 14:23:01] run finished
```

Press Ctrl+C to exit `tail` once you've confirmed.

If you see `fatal: Unable to read current working directory: Operation not permitted`, Full Disk Access wasn't granted properly. Re-check the step above. Note that grants take effect on the next run, not retroactively; old error lines from before the grant are stale.

### Check if the job is loaded

```bash
launchctl list | grep today
```

Should print one line with the job name. If nothing prints, the job isn't loaded.

### To stop it later

```bash
launchctl unload ~/Library/LaunchAgents/com.joniam.today-sync.plist
```

### To restart after editing the plist

```bash
launchctl unload ~/Library/LaunchAgents/com.joniam.today-sync.plist
launchctl load ~/Library/LaunchAgents/com.joniam.today-sync.plist
```

(You don't need to reload after editing the shell script. Scripts are read fresh on each run. Only plist changes require reload.)

---

## Step 6: Safari Web Inspector setup (~5 minutes)

### On your iPhone

1. **Settings** → **Apps** → **Safari** → **Advanced** → toggle on **Web Inspector**.
   - On older iOS versions: **Settings** → **Safari** → **Advanced** → **Web Inspector**.

### On your Mac

1. Open Safari.
2. **Safari** menu → **Settings** → **Advanced** tab.
3. Toggle on **Show features for web developers** (or **Show Develop menu in menu bar** on older macOS).

### To use during development

1. Connect iPhone to Mac via USB.
   - First time: you may get a "Trust this computer?" prompt on the phone. Accept.
   - For wireless: in Finder, select the iPhone in the sidebar, go to the General tab, check "Show this iPhone when on Wi-Fi". Then USB is only needed for the first pairing.
2. On the iPhone, open Safari and load `https://joniam.github.io/today/` (the app, once deployed).
3. On the Mac, in Safari: **Develop** menu → **[Your iPhone's name]** → tap the app's URL.
4. A full devtools window opens. Console, network, DOM, sources, debugger, the works.

This works the same way once the app is installed as a PWA to the home screen: just open it on the phone, then look under Develop → iPhone → it'll be listed as a separate inspectable target.

---

## Step 7: Place the docs in the app repo

Copy these files into your local `today` repo:

```
today/
├── CLAUDE.md
└── docs/
    ├── SETUP.md
    ├── design-spec.md
    └── tech-spec.md
```

Commit and push:

```bash
cd ~/Developer/today
mkdir -p docs
# Copy the files into place
git add CLAUDE.md docs/
git commit -m "Add design spec, tech spec, setup guide, CLAUDE.md"
git push
```

---

## Step 8: Set up Claude Code in the app repo (~3 minutes)

```bash
cd ~/Developer/today
claude
```

(Or however you invoke Claude Code on your system.)

### Permissions to allow when prompted

Choose **"Always allow for this project"** for:

- File edits in the project directory
- Reading files
- `npm` commands (init, install, run)
- `git` commands (commit, push, pull, status, log, diff, branch operations)
- `node` execution

Optional, allow if you have them installed:

- `gh` CLI

**Do not** grant:

- Access outside the project directory
- Anything that touches system files

### Working with Claude Code

The app is already built. Use Claude Code for ongoing work: bug fixes, new features, or debugging. The specs in `docs/` are the source of truth for intent and architecture.

---

## Step 9: Create the initial `today.md` (~1 minute)

Before the app can sync, the data file needs to exist. Easiest way: create it via the GitHub website.

1. Go to `https://github.com/joniam/today-data`.
2. Click **Add file** → **Create new file**.
3. Filename: `today.md`
4. Content:

```markdown
## Today

## Soon

## Later
```

5. Commit directly to `main`.

The launchd job will pull this into your vault within 30 seconds. Once the app is built and you've configured auth, the app will pick it up too.

---

## What to do when you run into trouble

- **The launchd job isn't pulling.** Check `/tmp/today-sync.err` and `/tmp/today-sync.log` for errors.
  - `fatal: Unable to read current working directory: Operation not permitted` means Full Disk Access wasn't granted to `/bin/bash`. See Step 5.
  - `cd failed` means the path in the script is wrong.
  - Old errors persist in the log file even after fixing. Clear with `> /tmp/today-sync.log; > /tmp/today-sync.err` and watch for fresh entries with current timestamps.
- **Script logs `fatal: unable to auto-detect email address`.** Git identity not set. Run `git config --global user.email "your@email.com"` and `git config --global user.name "Your Name"`.
- **The script works manually but not via launchd.** Almost always Full Disk Access. macOS treats launchd-launched processes differently from your interactive shell. Granting FDA to `/bin/bash` fixes it.
- **TextEdit broke the script.** Smart quotes are the usual culprit. TextEdit menu → Edit → Substitutions → uncheck "Smart Quotes". Then re-edit the script.
- **Safari Web Inspector doesn't see the phone.** Make sure both Develop menu (Mac) and Web Inspector (phone) are toggled on. Unplug and replug USB. Trust prompt may need re-accepting.
- **Claude Code is asking permission for every command.** Look for a `/permissions` command or settings to bulk-approve project-scoped permissions.
- **The app says "auth failed".** PAT may have expired or have wrong scopes. Regenerate (Step 2) and paste the new one in via the app's settings sheet.
- **Obsidian on phone shows stale data.** This is expected when your laptop is asleep. The launchd job only runs when your Mac is awake. The app itself works fine regardless. See "Limitation to be aware of" in Step 5.

---

## Summary checklist

- [ ] Two GitHub repos created (`today` public, `today-data` private, no README in data repo)
- [ ] Fine-grained PAT generated and saved
- [ ] `today` cloned to `~/Developer/today`
- [ ] `today-data` cloned into Obsidian vault as `Today`
- [ ] Launchd script created with correct vault path
- [ ] Full Disk Access granted to `/bin/bash`
- [ ] Launchd job loaded, verified pulling with fresh timestamped log entries
- [ ] Safari Web Inspector enabled on iPhone and Mac
- [ ] Docs (CLAUDE.md, SETUP.md, design-spec.md, tech-spec.md) committed to the `today` repo
- [ ] Claude Code permissions granted for the `today` directory
- [ ] Initial `today.md` exists in the data repo with the three empty headers
- [ ] (Later) `today.md` starred in Obsidian for sidebar visibility

Once all checked, you're ready to start Phase 0.
