import { BUCKET_ORDER, bucketItems, flattenedForRender, subscribe } from './state';
import type { Bucket, Item } from './types';
import { rowBackgroundForPosition } from './ui/colors';

const EMPTY_HINTS: Record<Bucket, string> = {
  today: 'Pull down to add your first item',
  soon: 'Tap to add',
  later: 'Tap to add',
};

let listEl: HTMLElement | null = null;
let rafId: number | null = null;

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

  const text = document.createElement('span');
  text.className = 'row-text';
  text.textContent = item.text;
  row.appendChild(text);
  return row;
}
