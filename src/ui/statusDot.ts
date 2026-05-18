export type SyncStatus = 'fresh' | 'syncing' | 'ok' | 'error' | 'update';

let currentStatus: SyncStatus = 'fresh';

export function getSyncStatus(): SyncStatus {
  return currentStatus;
}

export function setSyncStatus(status: SyncStatus): void {
  currentStatus = status;
  // Update the dot in the DOM directly so it reflects immediately without a full re-render.
  const el = document.querySelector<HTMLElement>('.status-dot');
  if (el) el.dataset.status = status;
}
