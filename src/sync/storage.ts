import { openDB, type IDBPDatabase } from 'idb';
import type { AppState } from '../types';
import { state } from '../state';

const DB_NAME = 'today-app';
const DB_VERSION = 1;
const STORE = 'app-state';
const RECORD_ID = 'app';

type TodayDB = {
  'app-state': {
    key: string;
    value: AppState & { id: string };
  };
};

let db: IDBPDatabase<TodayDB> | null = null;

async function getDB(): Promise<IDBPDatabase<TodayDB>> {
  if (!db) {
    db = await openDB<TodayDB>(DB_NAME, DB_VERSION, {
      upgrade(database) {
        database.createObjectStore(STORE, { keyPath: 'id' });
      },
    });
  }
  return db;
}

export async function loadState(): Promise<void> {
  const database = await getDB();
  const saved = await database.get(STORE, RECORD_ID);
  if (saved) {
    // Apply saved fields onto the existing state object so subscribers stay intact.
    state.items = saved.items;
    // baseItems was added in Phase 9; old saves won't have it.
    state.baseItems = (saved.baseItems as typeof saved.baseItems | undefined) ?? [];
    state.lastSyncedSha = saved.lastSyncedSha;
    state.lastSyncedAt = saved.lastSyncedAt;
    state.pendingChanges = saved.pendingChanges;
    state.authToken = saved.authToken;
    state.dataRepo = saved.dataRepo;
  }
}

export async function saveState(): Promise<void> {
  const database = await getDB();
  await database.put(STORE, { id: RECORD_ID, ...state });
}

let debounceTimer: ReturnType<typeof setTimeout> | null = null;

export function scheduleSave(): void {
  if (debounceTimer !== null) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    saveState().catch((err) => console.error('[storage] save failed', err));
  }, 500);
}
