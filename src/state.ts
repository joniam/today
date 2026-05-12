import { ulid } from 'ulid';
import type { AppState, Bucket, Item } from './types';

export const state: AppState = {
  items: [],
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
  for (const listener of listeners) listener();
}

function itemsIn(bucket: Bucket): Item[] {
  return state.items
    .filter((i) => i.bucket === bucket)
    .sort((a, b) => a.order - b.order);
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

export function editItem(id: string, text: string): void {
  const item = state.items.find((i) => i.id === id);
  if (!item || item.text === text) return;
  item.text = text;
  notify();
}

export function toggleDone(id: string): void {
  const item = state.items.find((i) => i.id === id);
  if (!item) return;
  item.done = !item.done;
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
