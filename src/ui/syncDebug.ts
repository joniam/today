import { getSyncLog } from '../sync/engine';
import { triggerInbound, triggerOutbound } from '../sync/engine';
import { state } from '../state';

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
  const backdrop = document.createElement('div');
  backdrop.className = 'sync-debug-backdrop';

  const sheet = document.createElement('div');
  sheet.className = 'sync-debug-sheet';

  const handle = document.createElement('div');
  handle.className = 'settings-sheet-handle';

  const title = document.createElement('div');
  title.className = 'settings-sheet-title';
  title.textContent = 'Sync Debug';

  const body = document.createElement('div');
  body.className = 'sync-debug-body';

  const syncBtn = document.createElement('button');
  syncBtn.type = 'button';
  syncBtn.className = 'auth-btn-primary';
  syncBtn.textContent = 'Sync Now';
  syncBtn.addEventListener('click', () => {
    triggerInbound();
    triggerOutbound();
    refresh();
  });

  sheet.appendChild(handle);
  sheet.appendChild(title);
  sheet.appendChild(body);
  sheet.appendChild(syncBtn);
  backdrop.appendChild(sheet);
  mount.appendChild(backdrop);

  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) backdrop.classList.remove('open');
  });

  function refresh(): void {
    body.replaceChildren(buildBody());
  }

  return () => {
    refresh();
    backdrop.classList.add('open');
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

  // Event log section
  const log = getSyncLog();
  const logSection = buildSection(`Recent events (${log.length})`);
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
