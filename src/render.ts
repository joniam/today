import { attachRowGestures } from './gestures';
import { addItem, BUCKET_ORDER, bucketItems, deleteItem, editItem, flattenedForRender, state, subscribe, toggleDone } from './state';
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

let listEl: HTMLElement | null = null;
let rafId: number | null = null;
let editingId: string | null = null;

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

function cssEscape(value: string): string {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
    return CSS.escape(value);
  }
  return value.replace(/["\\]/g, '\\$&');
}
