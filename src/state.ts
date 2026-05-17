import { ulid } from 'ulid';
import type { AppState, Bucket, Item } from './types';
import { scheduleSave } from './sync/storage';

export const state: AppState = {
  items: [],
  baseItems: [],
  lastSyncedSha: null,
  lastSyncedAt: null,
  pendingChanges: false,
  authToken: null,
  dataRepo: { owner: '', repo: '', path: 'today.md' },
};

export const BUCKET_ORDER: readonly Bucket[] = ['today', 'soon', 'later'];

type Listener = () => void;
const listeners = new Set<Listener>();

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notify(): void {
  state.pendingChanges = true;
  for (const listener of listeners) listener();
  scheduleSave();
}

// Used by the sync engine: notifies listeners without marking pending changes.
function notifyFromSync(): void {
  for (const listener of listeners) listener();
  scheduleSave();
}

export function applySyncResult(sha: string, items: Item[]): void {
  state.lastSyncedSha = sha;
  state.lastSyncedAt = Date.now();
  // Deep copy both arrays so in-place mutations to state.items don't corrupt baseItems.
  state.baseItems = items.map((i) => ({ ...i }));
  state.pendingChanges = false;
  state.items = items.map((i) => ({ ...i }));
  notifyFromSync();
}

function itemsIn(bucket: Bucket): Item[] {
  const sorted = state.items
    .filter((i) => i.bucket === bucket)
    .sort((a, b) => a.order - b.order);
  return [...sorted.filter((i) => !i.done), ...sorted.filter((i) => i.done)];
}

function nextOrder(bucket: Bucket): number {
  const items = itemsIn(bucket);
  if (items.length === 0) return 1;
  return items[items.length - 1]!.order + 1;
}

export function addItem(text: string, bucket: Bucket = 'today'): Item {
  const item: Item = {
    id: ulid(),
    text,
    done: false,
    bucket,
    order: nextOrder(bucket),
  };
  state.items.push(item);
  notify();
  return item;
}

export function addItemFirst(text: string, bucket: Bucket = 'today'): Item {
  const items = itemsIn(bucket);
  const order = items.length === 0 ? 1 : items[0]!.order - 1;
  const item: Item = {
    id: ulid(),
    text,
    done: false,
    bucket,
    order,
  };
  state.items.push(item);
  notify();
  return item;
}

export function addItemAfter(id: string): Item {
  const source = state.items.find((i) => i.id === id);
  const bucket: Bucket = source?.bucket ?? 'today';
  const active = itemsIn(bucket).filter((i) => !i.done);
  const idx = active.findIndex((i) => i.id === id);
  let order: number;
  if (idx < 0 || active.length === 0) {
    order = 1;
  } else if (idx >= active.length - 1) {
    order = active[active.length - 1]!.order + 1;
  } else {
    order = (active[idx]!.order + active[idx + 1]!.order) / 2;
  }
  const item: Item = { id: ulid(), text: '', done: false, bucket, order };
  state.items.push(item);
  notify();
  return item;
}

export function editItem(id: string, text: string): void {
  const item = state.items.find((i) => i.id === id);
  if (!item || item.text === text) return;
  item.text = text;
  notify();
}

export function toggleDone(id: string): void {
  const item = state.items.find((i) => i.id === id);
  if (!item) return;
  const completing = !item.done;
  item.done = completing;
  if (completing) {
    // Place at top of done section so most-recently-completed appears first.
    const doneOrders = state.items
      .filter((i) => i.bucket === item.bucket && i.done && i.id !== id)
      .map((i) => i.order);
    item.order = doneOrders.length === 0 ? 0 : Math.min(...doneOrders) - 1;
  } else {
    // Always return to today, at the bottom of active items.
    item.bucket = 'today';
    const activeOrders = state.items
      .filter((i) => i.bucket === 'today' && !i.done && i.id !== id)
      .map((i) => i.order);
    item.order = activeOrders.length === 0 ? 1 : Math.max(...activeOrders) + 1;
  }
  notify();
}

export function setDone(id: string, done: boolean): void {
  const item = state.items.find((i) => i.id === id);
  if (!item || item.done === done) return;
  item.done = done;
  notify();
}

export function moveItem(id: string, bucket: Bucket, order: number): void {
  const item = state.items.find((i) => i.id === id);
  if (!item) return;
  item.bucket = bucket;
  item.order = order;
  notify();
}

export function reorderItem(id: string, order: number): void {
  const item = state.items.find((i) => i.id === id);
  if (!item || item.order === order) return;
  item.order = order;
  notify();
}

export function setAuth(
  token: string,
  dataRepo: { owner: string; repo: string; path: string },
): void {
  state.authToken = token;
  state.dataRepo = dataRepo;
  notify();
}

export function clearAuth(): void {
  state.authToken = null;
  notify();
}

export function deleteItem(id: string): void {
  const before = state.items.length;
  state.items = state.items.filter((i) => i.id !== id);
  if (state.items.length !== before) notify();
}

export function flattenedForRender(): Item[] {
  const out: Item[] = [];
  for (const bucket of BUCKET_ORDER) out.push(...itemsIn(bucket));
  return out;
}

export function bucketItems(bucket: Bucket): Item[] {
  return itemsIn(bucket);
}

export function allDoneItems(): Item[] {
  return state.items
    .filter((i) => i.done)
    .sort((a, b) => a.order - b.order);
}
