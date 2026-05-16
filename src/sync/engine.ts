import { applySyncResult, state, subscribe } from '../state';
import type { Item } from '../types';
import { setSyncStatus } from '../ui/statusDot';
import { getFile, putFile } from './github';
import { parseMarkdown, serializeMarkdown } from './parser';

let syncInFlight = false;
let outboundTimer: ReturnType<typeof setTimeout> | null = null;

export function startEngine(): void {
  subscribe(scheduleOutbound);

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) void triggerInbound();
  });

  setInterval(() => {
    if (!document.hidden) void triggerInbound();
  }, 30_000);

  void triggerInbound();
}

export function triggerInbound(): Promise<void> {
  return runInbound();
}

export function triggerOutbound(): void {
  if (outboundTimer !== null) clearTimeout(outboundTimer);
  void runOutbound();
}

function scheduleOutbound(): void {
  if (!state.authToken) return;
  if (outboundTimer !== null) clearTimeout(outboundTimer);
  outboundTimer = setTimeout(() => {
    outboundTimer = null;
    void runOutbound();
  }, 1500);
}

async function runInbound(): Promise<void> {
  if (!state.authToken || syncInFlight) return;
  syncInFlight = true;
  setSyncStatus('syncing');
  try {
    const { authToken: token, dataRepo: { owner, repo, path } } = state;
    const remote = await getFile(token, owner, repo, path);

    if (remote.sha === state.lastSyncedSha) {
      setSyncStatus('ok');
      return;
    }

    const remoteItems = parseMarkdown(remote.content, state.items);
    // On first-ever sync (no lastSyncedSha), always merge so local items survive.
    const shouldMerge = state.pendingChanges || state.lastSyncedSha === null;

    if (!shouldMerge) {
      applySyncResult(remote.sha, remoteItems);
      setSyncStatus('ok');
    } else {
      const merged = mergeItems(state.baseItems, state.items, remoteItems);
      const mergedMarkdown = serializeMarkdown(merged);
      const result = await putFile(
        token, owner, repo, path,
        mergedMarkdown, remote.sha,
        `update from today app @ ${new Date().toISOString()}`,
      );
      applySyncResult(result.sha, merged);
      setSyncStatus('ok');
    }
  } catch (err) {
    console.error('[engine:inbound]', err);
    setSyncStatus('error');
  } finally {
    syncInFlight = false;
  }
}

async function runOutbound(): Promise<void> {
  if (!state.authToken || syncInFlight) return;

  const currentMarkdown = serializeMarkdown(state.items);
  if (currentMarkdown === serializeMarkdown(state.baseItems)) return;

  syncInFlight = true;
  setSyncStatus('syncing');

  try {
    const { authToken: token, dataRepo: { owner, repo, path } } = state;
    for (let attempt = 0; attempt < 3; attempt++) {
      const outcome = await attemptOutbound(token, owner, repo, path, currentMarkdown);
      if (outcome === 'success') return;
      if (outcome === 'conflict' && attempt < 2) continue;
      break;
    }
    setSyncStatus('error');
  } finally {
    syncInFlight = false;
  }
}

async function attemptOutbound(
  token: string,
  owner: string,
  repo: string,
  path: string,
  currentMarkdown: string,
): Promise<'success' | 'conflict' | 'error'> {
  try {
    const remote = await getFile(token, owner, repo, path);

    let contentToPush: string;
    let itemsToPush: Item[];

    if (remote.sha === state.lastSyncedSha) {
      contentToPush = currentMarkdown;
      itemsToPush = [...state.items];
    } else {
      const remoteItems = parseMarkdown(remote.content, state.items);
      const merged = mergeItems(state.baseItems, state.items, remoteItems);
      contentToPush = serializeMarkdown(merged);
      itemsToPush = merged;
    }

    const result = await putFile(
      token, owner, repo, path, contentToPush, remote.sha,
      `update from today app @ ${new Date().toISOString()}`,
    );
    applySyncResult(result.sha, itemsToPush);
    setSyncStatus('ok');
    return 'success';
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[engine:outbound] attempt failed', err);
    return msg.includes('409') ? 'conflict' : 'error';
  }
}

function itemKey(item: Item): string {
  return `${item.bucket}:${item.text.trim().toLowerCase()}`;
}

function mergeItems(base: Item[], local: Item[], remote: Item[]): Item[] {
  const baseMap = new Map(base.map((i) => [itemKey(i), i]));
  const localMap = new Map(local.map((i) => [itemKey(i), i]));
  const remoteMap = new Map(remote.map((i) => [itemKey(i), i]));

  const allKeys = new Set([
    ...baseMap.keys(),
    ...localMap.keys(),
    ...remoteMap.keys(),
  ]);

  const result: Item[] = [];

  for (const k of allKeys) {
    const b = baseMap.get(k);
    const l = localMap.get(k);
    const r = remoteMap.get(k);

    if (!b) {
      // New item not in base: keep local if present, else remote.
      result.push(l ?? r!);
    } else if (l && r) {
      // Present in all three (or base + both sides): local wins.
      result.push(l);
    } else if (l) {
      // Remote deleted it; resurrect only if local changed it.
      if (l.done !== b.done || l.text !== b.text) {
        console.log('[engine:merge] resurrection (remote deleted, local changed):', k);
        result.push(l);
      }
    } else if (r) {
      // Local deleted it; resurrect only if remote changed it.
      if (r.done !== b.done || r.text !== b.text) {
        console.log('[engine:merge] resurrection (local deleted, remote changed):', k);
        result.push(r);
      }
    }
    // base only (deleted by both): drop.
  }

  return result;
}
