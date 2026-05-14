import { attachRowGestures, initPullToAdd } from './gestures';
import {
  addItem,
  addItemFirst,
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
let pullContainerEl: HTMLElement | null = null;
let rafId: number | null = null;
let editingId: string | null = null;
let dragActive = false;
let pullActive = false;

window.addEventListener(
  'touchmove',
  (e: TouchEvent) => {
    if (dragActive) e.preventDefault();
  },
  { passive: false },
);

export function init(mount: HTMLElement): void {
  buildShell(mount);
  subscribe(scheduleRender);
  scheduleRender();
}

function buildShell(mount: HTMLElement): void {
  mount.replaceChildren();

  const app = document.createElement('div');
  app.className = 'app';

  const pullContainer = document.createElement('div');
  pullContainer.className = 'pull-row-container';
  const pullInner = document.createElement('div');
  pullInner.className = 'pull-row';
  const pullContent = document.createElement('div');
  pullContent.className = 'pull-row-content';
  pullContent.style.backgroundImage = rowBackgroundForPosition(0, 2);
  pullInner.appendChild(pullContent);
  pullContainer.appendChild(pullInner);
  pullContainerEl = pullContainer;

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

  initPullToAdd(
    pullContainer,
    () => dragActive || editingId !== null,
    () => {
      const item = addItemFirst('', 'today');
      editingId = item.id;
      scheduleRender();
    },
    (active) => { pullActive = active; },
  );
}

function scheduleRender(): void {
  if (dragActive || pullActive) return;
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
  listEl.style.backgroundImage = `linear-gradient(to bottom, ${colorForPosition(0, total)}, ${colorForPosition(total - 1, total)})`;

  // Re-inject pull container inside Today section, right after the header.
  // It's removed by replaceChildren each render and must live here so the
  // pull animation reveals a row in exactly the position the item will land.
  if (pullContainerEl) {
    const todayHeader = listEl.querySelector<HTMLElement>('.bucket-header[data-bucket="today"]');
    todayHeader?.insertAdjacentElement('afterend', pullContainerEl);
  }

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
      onLongPress: (pointerId, clientX, clientY) => startDrag(row, item.id, pointerId, clientX, clientY),
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

function startDrag(row: HTMLElement, itemId: string, pointerId: number, startClientX: number, startClientY: number): void {
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
  const allHeaders = Array.from(listEl.querySelectorAll<HTMLElement>('.bucket-header'));
  const sourceFlatIdx = allRows.indexOf(row);
  if (sourceFlatIdx < 0) {
    dragActive = false;
    scheduleRender();
    return;
  }

  const sourceRect = row.getBoundingClientRect();
  const sourceHeight = sourceRect.height;
  const originalRowTops = allRows.map((r) => r.getBoundingClientRect().top);
  const originalRowBottoms = allRows.map((r) => r.getBoundingClientRect().bottom);
  const sourceContent = row.querySelector<HTMLElement>('.row-content');
  const sourceBucket = item.bucket;
  const srcBucketIdx = BUCKET_ORDER.indexOf(sourceBucket);
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

  const halfH = sourceHeight / 2;
  const sourceCenterY = sourceRect.top + halfH;
  for (const slot of slots) {
    // Skip adjustment for cross-bucket slots sharing the source's flatIdx —
    // their natural midY already falls in the header gap and needs no shift.
    if (slot.flatIdx === sourceFlatIdx && slot.bucket !== sourceBucket) continue;
    if (slot.midY < sourceCenterY) slot.midY += halfH;
    else if (slot.midY > sourceCenterY) slot.midY -= halfH;
  }

  row.classList.add('dragging');
  if (sourceContent) {
    sourceContent.style.transition = `box-shadow ${DRAG_LIFT_MS}ms ease`;
    sourceContent.style.transform = 'translate(0, 0) scale(1.06)';
    sourceContent.style.willChange = 'transform';
  }
  for (const r of allRows) {
    if (r === row) continue;
    r.style.transition = `transform ${DRAG_REFLOW_MS}ms ease`;
    r.style.willChange = 'transform';
  }
  for (const h of allHeaders) {
    h.style.transition = `transform ${DRAG_REFLOW_MS}ms ease`;
    h.style.willChange = 'transform';
  }
  vibrate(15);

  let lastTargetFlatIdx = sourceFlatIdx;
  let lastTargetBucket: Bucket = sourceBucket;
  let currentDy = 0;
  let currentDx = 0;

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

  function applyReflow(target: DragSlot): void {
    if (target.flatIdx === lastTargetFlatIdx && target.bucket === lastTargetBucket) return;
    lastTargetFlatIdx = target.flatIdx;
    lastTargetBucket = target.bucket;
    const targetFlatIdx = target.flatIdx;
    const tgtBucketIdx = BUCKET_ORDER.indexOf(target.bucket);
    // Empty target bucket: source just floats over the hint — nothing shifts.
    const targetBucketEmpty = bucketItems(target.bucket).length === 0;

    for (let i = 0; i < allRows.length; i++) {
      const r = allRows[i]!;
      if (r === row) continue;
      let dy = 0;
      if (!targetBucketEmpty) {
        if (targetFlatIdx > sourceFlatIdx) {
          if (i > sourceFlatIdx && i < targetFlatIdx) dy = -sourceHeight;
        } else if (targetFlatIdx < sourceFlatIdx) {
          if (i >= targetFlatIdx && i < sourceFlatIdx) dy = sourceHeight;
        }
      }
      r.style.transform = dy === 0 ? '' : `translateY(${dy}px)`;
    }

    for (const h of allHeaders) {
      const hdrBucket = h.dataset.bucket as Bucket;
      const hdrBucketIdx = BUCKET_ORDER.indexOf(hdrBucket);
      let dy = 0;
      if (!targetBucketEmpty) {
        if (srcBucketIdx >= hdrBucketIdx && tgtBucketIdx < hdrBucketIdx) dy = sourceHeight;
        else if (srcBucketIdx < hdrBucketIdx && tgtBucketIdx >= hdrBucketIdx) dy = -sourceHeight;
      }
      h.style.transform = dy === 0 ? '' : `translateY(${dy}px)`;
    }
  }

  function onMove(e: PointerEvent): void {
    if (e.pointerId !== pointerId) return;
    e.preventDefault();
    currentDy = e.clientY - startClientY;
    currentDx = e.clientX - startClientX;
    if (sourceContent) {
      sourceContent.style.transition = '';
      sourceContent.style.transform = `translate(${currentDx}px, ${currentDy}px) scale(1.06)`;
    }
    const target = findTargetSlot(e.clientY);
    applyReflow(target);
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
    try {
      row.releasePointerCapture(pointerId);
    } catch {
      /* already released */
    }

    const target = findTargetSlot(clientY);
    applyReflow(target);

    // finalDy must place sourceContent's top edge exactly where this item will
    // appear in the re-rendered DOM -- not where the slot currently is in the live
    // layout. Each branch below models a specific post-render layout outcome.
    //
    // Critical invariants:
    //   (a) When source leaves a non-empty bucket, that bucket shrinks by sourceHeight,
    //       pulling everything below it up. Snap math must subtract sourceHeight to
    //       compensate when the target is below the shrunken source bucket.
    //   (b) When source is the only row in its bucket, the bucket stays the same height
    //       (hint fills the slot), so no upward pull happens.
    //   (c) allRows[target.flatIdx] may not be in target.bucket. When target bucket is
    //       empty, flatIdx points to the first row of the next non-empty bucket, making
    //       originalRowTops[target.flatIdx] wrong. Use the hint's getBoundingClientRect().
    //   (d) When target.indexInBucket > 0 but allRows[target.flatIdx] is in the next
    //       bucket, the target is end-of-bucket. Use originalRowBottoms[target.flatIdx-1].
    let finalDy: number;
    const sameBucketNoOp =
      target.bucket === sourceBucket &&
      (target.flatIdx === sourceFlatIdx || target.flatIdx === sourceFlatIdx + 1);
    if (sameBucketNoOp) {
      finalDy = 0;
    } else if (target.flatIdx > sourceFlatIdx) {
      // Target is below source in the list.
      if (target.flatIdx === sourceFlatIdx + 1 && target.flatIdx < allRows.length) {
        const adjBucketEl = allRows[target.flatIdx]!.closest<HTMLElement>('.bucket');
        if (adjBucketEl?.dataset.bucket !== target.bucket) {
          // Target bucket is empty; allRows[target.flatIdx] is in the next non-empty bucket.
          // Snap to the target bucket's empty-hint position, adjusted for whether the
          // source bucket shrinks (which pulls the hint up on re-render).
          const targetSection = listEl!.querySelector<HTMLElement>(`.bucket[data-bucket="${target.bucket}"]`);
          const hint = targetSection?.querySelector<HTMLElement>('.empty-hint');
          const hintTop = hint?.getBoundingClientRect().top ?? originalRowTops[target.flatIdx]!;
          if (sourceIdxInBucket > 0) {
            // Source bucket shrinks by sourceHeight on re-render, pulling target bucket up.
            finalDy = hintTop - sourceHeight - sourceRect.top;
          } else {
            // Source bucket stays same height (empty-hint replaces last row).
            finalDy = hintTop - sourceRect.top;
          }
        } else if (sourceIdxInBucket > 0) {
          // Source bucket has remaining rows; it shrinks by sourceHeight on re-render,
          // pulling the target bucket up. Snap source to just above the first target row
          // so it lands where it will be after re-render with no overlap.
          finalDy = originalRowTops[target.flatIdx]! - sourceHeight - sourceRect.top;
        } else {
          // Source bucket becomes empty (stays same height via empty-hint).
          // Target bucket won't shift; snap source to the first target row's position
          // and shift that row (and its bucket-mates) down instantly to clear the slot.
          finalDy = originalRowTops[target.flatIdx]! - sourceRect.top;
          for (let i = target.flatIdx; i < allRows.length; i++) {
            const bucketEl = allRows[i]!.closest<HTMLElement>('.bucket');
            if (bucketEl?.dataset.bucket !== target.bucket) break;
            allRows[i]!.style.transition = 'none';
            allRows[i]!.style.transform = `translateY(${sourceHeight}px)`;
          }
          void allRows[target.flatIdx]!.offsetHeight;
        }
      } else if (target.flatIdx === sourceFlatIdx + 1) {
        // Adjacent slot, source is the last row overall -- snap to source's own bottom.
        finalDy = originalRowBottoms[sourceFlatIdx]! - sourceRect.top;
      } else {
        // General case: target is 2+ slots below source. Snap to the row just above
        // the target slot, which will be at originalRowTops[target.flatIdx - 1] after
        // re-render (source bucket shrinks but target slot is far enough away that the
        // shift doesn't affect the landing position relative to the preceding row).
        finalDy = originalRowTops[target.flatIdx - 1]! - sourceRect.top;
      }
    } else if (target.flatIdx < sourceFlatIdx) {
      // Check whether allRows[target.flatIdx] actually belongs to target.bucket.
      // It won't when (a) target.bucket is empty or (b) target is the "end of bucket"
      // slot so allRows[target.flatIdx] is the first row of the next bucket.
      const firstRowBucketEl = target.flatIdx < allRows.length
        ? allRows[target.flatIdx]!.closest<HTMLElement>('.bucket')
        : null;
      if (firstRowBucketEl?.dataset.bucket !== target.bucket) {
        if (target.indexInBucket === 0) {
          // (a) Target bucket is empty — snap to where its hint is.
          const targetSection = listEl!.querySelector<HTMLElement>(`.bucket[data-bucket="${target.bucket}"]`);
          const hint = targetSection?.querySelector<HTMLElement>('.empty-hint');
          finalDy = (hint?.getBoundingClientRect().top ?? originalRowTops[target.flatIdx]!) - sourceRect.top;
        } else {
          // (b) "End of non-empty bucket" — allRows[flatIdx] is in the next bucket.
          // Snap to the bottom of target.bucket's last row (not the next bucket's top,
          // which is one header-height too low).
          finalDy = originalRowBottoms[target.flatIdx - 1]! - sourceRect.top;
        }
      } else {
        // Normal case: allRows[target.flatIdx] is in target.bucket, snap to its top.
        finalDy = originalRowTops[target.flatIdx]! - sourceRect.top;
      }
    } else {
      // Same flatIdx, different bucket: source is first in its bucket, target is
      // the end-of-previous-bucket slot. Snap to the bottom of the last row there.
      finalDy = originalRowBottoms[target.flatIdx - 1]! - sourceRect.top;
    }

    if (sourceContent) {
      sourceContent.style.transition = `transform ${DRAG_SNAP_MS}ms ease`;
      sourceContent.style.transform = `translateY(${finalDy}px) scale(1.0)`;
    }

    window.setTimeout(() => {
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
