import { addItem, BUCKET_ORDER, bucketItems, deleteItem, editItem, flattenedForRender, state, subscribe } from './state';
import type { Bucket, Item } from './types';
import { rowBackgroundForPosition } from './ui/colors';

const EMPTY_HINTS: Record<Bucket, string> = {
  today: 'Tap to add',
  soon: 'Tap to add',
  later: 'Tap to add',
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

  const statusDot = document.createElement('div');
  statusDot.className = 'status-dot status-dot-idle';
  statusDot.setAttribute('aria-label', 'Sync status');
  app.appendChild(statusDot);

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
  const total = flat.length;
  const indexById = new Map<string, number>();
  flat.forEach((item, i) => indexById.set(item.id, i));

  const next = document.createDocumentFragment();
  for (let b = 0; b < BUCKET_ORDER.length; b++) {
    const bucket = BUCKET_ORDER[b]!;
    next.appendChild(renderBucket(bucket, indexById, total));
    if (b < BUCKET_ORDER.length - 1) {
      const divider = document.createElement('div');
      divider.className = 'divider';
      next.appendChild(divider);
    }
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
  indexById: Map<string, number>,
  total: number,
): HTMLElement {
  const section = document.createElement('section');
  section.className = 'bucket';
  section.dataset.bucket = bucket;

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
    const idx = indexById.get(item.id) ?? 0;
    section.appendChild(renderRow(item, idx, total));
  }
  return section;
}

function renderRow(item: Item, index: number, total: number): HTMLElement {
  const row = document.createElement('div');
  row.className = 'row';
  row.dataset.id = item.id;
  if (item.done) {
    row.classList.add('row-done');
  } else {
    row.style.backgroundImage = rowBackgroundForPosition(index, total);
  }

  if (editingId === item.id) {
    row.appendChild(renderInput(item));
  } else {
    const text = document.createElement('span');
    text.className = 'row-text';
    text.textContent = item.text;
    row.appendChild(text);
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

  const row = target.closest<HTMLElement>('.row');
  if (row) {
    const id = row.dataset.id;
    if (id && editingId !== id) startEdit(id);
    return;
  }

  const emptyBucket = target.closest<HTMLElement>('.bucket-empty');
  if (emptyBucket) {
    const bucket = emptyBucket.dataset.bucket as Bucket | undefined;
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
