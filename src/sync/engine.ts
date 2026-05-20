import { applyOutboundResult, applySyncResult, state, subscribe } from '../state';
import type { Item } from '../types';
import { isEditing } from '../render';
import { setSyncStatus } from '../ui/statusDot';
import { getFile, putFile } from './github';
import { parseMarkdown, serializeMarkdown } from './parser';
import { scheduleSave } from './storage';

export interface SyncEvent {
  ts: number;
  type: 'inbound' | 'outbound';
  outcome: 'ok' | 'skip' | 'error';
  detail: string;
}

const syncLog: SyncEvent[] = [];

export function getSyncLog(): readonly SyncEvent[] {
  return syncLog;
}

function logEvent(type: SyncEvent['type'], outcome: SyncEvent['outcome'], detail: string): void {
  syncLog.unshift({ ts: Date.now(), type, outcome, detail });
  if (syncLog.length > 20) syncLog.pop();
}

let syncInFlight = false;
let outboundTimer: ReturnType<typeof setTimeout> | null = null;

export function startEngine(): void {
  subscribe(scheduleOutbound);

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      console.log('[engine:inbound] trigger: visibility change');
      void triggerInbound();
    } else {
      console.log('[engine:outbound] trigger: app backgrounded');
      triggerOutbound();
    }
  });

  setInterval(() => {
    if (!document.hidden) {
      console.log('[engine:inbound] trigger: poll');
      void triggerInbound();
    }
  }, 30_000);

  console.log('[engine:inbound] trigger: startup');
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
  if (!state.authToken) {
    console.log('[engine:outbound] skipped schedule: no auth token');
    return;
  }
  if (outboundTimer !== null) clearTimeout(outboundTimer);
  console.log('[engine:outbound] scheduled in 1500ms');
  outboundTimer = setTimeout(() => {
    outboundTimer = null;
    void runOutbound();
  }, 1500);
}

async function runInbound(): Promise<void> {
  if (!state.authToken) {
    console.log('[engine:inbound] skipped: no auth token');
    logEvent('inbound', 'skip', 'no auth token');
    return;
  }
  if (syncInFlight) {
    console.log('[engine:inbound] skipped: sync already in flight');
    logEvent('inbound', 'skip', 'sync in flight');
    return;
  }
  if (isEditing()) {
    console.log('[engine:inbound] skipped: edit in progress');
    logEvent('inbound', 'skip', 'edit in progress');
    return;
  }
  syncInFlight = true;
  setSyncStatus('syncing');
  console.log('[engine:inbound] start — lastSyncedSha:', state.lastSyncedSha?.slice(0, 7) ?? 'null');
  try {
    const { authToken: token, dataRepo: { owner, repo, path } } = state;
    const remote = await getFile(token, owner, repo, path);
    console.log('[engine:inbound] remote sha:', remote.sha.slice(0, 7), 'local sha:', state.lastSyncedSha?.slice(0, 7) ?? 'null');

    if (remote.sha === state.lastSyncedSha) {
      console.log('[engine:inbound] up to date');
      logEvent('inbound', 'ok', `up to date — sha ${remote.sha.slice(0, 7)}`);
      setSyncStatus('ok');
      return;
    }

    // Check again: user may have started editing during the network fetch.
    if (isEditing()) {
      console.log('[engine:inbound] aborted: edit started during fetch');
      logEvent('inbound', 'skip', 'edit started during fetch');
      setSyncStatus('ok');
      return;
    }

    const { items: remoteItems, tail: remoteTail } = parseMarkdown(remote.content, state.items);
    // On first-ever sync (no lastSyncedSha), always merge so local items survive.
    const shouldMerge = state.pendingChanges || state.lastSyncedSha === null;
    console.log('[engine:inbound] shouldMerge:', shouldMerge, '(pendingChanges:', state.pendingChanges, ', firstSync:', state.lastSyncedSha === null, ')');

    if (!shouldMerge) {
      console.log('[engine:inbound] replacing local with remote —', remoteItems.length, 'items');
      applySyncResult(remote.sha, remoteItems, remoteTail);
      logEvent('inbound', 'ok', `replaced local — ${remoteItems.length} items, sha ${remote.sha.slice(0, 7)}`);
      setSyncStatus('ok');
    } else {
      const merged = mergeItems(state.baseItems, state.items, remoteItems);
      console.log('[engine:inbound] merged result:', merged.length, 'items — pushing');
      const mergedMarkdown = serializeMarkdown(merged, remoteTail);
      const result = await putFile(
        token, owner, repo, path,
        mergedMarkdown, remote.sha,
        `update from today app @ ${new Date().toISOString()}`,
      );
      console.log('[engine:inbound] push ok, new sha:', result.sha.slice(0, 7));
      applySyncResult(result.sha, merged, remoteTail);
      logEvent('inbound', 'ok', `merged and pushed — ${merged.length} items, sha ${result.sha.slice(0, 7)}`);
      setSyncStatus('ok');
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[engine:inbound] error:', err);
    logEvent('inbound', 'error', msg);
    setSyncStatus('error');
  } finally {
    syncInFlight = false;
    // If local changes were pending when inbound started (and may have been
    // skipped while syncInFlight was true), give outbound a chance to run now.
    if (state.pendingChanges) {
      console.log('[engine:inbound] pending changes detected after inbound — scheduling outbound');
      scheduleOutbound();
    }
  }
}

async function runOutbound(): Promise<void> {
  if (!state.authToken) {
    console.log('[engine:outbound] skipped: no auth token');
    return;
  }
  if (syncInFlight) {
    console.log('[engine:outbound] skipped: sync already in flight');
    return;
  }

  const currentItems = state.items.map((i) => ({ ...i }));
  const currentMarkdown = serializeMarkdown(currentItems, state.tail);
  const baseMarkdown = serializeMarkdown(state.baseItems, state.tail);
  if (currentMarkdown === baseMarkdown) {
    if (state.pendingChanges) {
      // Net-zero change: mutations cancelled each other out (e.g. add then cancel).
      // Items match base, nothing to push — just clear the flag.
      console.log('[engine:outbound] net-zero change: clearing pendingChanges');
      logEvent('outbound', 'skip', 'net-zero change');
      state.pendingChanges = false;
      scheduleSave();
    } else {
      console.log('[engine:outbound] skipped: no change since last sync');
      logEvent('outbound', 'skip', 'no change since last sync');
    }
    return;
  }

  console.log('[engine:outbound] start — pushing change');
  syncInFlight = true;
  setSyncStatus('syncing');

  try {
    const { authToken: token, dataRepo: { owner, repo, path } } = state;
    for (let attempt = 0; attempt < 3; attempt++) {
      const outcome = await attemptOutbound(token, owner, repo, path, currentMarkdown, currentItems);
      if (outcome === 'success') return;
      if (outcome === 'conflict' && attempt < 2) {
        console.log('[engine:outbound] 409 conflict, retry', attempt + 1);
        continue;
      }
      break;
    }
    console.error('[engine:outbound] failed after retries');
    logEvent('outbound', 'error', 'failed after retries');
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
  currentItems: Item[],
): Promise<'success' | 'conflict' | 'error'> {
  try {
    const remote = await getFile(token, owner, repo, path);
    console.log('[engine:outbound] remote sha:', remote.sha.slice(0, 7), 'local lastSyncedSha:', state.lastSyncedSha?.slice(0, 7) ?? 'null');

    let contentToPush: string;
    let itemsToPush: Item[];
    let isMerge = false;
    let remoteTail: string | undefined;

    if (remote.sha === state.lastSyncedSha) {
      contentToPush = currentMarkdown;
      itemsToPush = currentItems;
    } else {
      console.log('[engine:outbound] remote changed since last sync — merging before push');
      const parsed = parseMarkdown(remote.content, state.items);
      remoteTail = parsed.tail;
      const merged = mergeItems(state.baseItems, state.items, parsed.items);
      contentToPush = serializeMarkdown(merged, remoteTail);
      itemsToPush = merged;
      isMerge = true;
    }

    const result = await putFile(
      token, owner, repo, path, contentToPush, remote.sha,
      `update from today app @ ${new Date().toISOString()}`,
    );
    console.log('[engine:outbound] push ok, new sha:', result.sha.slice(0, 7));
    // For a plain push (no merge), preserve local mutations that occurred during the
    // async push by only updating baseItems. For a merge, applySyncResult so that
    // remote-added items appear locally.
    if (isMerge) {
      applySyncResult(result.sha, itemsToPush, remoteTail ?? state.tail);
    } else {
      const isPending = serializeMarkdown(state.items, state.tail) !== serializeMarkdown(itemsToPush, state.tail);
      applyOutboundResult(result.sha, itemsToPush, isPending);
      if (isPending) scheduleOutbound();
    }
    logEvent('outbound', 'ok', `pushed — ${itemsToPush.length} items, sha ${result.sha.slice(0, 7)}`);
    setSyncStatus('ok');
    return 'success';
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[engine:outbound] attempt failed:', err);
    if (msg.includes('409')) {
      logEvent('outbound', 'skip', '409 conflict — will retry');
      return 'conflict';
    }
    logEvent('outbound', 'error', msg);
    return 'error';
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
      result.push(l ?? r!);
    } else if (l && r) {
      result.push(l);
    } else if (l) {
      if (l.done !== b.done || l.text !== b.text) {
        console.log('[engine:merge] resurrection (remote deleted, local changed):', k);
        result.push(l);
      }
    } else if (r) {
      if (r.done !== b.done || r.text !== b.text) {
        console.log('[engine:merge] resurrection (local deleted, remote changed):', k);
        result.push(r);
      }
    }
  }

  return result;
}
