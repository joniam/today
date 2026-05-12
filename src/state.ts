import type { AppState } from './types';

export const state: AppState = {
  items: [],
  lastSyncedSha: null,
  lastSyncedAt: null,
  pendingChanges: false,
  authToken: null,
  dataRepo: { owner: '', repo: '', path: 'today.md' },
};
