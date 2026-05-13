import { attachRowGestures } from './gestures';
import {
  addItem,
  BUCKET_ORDER,
  bucketItems,
  deleteItem,
  editItem,
  flattenedForRender,
  moveItem,
  state,
  subscribe,
  toggleDone,
} from './state';
import type { Bucket, Item } from './types';
import { colorForPosition, rowBackgroundForPosition } from './ui/colors';

const EMPTY_HINTS: Record<Bucket, string> = {
  today: 'Tap to add',
  soon: 'Tap to add',
  later: 'Tap to add',
};

const BUCKET_LABELS: Record<Bucket, string> = {
  today: 'Today',
  soon: 'Soon',
  later: 'Later',
};

const DRAG_LIFT_MS = 150;
const DRAG_REFLOW_MS = 150;
const DRAG_SNAP_MS = 150;

let listEl: HTMLElement | null = null;
let rafId: number | null = null;
let editingId: string | null = null;
let dragActive = false;

export function init(mount: HTMLElement): void {
  buildShell(mount);
  subscribe(scheduleRender);
  scheduleRender();
}

function buildShell(mount: HTMLElement): void {
  mount.replaceChildren();

  const app = document.createElement('div');
  app.className = 'app';

  const list = document.createElement('div');
  list.className = 'list';
  list.addEventListener('click', onListClick);
  app.appendChild(list);
  listEl = list;

  const settings = document.createElement('button');
  settings.type = 'button';
  settings.className = 'settings-button';
  settings.setAttribute('aria-label', 'Open settings');
  for (let i = 0; i < 3; i++) {
    const dot = document.createElement('span');
    dot.className = 'settings-button-dot';
    settings.appendChild(dot);
  }
  app.appendChild(settings);

  mount.appendChild(app);
}

function scheduleRender(): void {
  if (dragActive) return;
  if (rafId !== null) return;
  rafId = requestAnimationFrame(() => {
    rafId = null;
    render();
  });
}

function render(): void {
  if (!listEl) return;

  const flat = flattenedForRender();
  const total = flat.length + BUCKET_ORDER.length;

  const headerPos: Record<Bucket, number> = { today: 0, soon: 0, later: 0 };
  const itemPos = new Map<string, number>();
  let cursor = 0;
  for (const bucket of BUCKET_ORDER) {
    headerPos[bucket] = cursor;
    cursor++;
    for (const item of bucketItems(bucket)) {
      itemPos.set(item.id, cursor);
      cursor++;
    }
  }

  const next = document.createDocumentFragment();
  for (const bucket of BUCKET_ORDER) {
    next.appendChild(renderBucket(bucket, headerPos[bucket], itemPos, total));
  }
  listEl.replaceChildren(next);

  if (editingId !== null) {
    const input = listEl.querySelector<HTMLInputElement>(
      `.row[data-id="${cssEscape(editingId)}"] .row-input`,
    );
    if (input) {
      input.focus();
      input.select();
    }
  }
}

function renderBucket(
  bucket: Bucket,
  headerPosition: number,
  itemPos: Map<string, number>,
  total: number,
): HTMLElement {
  const section = document.createElement('section');
  section.className = 'bucket';
  section.dataset.bucket = bucket;

  section.appendChild(renderBucketHeader(bucket, headerPosition, total));

  const items = bucketItems(bucket);
  if (items.length === 0) {
    section.classList.add('bucket-empty');
    const hint = document.createElement('div');
    hint.className = 'empty-hint';
    hint.textContent = EMPTY_HINTS[bucket];
    section.appendChild(hint);
    return section;
  }

  for (const item of items) {
    const idx = itemPos.get(item.id) ?? 0;
    section.appendChild(renderRow(item, idx, total));
  }
  return section;
}

function renderBucketHeader(bucket: Bucket, position: number, total: number): HTMLElement {
  const header = document.createElement('div');
  header.className = 'bucket-header';
  header.dataset.bucket = bucket;
  header.style.backgroundColor = colorForPosition(position, total);

  const title = document.createElement('span');
  title.className = 'bucket-header-title';
  title.textContent = BUCKET_LABELS[bucket];
  header.appendChild(title);

  return header;
}

function renderRow(item: Item, index: number, total: number): HTMLElement {
  const row = document.createElement('div');
  row.className = 'row';
  row.dataset.id = item.id;
  if (item.done) row.classList.add('row-done');

  const completeAction = document.createElement('div');
  completeAction.className = 'row-action row-action-complete';
  completeAction.innerHTML =
    '<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 16 L13 23 L26 9" /></svg>';
  row.appendChild(completeAction);

  const deleteAction = document.createElement('div');
  deleteAction.className = 'row-action row-action-delete';
  deleteAction.innerHTML =
    '<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" aria-hidden="true"><path d="M8 8 L24 24 M24 8 L8 24" /></svg>';
  row.appendChild(deleteAction);

  const content = document.createElement('div');
  content.className = 'row-content';
  if (!item.done) {
    content.style.backgroundImage = rowBackgroundForPosition(index, total);
  }

  if (editingId === item.id) {
    content.appendChild(renderInput(item));
  } else {
    const text = document.createElement('span');
    text.className = 'row-text';
    text.textContent = item.text;
    content.appendChild(text);
  }
  row.appendChild(content);

  if (editingId !== item.id) {
    attachRowGestures(row, {
      onTap: () => startEdit(item.id),
      onCompleteCommit: () => toggleDone(item.id),
      onDeleteCommit: () => deleteItem(item.id),
      onLongPress: (pointerId, _clientX, clientY) => startDrag(row, item.id, pointerId, clientY),
    });
  }

  return row;
}

function renderInput(item: Item): HTMLInputElement {
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'row-input';
  input.value = item.text;
  input.autocomplete = 'off';
  input.spellcheck = false;

  let cancelled = false;

  const commit = () => {
    if (cancelled) return;
    commitEdit(item.id, input.value);
  };

  input.addEventListener('blur', commit);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      input.blur();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancelled = true;
      cancelEdit(item.id);
    }
  });

  return input;
}

function onListClick(e: MouseEvent): void {
  const target = e.target as HTMLElement | null;
  if (!target) return;

  const hint = target.closest<HTMLElement>('.empty-hint');
  if (hint) {
    const bucketEl = hint.closest<HTMLElement>('.bucket');
    const bucket = bucketEl?.dataset.bucket as Bucket | undefined;
    if (bucket) {
      const item = addItem('', bucket);
      editingId = item.id;
    }
  }
}

function startEdit(id: string): void {
  editingId = id;
  scheduleRender();
}

function commitEdit(id: string, value: string): void {
  const trimmed = value.trim();
  const item = state.items.find((i) => i.id === id);
  if (item) {
    if (trimmed === '' && item.text === '') {
      deleteItem(id);
    } else if (trimmed !== '' && trimmed !== item.text) {
      editItem(id, trimmed);
    }
  }
  editingId = null;
  scheduleRender();
}

function cancelEdit(id: string): void {
  const item = state.items.find((i) => i.id === id);
  if (item && item.text === '') {
    deleteItem(id);
  }
  editingId = null;
  scheduleRender();
}

interface DragSlot {
  bucket: Bucket;
  indexInBucket: number;
  flatIdx: number;
  midY: number;
}

function startDrag(row: HTMLElement, itemId: string, pointerId: number, startClientY: number): void {
  if (!listEl) return;
  const item = state.items.find((i) => i.id === itemId);
  if (!item) return;

  if (rafId !== null) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
  dragActive = true;

  try {
    row.setPointerCapture(pointerId);
  } catch {
    /* capture refused; continue */
  }

  const allRows = Array.from(listEl.querySelectorAll<HTMLElement>('.row'));
  const sourceFlatIdx = allRows.indexOf(row);
  if (sourceFlatIdx < 0) {
    dragActive = false;
    scheduleRender();
    return;
  }

  const sourceRect = row.getBoundingClientRect();
  const sourceHeight = sourceRect.height;
  const sourceContent = row.querySelector<HTMLElement>('.row-content');
  const sourceBucket = item.bucket;
  const sourceItems = bucketItems(sourceBucket);
  const sourceIdxInBucket = sourceItems.findIndex((i) => i.id === itemId);

  const slots: DragSlot[] = [];
  let flatCursor = 0;
  for (const bucket of BUCKET_ORDER) {
    const sectionEl = listEl.querySelector<HTMLElement>(`.bucket[data-bucket="${bucket}"]`);
    if (!sectionEl) continue;
    const rowEls = Array.from(sectionEl.querySelectorAll<HTMLElement>('.row'));
    if (rowEls.length === 0) {
      const hint = sectionEl.querySelector<HTMLElement>('.empty-hint');
      if (hint) {
        const hr = hint.getBoundingClientRect();
        slots.push({ bucket, indexInBucket: 0, flatIdx: flatCursor, midY: hr.top + hr.height / 2 });
      }
      continue;
    }
    const firstRect = rowEls[0]!.getBoundingClientRect();
    slots.push({ bucket, indexInBucket: 0, flatIdx: flatCursor, midY: firstRect.top });
    for (let i = 1; i < rowEls.length; i++) {
      const prev = rowEls[i - 1]!.getBoundingClientRect();
      const cur = rowEls[i]!.getBoundingClientRect();
      slots.push({
        bucket,
        indexInBucket: i,
        flatIdx: flatCursor + i,
        midY: (prev.bottom + cur.top) / 2,
      });
    }
    const lastRect = rowEls[rowEls.length - 1]!.getBoundingClientRect();
    slots.push({
      bucket,
      indexInBucket: rowEls.length,
      flatIdx: flatCursor + rowEls.length,
      midY: lastRect.bottom,
    });
    flatCursor += rowEls.length;
  }

  row.classList.add('dragging');
  if (sourceContent) {
    sourceContent.style.transition = `transform ${DRAG_LIFT_MS}ms ease, box-shadow ${DRAG_LIFT_MS}ms ease`;
    sourceContent.style.transform = 'translateY(0) scale(1.03)';
    sourceContent.style.willChange = 'transform';
  }
  for (const r of allRows) {
    if (r === row) continue;
    const c = r.querySelector<HTMLElement>('.row-content');
    if (c) {
      c.style.transition = `transform ${DRAG_REFLOW_MS}ms ease`;
      c.style.willChange = 'transform';
    }
  }
  vibrate(15);

  let liftDone = false;
  const liftTimer = window.setTimeout(() => {
    liftDone = true;
    if (sourceContent) sourceContent.style.transition = 'box-shadow 150ms ease';
  }, DRAG_LIFT_MS);

  let lastTargetFlatIdx = sourceFlatIdx;
  let currentDy = 0;

  function findTargetSlot(clientY: number): DragSlot {
    let best = slots[0]!;
    let bestDist = Math.abs(best.midY - clientY);
    for (let i = 1; i < slots.length; i++) {
      const d = Math.abs(slots[i]!.midY - clientY);
      if (d < bestDist) {
        bestDist = d;
        best = slots[i]!;
      }
    }
    return best;
  }

  function applyReflow(targetFlatIdx: number): void {
    if (targetFlatIdx === lastTargetFlatIdx) return;
    lastTargetFlatIdx = targetFlatIdx;
    for (let i = 0; i < allRows.length; i++) {
      const r = allRows[i]!;
      if (r === row) continue;
      let dy = 0;
      if (targetFlatIdx > sourceFlatIdx) {
        if (i > sourceFlatIdx && i < targetFlatIdx) dy = -sourceHeight;
      } else if (targetFlatIdx < sourceFlatIdx) {
        if (i >= targetFlatIdx && i < sourceFlatIdx) dy = sourceHeight;
      }
      const c = r.querySelector<HTMLElement>('.row-content');
      if (c) c.style.transform = dy === 0 ? '' : `translateY(${dy}px)`;
    }
  }

  function onMove(e: PointerEvent): void {
    if (e.pointerId !== pointerId) return;
    e.preventDefault();
    currentDy = e.clientY - startClientY;
    if (sourceContent) {
      const transition = liftDone ? '' : sourceContent.style.transition;
      if (liftDone) sourceContent.style.transition = '';
      sourceContent.style.transform = `translateY(${currentDy}px) scale(1.03)`;
      if (!liftDone) sourceContent.style.transition = transition;
    }
    const target = findTargetSlot(e.clientY);
    applyReflow(target.flatIdx);
  }

  function onUp(e: PointerEvent): void {
    if (e.pointerId !== pointerId) return;
    finishDrag(e.clientY);
  }

  function onCancel(e: PointerEvent): void {
    if (e.pointerId !== pointerId) return;
    finishDrag(startClientY);
  }

  function finishDrag(clientY: number): void {
    row.removeEventListener('pointermove', onMove);
    row.removeEventListener('pointerup', onUp);
    row.removeEventListener('pointercancel', onCancel);
    clearTimeout(liftTimer);
    try {
      row.releasePointerCapture(pointerId);
    } catch {
      /* already released */
    }

    const target = findTargetSlot(clientY);
    applyReflow(target.flatIdx);

    const finalDy = target.midY - sourceHeight / 2 - sourceRect.top;
    if (sourceContent) {
      sourceContent.style.transition = `transform ${DRAG_SNAP_MS}ms ease, box-shadow ${DRAG_SNAP_MS}ms ease`;
      sourceContent.style.transform = `translateY(${finalDy}px) scale(1.0)`;
    }

    window.setTimeout(() => {
      row.classList.remove('dragging');
      if (sourceContent) {
        sourceContent.style.transition = '';
        sourceContent.style.transform = '';
        sourceContent.style.willChange = '';
      }
      for (const r of allRows) {
        if (r === row) continue;
        const c = r.querySelector<HTMLElement>('.row-content');
        if (c) {
          c.style.transition = '';
          c.style.transform = '';
          c.style.willChange = '';
        }
      }
      dragActive = false;
      commitDrop(target);
    }, DRAG_SNAP_MS);
  }

  function commitDrop(target: DragSlot): void {
    const noOpSameBucket =
      target.bucket === sourceBucket &&
      (target.indexInBucket === sourceIdxInBucket || target.indexInBucket === sourceIdxInBucket + 1);
    if (noOpSameBucket) {
      scheduleRender();
      return;
    }

    const remaining = bucketItems(target.bucket).filter((i) => i.id !== itemId);
    let adjustedIdx = target.indexInBucket;
    if (target.bucket === sourceBucket && target.indexInBucket > sourceIdxInBucket) {
      adjustedIdx -= 1;
    }
    let newOrder: number;
    if (remaining.length === 0) {
      newOrder = 1;
    } else if (adjustedIdx <= 0) {
      newOrder = remaining[0]!.order - 1;
    } else if (adjustedIdx >= remaining.length) {
      newOrder = remaining[remaining.length - 1]!.order + 1;
    } else {
      newOrder = (remaining[adjustedIdx - 1]!.order + remaining[adjustedIdx]!.order) / 2;
    }
    moveItem(itemId, target.bucket, newOrder);
  }

  row.addEventListener('pointermove', onMove);
  row.addEventListener('pointerup', onUp);
  row.addEventListener('pointercancel', onCancel);
}

function vibrate(pattern: number | number[]): void {
  try {
    (navigator as { vibrate?: (p: number | number[]) => boolean }).vibrate?.(pattern);
  } catch {
    /* unsupported */
  }
}

function cssEscape(value: string): string {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
    return CSS.escape(value);
  }
  return value.replace(/["\\]/g, '\\$&');
}
