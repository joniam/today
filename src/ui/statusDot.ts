export type SyncStatus = 'fresh' | 'syncing' | 'ok' | 'error' | 'update';

let currentStatus: SyncStatus = 'fresh';

export function getSyncStatus(): SyncStatus {
  return currentStatus;
}

export function setSyncStatus(status: SyncStatus): void {
  // 'update' is sticky: it signals "you need to reload to get a new version" and
  // must keep pulsing until the user actually updates (which reloads the page and
  // resets currentStatus). Sync cycles must not overwrite it.
  if (currentStatus === 'update' && status !== 'update') return;
  currentStatus = status;
  // Update the dot in the DOM directly so it reflects immediately without a full re-render.
  const el = document.querySelector<HTMLElement>('.status-dot');
  if (el) el.dataset.status = status;
}
