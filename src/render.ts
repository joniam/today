import { attachRowGestures, initPullToAdd } from './gestures';
import { initFirstRun } from './ui/settings';
import { initSyncDebug } from './ui/syncDebug';
import { getSyncStatus } from './ui/statusDot';
import {
  addItem,
  addItemAfter,
  addItemFirst,
  allDoneItems,
  BUCKET_ORDER,
  bucketItems,
  deleteItem,
  editItem,
  moveItem,
  setDone,
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
let collapseActive = false;
let swipeActive = false;
let lastDragEnd = 0;
let lastFocusTime = 0;
let openSyncDebug: (() => void) | null = null;

const FLY_COMPLETE_MS = 220;

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

  initFirstRun(app);
  openSyncDebug = initSyncDebug(app);

  mount.appendChild(app);

  initPullToAdd(
    pullContainer,
    () => dragActive || editingId !== null || (performance.now() - lastDragEnd < 300),
    () => {
      console.log('[pull:onCommit] editingId before:', editingId?.slice(-4) ?? 'null');
      const item = addItemFirst('', 'today');
      editingId = item.id;
      console.log('[pull:onCommit] new editingId:', editingId.slice(-4));
      // Cancel the RAF queued by addItemFirst's notify() and render synchronously.
      // iOS Safari only raises the keyboard when focus() is called within the
      // touchend handler — a RAF callback is outside that window.
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
      render();
    },
    (active) => {
      console.log('[pull:setPullActive]', active, 'editingId:', editingId?.slice(-4) ?? 'null');
      pullActive = active;
    },
    () => {
      const el = document.activeElement as HTMLElement | null;
      console.log('[pull:tryUnlock] blurring:', el?.tagName, el?.className, 'editingId:', editingId?.slice(-4) ?? 'null');
      el?.blur();
      console.log('[pull:tryUnlock] after blur, editingId:', editingId?.slice(-4) ?? 'null');
    },
  );
}

function scheduleRender(): void {
  if (dragActive || pullActive || collapseActive || swipeActive) return;
  if (rafId !== null) return;
  rafId = requestAnimationFrame(() => {
    rafId = null;
    render();
  });
}

function render(): void {
  if (!listEl || collapseActive || swipeActive) return;

  // Position map covers only active items + bucket headers (done items use CSS color).
  const headerPos: Record<Bucket, number> = { today: 0, soon: 0, later: 0 };
  const itemPos = new Map<string, number>();
  let cursor = 0;
  for (const bucket of BUCKET_ORDER) {
    headerPos[bucket] = cursor++;
    for (const item of bucketItems(bucket).filter((i) => !i.done)) {
      itemPos.set(item.id, cursor++);
    }
  }
  const total = cursor;

  const next = document.createDocumentFragment();
  for (const bucket of BUCKET_ORDER) {
    next.appendChild(renderBucket(bucket, headerPos[bucket], itemPos, total));
  }
  const doneItems = allDoneItems();
  if (doneItems.length > 0) {
    next.appendChild(renderDoneSection(doneItems));
  }
  listEl.replaceChildren(next);
  listEl.style.backgroundImage = `linear-gradient(to bottom, ${colorForPosition(0, total)}, ${colorForPosition(total - 1, total)})`;
  // Constrain gradient to content height so empty space below last item stays black.
  const contentH = Array.from(listEl.children).reduce((h, el) => h + (el as HTMLElement).offsetHeight, 0);
  listEl.style.backgroundRepeat = 'no-repeat';
  listEl.style.backgroundSize = `100% ${contentH}px`;

  // Re-inject pull container inside Today section, right after the header.
  // The commit path fires onCommit immediately without waiting for snapBack,
  // so the container may still have its pull height/opacity. Always reset to
  // invisible (height 0) before re-injecting so the first item appears at y=35.
  if (pullContainerEl) {
    const todayHeader = listEl.querySelector<HTMLElement>('.bucket-header[data-bucket="today"]');
    if (todayHeader) {
      pullContainerEl.style.height = '0';
      pullContainerEl.style.transition = '';
      pullContainerEl.classList.remove('pull-past-threshold');
      const pullContent = pullContainerEl.querySelector<HTMLElement>('.pull-row-content');
      if (pullContent) {
        pullContent.style.opacity = '';
        pullContent.style.transition = '';
      }
      todayHeader.insertAdjacentElement('afterend', pullContainerEl);
    }
  }

  if (editingId !== null) {
    const input = listEl.querySelector<HTMLInputElement>(
      `.row[data-id="${cssEscape(editingId)}"] .row-input`,
    );
    if (input) {
      console.log('[render:focus]', editingId.slice(-4));
      lastFocusTime = performance.now();
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

  const items = bucketItems(bucket).filter((i) => !i.done);
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

function renderDoneSection(items: Item[]): HTMLElement {
  const section = document.createElement('section');
  section.className = 'bucket done-section';
  section.dataset.bucket = 'done';
  for (const item of items) {
    section.appendChild(renderRow(item, 0, 1));
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

  if (bucket === 'today') {
    const dot = document.createElement('span');
    dot.className = 'status-dot';
    dot.dataset.status = getSyncStatus();
    header.appendChild(dot);

  }
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
      onCompleteCommit: () => animateComplete(row, item),
      onDeleteCommit: () => deleteItem(item.id),
      onLongPress: (pointerId, clientX, clientY) => startDrag(row, item.id, pointerId, clientX, clientY),
      setSwipeActive: (active) => { swipeActive = active; },
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
  input.addEventListener('contextmenu', (e) => e.preventDefault());

  let cancelled = false;
  let didInteract = false;

  const commit = () => {
    if (cancelled) return;
    console.log('[input:blur]', item.id.slice(-4), 'value:', JSON.stringify(input.value));
    commitEdit(item.id, input.value);
  };

  input.addEventListener('keydown', (e) => {
    didInteract = true;
    if (e.key === 'Enter') {
      e.preventDefault();
      const trimmed = input.value.trim();
      if (!item.done && trimmed !== '') {
        // Commit current item and open a blank row immediately below it.
        cancelled = true;
        editItem(item.id, trimmed);
        const next = addItemAfter(item.id);
        editingId = next.id;
        // Render synchronously so focus() fires within the keydown handler —
        // required on iOS to keep the keyboard up between items.
        if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
        render();
      } else {
        input.blur();
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancelled = true;
      cancelEdit(item.id);
    }
  });

  input.addEventListener('blur', () => {
    const dt = performance.now() - lastFocusTime;
    if (!didInteract && item.text === '' && input.value === '' && dt < 300) {
      // iOS auto-blurs inputs focused outside a direct gesture handler.
      console.log('[input:auto-blur] suppressed, dt:', dt.toFixed(0), 'ms');
      cancelEdit(item.id);
      return;
    }
    commit();
  });

  return input;
}

function onListClick(e: MouseEvent): void {
  const target = e.target as HTMLElement | null;
  if (!target) return;

  if (target.closest<HTMLElement>('.status-dot')) {
    openSyncDebug?.();
    return;
  }

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

export function isEditing(): boolean {
  return editingId !== null;
}

function startEdit(id: string): void {
  editingId = id;
  // Render synchronously (same as pull-to-add and Enter-key flows) so the <span>
  // is replaced with <input> before a second click lands. This prevents Chrome's
  // text-actions toolbar from triggering on the span during a double-click, and
  // keeps focus() inside the gesture handler context so iOS honors it.
  if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
  render();
}

function commitEdit(id: string, value: string): void {
  console.log('[commitEdit]', id.slice(-4), 'trimmed:', JSON.stringify(value.trim()));
  const trimmed = value.trim();
  const item = state.items.find((i) => i.id === id);
  if (item) {
    if (trimmed === '' && item.text === '') {
      cancelEdit(id);
      return;
    } else if (trimmed !== '' && trimmed !== item.text) {
      editItem(id, trimmed);
    }
  }
  editingId = null;
  scheduleRender();
}

function cancelEdit(id: string): void {
  console.log('[cancelEdit]', id.slice(-4));
  const item = state.items.find((i) => i.id === id);
  if (item && item.text === '') {
    const rowEl = listEl?.querySelector<HTMLElement>(`.row[data-id="${cssEscape(id)}"]`);
    if (rowEl) {
      const h = rowEl.offsetHeight;
      rowEl.style.height = `${h}px`;
      void rowEl.offsetHeight;
      collapseActive = true;
      rowEl.style.transition = 'height 200ms ease, opacity 200ms ease';
      rowEl.style.height = '0';
      rowEl.style.opacity = '0';
      window.setTimeout(() => {
        collapseActive = false;
        editingId = null;
        deleteItem(id);
      }, 200);
      return;
    }
    deleteItem(id);
  }
  editingId = null;
  scheduleRender();
}

function animateComplete(rowEl: HTMLElement, item: Item): void {
  if (item.done) {
    const content = rowEl.querySelector<HTMLElement>('.row-content');
    if (!content || !listEl) {
      swipeActive = false;
      toggleDone(item.id);
      return;
    }

    const rowRect = rowEl.getBoundingClientRect();
    const rowH = rowRect.height;

    // Destination: bottom of last active Today item, or below Today header if Today is empty
    const todaySection = listEl.querySelector<HTMLElement>('.bucket[data-bucket="today"]');
    const todayRows = Array.from(todaySection?.querySelectorAll<HTMLElement>('.row') ?? []);
    const lastTodayRow = todayRows[todayRows.length - 1];
    let destY: number;
    if (lastTodayRow) {
      destY = lastTodayRow.getBoundingClientRect().bottom;
    } else {
      const todayHeader = todaySection?.querySelector<HTMLElement>('.bucket-header');
      destY = todayHeader?.getBoundingClientRect().bottom ?? rowRect.top - rowH;
    }
    const flyDy = destY - rowRect.top; // negative — tile flies upward

    // Create space in Today by shifting Soon + Later content down
    const toShiftDown = Array.from(
      listEl.querySelectorAll<HTMLElement>(
        '.bucket-header[data-bucket="soon"], ' +
        '.bucket[data-bucket="soon"] .row, .bucket[data-bucket="soon"] .empty-hint, ' +
        '.bucket-header[data-bucket="later"], ' +
        '.bucket[data-bucket="later"] .row, .bucket[data-bucket="later"] .empty-hint',
      ),
    );

    // Switch to active styling before flying so the tile shows its destination color.
    rowEl.classList.remove('row-done');
    content.style.background = ''; // clear inline done-bg set during complete animation
    const activeCount = state.items.filter((i) => !i.done).length;
    const newTotal = activeCount + 1 + 3; // this item becomes active, +3 headers
    const newPos = todayRows.length + 1; // today header at 0, existing today rows, then this
    content.style.backgroundImage = rowBackgroundForPosition(newPos, newTotal);

    rowEl.style.overflow = 'visible';
    rowEl.style.zIndex = '10';
    listEl.style.backgroundImage = 'none';

    for (const el of toShiftDown) el.style.transition = `transform ${FLY_COMPLETE_MS}ms ease`;
    content.style.transition = '';
    void listEl.offsetHeight;
    for (const el of toShiftDown) el.style.transform = `translateY(${rowH}px)`;
    content.style.transition = `transform ${FLY_COMPLETE_MS}ms ease`;
    content.style.transform = `translateY(${flyDy}px)`;

    window.setTimeout(() => {
      swipeActive = false;
      toggleDone(item.id);
    }, FLY_COMPLETE_MS);
    return;
  }

  const content = rowEl.querySelector<HTMLElement>('.row-content');
  if (!content || !listEl) {
    swipeActive = false;
    toggleDone(item.id);
    return;
  }

  const rowRect = rowEl.getBoundingClientRect();
  const rowH = rowRect.height;

  // Destination: top of done section (adjusted for source removal) or bottom of active content
  const doneSectionEl = listEl.querySelector<HTMLElement>('.done-section');
  let destY: number;
  if (doneSectionEl) {
    // Done section will shift up by rowH when source leaves active area
    destY = doneSectionEl.getBoundingClientRect().top - rowH;
  } else {
    // No done section yet; it appears at bottom of active content after source is removed
    const allBuckets = Array.from(listEl.querySelectorAll<HTMLElement>('.bucket'));
    const lastBucket = allBuckets[allBuckets.length - 1];
    destY = lastBucket ? lastBucket.getBoundingClientRect().bottom - rowH : rowRect.bottom + 20;
  }
  const flyDy = destY - rowRect.top;

  // Apply done styling immediately
  rowEl.classList.add('row-done');
  content.style.background = 'var(--done-bg)';
  rowEl.style.overflow = 'visible';
  rowEl.style.zIndex = '10';

  // Clear list gradient so the bottom of the screen stays dark while the done
  // section container shifts up. Re-render restores it when toggleDone fires.
  listEl.style.backgroundImage = 'none';

  // Elements to shift up: active rows, empty hints, headers after source (excluding done-section rows).
  // .done-section has class "bucket" so .bucket .row would match done rows too — exclude explicitly.
  const shiftEls = Array.from(
    listEl.querySelectorAll<HTMLElement>(
      '.bucket:not(.done-section) .row, .bucket:not(.done-section) .empty-hint, .bucket-header',
    ),
  );
  const srcIdx = shiftEls.indexOf(rowEl);
  const toShift = srcIdx >= 0 ? shiftEls.slice(srcIdx + 1) : [];

  // Done rows counter-shift: container moves up by rowH, rows move down by rowH,
  // net absolute position = 0. This keeps existing done items stationary while
  // the container top opens up to receive the incoming item.
  const doneRows = doneSectionEl
    ? Array.from(doneSectionEl.querySelectorAll<HTMLElement>('.row'))
    : [];

  // Set transitions before reflow so browser records current positions as baseline
  for (const el of toShift) el.style.transition = `transform ${FLY_COMPLETE_MS}ms ease`;
  if (doneSectionEl) doneSectionEl.style.transition = `transform ${FLY_COMPLETE_MS}ms ease`;
  for (const dr of doneRows) dr.style.transition = `transform ${FLY_COMPLETE_MS}ms ease`;
  content.style.transition = '';

  // Force reflow so transitions fire from current positions
  void listEl.offsetHeight;

  // Apply transforms
  for (const el of toShift) el.style.transform = `translateY(-${rowH}px)`;
  if (doneSectionEl) doneSectionEl.style.transform = `translateY(-${rowH}px)`;
  for (const dr of doneRows) dr.style.transform = `translateY(${rowH}px)`;
  content.style.transition = `transform ${FLY_COMPLETE_MS}ms ease`;
  content.style.transform = `translateY(${flyDy}px)`;

  window.setTimeout(() => {
    swipeActive = false;
    toggleDone(item.id);
  }, FLY_COMPLETE_MS);
}

interface DragSlot {
  bucket: Bucket | 'done';
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
  // Done items are visually in the done section (below all active buckets), so
  // treat them as bucket index 3 for header-shift math in applyReflow.
  const srcBucketIdx = item.done ? BUCKET_ORDER.length : BUCKET_ORDER.indexOf(sourceBucket);
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

  // Build slots for the done section at the bottom.
  const doneSectionEl = listEl.querySelector<HTMLElement>('.done-section');
  if (doneSectionEl) {
    const doneRowEls = Array.from(doneSectionEl.querySelectorAll<HTMLElement>('.row'));
    if (doneRowEls.length > 0) {
      const firstRect = doneRowEls[0]!.getBoundingClientRect();
      slots.push({ bucket: 'done', indexInBucket: 0, flatIdx: flatCursor, midY: firstRect.top });
      for (let i = 1; i < doneRowEls.length; i++) {
        const prev = doneRowEls[i - 1]!.getBoundingClientRect();
        const cur = doneRowEls[i]!.getBoundingClientRect();
        slots.push({ bucket: 'done', indexInBucket: i, flatIdx: flatCursor + i, midY: (prev.bottom + cur.top) / 2 });
      }
      const lastRect = doneRowEls[doneRowEls.length - 1]!.getBoundingClientRect();
      slots.push({ bucket: 'done', indexInBucket: doneRowEls.length, flatIdx: flatCursor + doneRowEls.length, midY: lastRect.bottom });
      flatCursor += doneRowEls.length;
    }
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
  let lastTargetBucket: Bucket | 'done' = item.done ? 'done' : sourceBucket;
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

    // Restore hint for the bucket we're leaving (if it was empty)
    if (lastTargetBucket !== 'done') {
      const prevSectionEl = listEl!.querySelector<HTMLElement>(`.bucket[data-bucket="${lastTargetBucket}"]`);
      const prevHint = prevSectionEl?.querySelector<HTMLElement>('.empty-hint');
      if (prevHint) prevHint.style.visibility = '';
    }

    lastTargetFlatIdx = target.flatIdx;
    lastTargetBucket = target.bucket;
    const targetFlatIdx = target.flatIdx;
    // Treat 'done' section as virtual bucket index 3 so header shifts work correctly.
    const tgtBucketIdx = target.bucket === 'done' ? BUCKET_ORDER.length : BUCKET_ORDER.indexOf(target.bucket as Bucket);
    // Empty target bucket: source floats over it — hide the hint and skip reflow.
    const targetBucketEmpty = target.bucket !== 'done' &&
      bucketItems(target.bucket as Bucket).filter((i) => !i.done).length === 0;
    if (targetBucketEmpty) {
      const targetSectionEl = listEl!.querySelector<HTMLElement>(`.bucket[data-bucket="${target.bucket}"]`);
      const targetHint = targetSectionEl?.querySelector<HTMLElement>('.empty-hint');
      if (targetHint) targetHint.style.visibility = 'hidden';
    }

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
        if (target.bucket !== sourceBucket) {
          // Source is the last row; target is an empty bucket below it.
          // Snap to the hint position, accounting for whether source bucket shrinks.
          const targetSection = listEl!.querySelector<HTMLElement>(`.bucket[data-bucket="${target.bucket}"]`);
          const hint = targetSection?.querySelector<HTMLElement>('.empty-hint');
          const hintTop = hint?.getBoundingClientRect().top ?? (originalRowBottoms[sourceFlatIdx]! + sourceHeight);
          finalDy = sourceIdxInBucket > 0
            ? hintTop - sourceHeight - sourceRect.top
            : hintTop - sourceRect.top;
        } else {
          // Adjacent slot, source is the last row overall -- snap to source's own bottom.
          finalDy = originalRowBottoms[sourceFlatIdx]! - sourceRect.top;
        }
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

    const finishT = performance.now();
    const snapTargetY = sourceRect.top + finalDy;
    console.log('[drag:finish]',
      `src=${sourceFlatIdx}(${sourceBucket}[${sourceIdxInBucket}])`,
      `→ tgt=${target.flatIdx}(${target.bucket}[${target.indexInBucket}])`,
      `finalDy=${finalDy.toFixed(0)} snapTargetY=${snapTargetY.toFixed(0)}`
    );

    // Restore all empty-bucket hints before snap (re-render will replace them anyway)
    for (const bucket of BUCKET_ORDER) {
      const sectionEl = listEl!.querySelector<HTMLElement>(`.bucket[data-bucket="${bucket}"]`);
      const hint = sectionEl?.querySelector<HTMLElement>('.empty-hint');
      if (hint) hint.style.visibility = '';
    }

    if (sourceContent) {
      sourceContent.style.transition = `transform ${DRAG_SNAP_MS}ms ease`;
      sourceContent.style.transform = `translateY(${finalDy}px) scale(1.0)`;
      sourceContent.addEventListener('transitionend', () => {
        const r = sourceContent.getBoundingClientRect();
        console.log('[drag:transitionend]',
          `dt=${(performance.now() - finishT).toFixed(0)}ms`,
          `top=${r.top.toFixed(0)} h=${r.height.toFixed(0)}`
        );
      }, { once: true });
    }

    window.setTimeout(() => {
      console.log('[drag:timeout]', `dt=${(performance.now() - finishT).toFixed(0)}ms`);
      dragActive = false;
      lastDragEnd = performance.now();
      commitDrop(target);
    }, DRAG_SNAP_MS);
  }

  function commitDrop(target: DragSlot): void {
    if (target.bucket === 'done') {
      // Reorder within done section — keep item in its original bucket, just change order.
      const remaining = allDoneItems().filter((i) => i.id !== itemId);
      const idx = target.indexInBucket;
      let newOrder: number;
      if (remaining.length === 0) newOrder = 0;
      else if (idx <= 0) newOrder = remaining[0]!.order - 1;
      else if (idx >= remaining.length) newOrder = remaining[remaining.length - 1]!.order + 1;
      else newOrder = (remaining[idx - 1]!.order + remaining[idx]!.order) / 2;
      moveItem(itemId, sourceBucket, newOrder);
      return;
    }

    const noOpSameBucket =
      target.bucket === sourceBucket &&
      (target.indexInBucket === sourceIdxInBucket || target.indexInBucket === sourceIdxInBucket + 1);
    if (noOpSameBucket) {
      scheduleRender();
      return;
    }

    const remaining = bucketItems(target.bucket as Bucket).filter((i) => i.id !== itemId);
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
    moveItem(itemId, target.bucket as Bucket, newOrder);

    // Done item dragged into the active zone becomes undone at the chosen position.
    const activeCount = remaining.filter((i) => !i.done).length;
    if (item?.done && adjustedIdx < activeCount) {
      setDone(itemId, false);
    }
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
