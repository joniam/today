import { clearAuth, state } from '../state';
import { getSyncLog, triggerInbound, triggerOutbound } from '../sync/engine';

function timeAgo(ts: number): string {
  const d = Date.now() - ts;
  if (d < 60_000) return `${Math.round(d / 1000)}s ago`;
  if (d < 3_600_000) return `${Math.floor(d / 60_000)}m ago`;
  return `${Math.floor(d / 3_600_000)}h ago`;
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function initSyncDebug(mount: HTMLElement): () => void {
  const themeColorMeta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  const defaultThemeColor = themeColorMeta?.getAttribute('content') ?? '#c0392b';

  const backdrop = document.createElement('div');
  backdrop.className = 'sync-debug-backdrop';

  const sheet = document.createElement('div');
  sheet.className = 'sync-debug-sheet';

  // Header row: title + close button
  const header = document.createElement('div');
  header.className = 'sync-debug-header';

  const title = document.createElement('div');
  title.className = 'settings-sheet-title';
  title.textContent = 'Status';

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'sync-debug-close';
  closeBtn.textContent = '×';
  closeBtn.setAttribute('aria-label', 'Close');
  closeBtn.addEventListener('click', close);

  header.appendChild(title);
  header.appendChild(closeBtn);

  const body = document.createElement('div');
  body.className = 'sync-debug-body';

  // Actions row: Sync Now + Disconnect side by side.
  // When disconnect is armed, syncBtn becomes Cancel and disconnectBtn becomes Confirm.
  const actionsRow = document.createElement('div');
  actionsRow.className = 'sync-debug-actions';

  let disconnectArmed = false;

  function armDisconnect(): void {
    disconnectArmed = true;
    syncBtn.textContent = 'Cancel';
    syncBtn.className = 'auth-btn-secondary';
    disconnectBtn.textContent = 'Confirm';
    disconnectBtn.className = 'auth-btn-danger';
  }

  function resetDisconnect(): void {
    disconnectArmed = false;
    syncBtn.textContent = 'Sync Now';
    syncBtn.className = 'auth-btn-primary';
    disconnectBtn.textContent = 'Disconnect';
    disconnectBtn.className = 'auth-btn-secondary';
  }

  const syncBtn = document.createElement('button');
  syncBtn.type = 'button';
  syncBtn.className = 'auth-btn-primary';
  syncBtn.textContent = 'Sync Now';
  syncBtn.addEventListener('click', () => {
    if (disconnectArmed) { resetDisconnect(); return; }
    triggerInbound();
    triggerOutbound();
    // Refresh after the sync has had time to complete (outbound debounce is 1500ms + round trip)
    setTimeout(refresh, 3500);
  });

  const disconnectBtn = document.createElement('button');
  disconnectBtn.type = 'button';
  disconnectBtn.className = 'auth-btn-secondary';
  disconnectBtn.textContent = 'Disconnect';
  disconnectBtn.addEventListener('click', () => {
    if (!disconnectArmed) { armDisconnect(); } else { clearAuth(); resetDisconnect(); close(); }
  });

  actionsRow.appendChild(syncBtn);
  actionsRow.appendChild(disconnectBtn);

  sheet.appendChild(header);
  sheet.appendChild(body);
  sheet.appendChild(actionsRow);
  backdrop.appendChild(sheet);
  mount.appendChild(backdrop);

  // Block all touch/pointer events from reaching the list.
  // Applied to both backdrop AND sheet — belt-and-suspenders.
  for (const el of [backdrop, sheet]) {
    el.addEventListener('pointerdown', (e) => e.stopPropagation());
    el.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true });
    el.addEventListener('touchend', (e) => e.stopPropagation(), { passive: true });
    el.addEventListener('touchcancel', (e) => e.stopPropagation(), { passive: true });
  }
  // touchmove must be non-passive to call preventDefault and stop rubber-banding.
  // Only prevent default outside the scrollable body so body content can still scroll.
  for (const el of [backdrop, sheet]) {
    el.addEventListener('touchmove', (e) => {
      e.stopPropagation();
      if (!body.contains(e.target as Node)) e.preventDefault();
    }, { passive: false });
  }

  backdrop.addEventListener('click', (e) => {
    e.stopPropagation();
    if (e.target === backdrop) { resetDisconnect(); close(); }
  });

  let refreshInterval: ReturnType<typeof setInterval> | null = null;

  function close(): void {
    backdrop.classList.remove('open');
    if (refreshInterval !== null) { clearInterval(refreshInterval); refreshInterval = null; }
    if (themeColorMeta) themeColorMeta.setAttribute('content', defaultThemeColor);
  }

  function refresh(): void {
    const scrollTop = body.scrollTop;
    body.replaceChildren(buildBody());
    body.scrollTop = scrollTop;
  }

  return () => {
    resetDisconnect();
    refresh();
    backdrop.classList.add('open');
    refreshInterval = setInterval(refresh, 2000);
    if (themeColorMeta) themeColorMeta.setAttribute('content', '#0a0a0a');
  };
}

function buildBody(): DocumentFragment {
  const frag = document.createDocumentFragment();

  // Connection section
  const connSection = buildSection('Connection');
  const { owner, repo, path } = state.dataRepo;
  if (owner) {
    connSection.appendChild(buildRow('Repo', `${owner}/${repo}`));
    connSection.appendChild(buildRow('Path', path || 'today.md'));
  } else {
    connSection.appendChild(buildRow('Status', 'Not configured'));
  }
  frag.appendChild(connSection);

  // State section
  const stateSection = buildSection('State');
  const totalItems = state.items.length;
  const activeItems = state.items.filter((i) => !i.done).length;
  stateSection.appendChild(buildRow('Items', `${activeItems} active, ${totalItems - activeItems} done`));
  stateSection.appendChild(buildRow('Pending', state.pendingChanges ? 'yes' : 'no'));
  if (state.lastSyncedAt !== null) {
    stateSection.appendChild(buildRow('Last sync', `${formatTime(state.lastSyncedAt)} (${timeAgo(state.lastSyncedAt)})`));
  } else {
    stateSection.appendChild(buildRow('Last sync', 'never'));
  }
  if (state.lastSyncedSha) {
    stateSection.appendChild(buildRow('SHA', state.lastSyncedSha.slice(0, 7)));
  }
  frag.appendChild(stateSection);

  // Build info
  const buildSect = buildSection('Build');
  const built = new Date(__BUILD_TIME__);
  const dateStr = built.toLocaleDateString([], { month: 'short', day: 'numeric' });
  const timeStr = built.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  buildSect.appendChild(buildRow('Version', `${__BUILD_SHA__} · ${dateStr} ${timeStr}`));
  frag.appendChild(buildSect);

  // Event log — capped at 5 most recent
  const log = getSyncLog().slice(0, 5);
  const logSection = buildSection('Recent events');
  if (log.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'sync-debug-empty';
    empty.textContent = 'No events yet';
    logSection.appendChild(empty);
  } else {
    const eventList = document.createElement('div');
    eventList.className = 'sync-debug-events';
    for (const ev of log) {
      const row = document.createElement('div');
      row.className = `sync-debug-event sync-debug-event--${ev.outcome}`;

      const meta = document.createElement('span');
      meta.className = 'sync-debug-event-meta';
      meta.textContent = `${ev.type} · ${ev.outcome} · ${timeAgo(ev.ts)}`;

      const detail = document.createElement('span');
      detail.className = 'sync-debug-event-detail';
      detail.textContent = ev.detail;

      row.appendChild(meta);
      row.appendChild(detail);
      eventList.appendChild(row);
    }
    logSection.appendChild(eventList);
  }
  frag.appendChild(logSection);

  return frag;
}

function buildSection(label: string): HTMLElement {
  const section = document.createElement('div');
  section.className = 'sync-debug-section';

  const heading = document.createElement('div');
  heading.className = 'sync-debug-section-label';
  heading.textContent = label;

  section.appendChild(heading);
  return section;
}

function buildRow(label: string, value: string): HTMLElement {
  const row = document.createElement('div');
  row.className = 'sync-debug-row';

  const k = document.createElement('span');
  k.className = 'sync-debug-row-key';
  k.textContent = label;

  const v = document.createElement('span');
  v.className = 'sync-debug-row-value';
  v.textContent = value;

  row.appendChild(k);
  row.appendChild(v);
  return row;
}
