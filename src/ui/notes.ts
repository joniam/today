import { editItemNotes } from '../state';
import type { Item } from '../types';

export function initNoteSheet(mount: HTMLElement): (item: Item) => void {
  const themeColorMeta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  const defaultThemeColor = themeColorMeta?.getAttribute('content') ?? '#c0392b';

  const backdrop = document.createElement('div');
  backdrop.className = 'note-sheet-backdrop';

  const sheet = document.createElement('div');
  sheet.className = 'note-sheet';

  const header = document.createElement('div');
  header.className = 'note-sheet-header';

  const title = document.createElement('div');
  title.className = 'note-sheet-title';

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'sync-debug-close';
  closeBtn.textContent = '×';
  closeBtn.setAttribute('aria-label', 'Close');
  closeBtn.addEventListener('click', close);

  header.appendChild(title);
  header.appendChild(closeBtn);

  const body = document.createElement('div');
  body.className = 'note-sheet-body';

  const textarea = document.createElement('textarea');
  textarea.className = 'note-sheet-textarea';
  textarea.placeholder = 'Add notes...';
  textarea.setAttribute('autocapitalize', 'sentences');
  textarea.spellcheck = true;
  body.appendChild(textarea);

  const footer = document.createElement('div');
  footer.className = 'note-sheet-footer';

  const saveBtn = document.createElement('button');
  saveBtn.type = 'button';
  saveBtn.className = 'auth-btn-primary';
  saveBtn.textContent = 'Save';

  const deleteBtn = document.createElement('button');
  deleteBtn.type = 'button';
  deleteBtn.className = 'auth-btn-secondary';
  deleteBtn.textContent = 'Delete note';

  footer.appendChild(saveBtn);
  footer.appendChild(deleteBtn);

  sheet.appendChild(header);
  sheet.appendChild(body);
  sheet.appendChild(footer);
  backdrop.appendChild(sheet);
  mount.appendChild(backdrop);

  // Block gestures from reaching the list behind the sheet.
  for (const el of [backdrop, sheet]) {
    el.addEventListener('pointerdown', (e) => e.stopPropagation());
    el.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true });
    el.addEventListener('touchend', (e) => e.stopPropagation(), { passive: true });
    el.addEventListener('touchcancel', (e) => e.stopPropagation(), { passive: true });
  }
  for (const el of [backdrop, sheet]) {
    el.addEventListener('touchmove', (e) => {
      e.stopPropagation();
      // Allow native scroll only on the textarea itself; prevent everything else
      // (including textarea boundary rubber-band) from reaching the list.
      if (e.target !== textarea) {
        e.preventDefault();
      } else {
        const atTop = textarea.scrollTop <= 0;
        const atBottom = textarea.scrollTop + textarea.clientHeight >= textarea.scrollHeight - 1;
        if (atTop || atBottom) e.preventDefault();
      }
    }, { passive: false });
  }

  let currentItemId: string | null = null;
  let deleteArmed = false;

  function armDelete(): void {
    deleteArmed = true;
    saveBtn.textContent = 'Cancel';
    saveBtn.className = 'auth-btn-secondary';
    deleteBtn.textContent = 'Confirm';
    deleteBtn.className = 'auth-btn-danger';
  }

  function resetDelete(): void {
    deleteArmed = false;
    saveBtn.textContent = 'Save';
    saveBtn.className = 'auth-btn-primary';
    deleteBtn.textContent = 'Delete note';
    deleteBtn.className = 'auth-btn-secondary';
  }

  function close(): void {
    resetDelete();
    backdrop.classList.remove('open');
    document.documentElement.classList.remove('sheet-open');
    currentItemId = null;
    if (themeColorMeta) themeColorMeta.setAttribute('content', defaultThemeColor);
  }

  function save(): void {
    if (deleteArmed) { resetDelete(); return; }
    if (!currentItemId) return;
    editItemNotes(currentItemId, textarea.value);
    close();
  }

  function deleteNote(): void {
    if (!deleteArmed) { armDelete(); return; }
    if (!currentItemId) return;
    editItemNotes(currentItemId, '');
    close();
  }

  saveBtn.addEventListener('click', save);
  deleteBtn.addEventListener('click', deleteNote);

  textarea.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      if (deleteArmed) { resetDelete(); return; }
      close();
    }
  });

  backdrop.addEventListener('click', (e) => {
    e.stopPropagation();
    if (e.target === backdrop) close();
  });

  return (item: Item) => {
    currentItemId = item.id;
    resetDelete();
    title.textContent = item.text;
    textarea.value = item.notes ?? '';
    deleteBtn.style.display = item.notes ? '' : 'none';
    backdrop.classList.add('open');
    document.documentElement.classList.add('sheet-open');
    if (themeColorMeta) themeColorMeta.setAttribute('content', '#0a0a0a');
    requestAnimationFrame(() => textarea.focus());
  };
}
