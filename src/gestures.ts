const SWIPE_THRESHOLD_RATIO = 0.4;
const SCROLL_DOMINANCE = 8;
const TAP_MOVE_LIMIT = 8;
const TAP_TIME_LIMIT = 400;
const SNAP_DURATION_MS = 150;

export interface RowGestureCallbacks {
  onTap: () => void;
  onCompleteCommit: () => void;
  onDeleteCommit: () => void;
}

type Mode = 'idle' | 'tracking' | 'swipe' | 'scroll';

export function attachRowGestures(row: HTMLElement, callbacks: RowGestureCallbacks): void {
  const content = row.querySelector<HTMLElement>('.row-content');
  if (!content) return;

  let startX = 0;
  let startY = 0;
  let startTime = 0;
  let mode: Mode = 'idle';
  let currentDx = 0;
  let captured = false;

  function clearTransform(): void {
    content!.style.transform = '';
    content!.style.transition = '';
    row.classList.remove('show-complete', 'show-delete');
  }

  function snapBack(pointerId: number | null): void {
    if (captured && pointerId !== null) {
      try {
        row.releasePointerCapture(pointerId);
      } catch {
        /* already released */
      }
      captured = false;
    }
    content!.style.transition = `transform ${SNAP_DURATION_MS}ms ease`;
    content!.style.transform = 'translateX(0)';
    window.setTimeout(clearTransform, SNAP_DURATION_MS);
  }

  function applyVisualForDx(dx: number): void {
    content!.style.transform = `translateX(${dx}px)`;
    if (dx > 0) {
      row.classList.add('show-complete');
      row.classList.remove('show-delete');
    } else if (dx < 0) {
      row.classList.add('show-delete');
      row.classList.remove('show-complete');
    } else {
      row.classList.remove('show-complete', 'show-delete');
    }
  }

  row.addEventListener('pointerdown', (e: PointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if ((e.target as Element).closest('.row-input')) return;
    startX = e.clientX;
    startY = e.clientY;
    startTime = e.timeStamp;
    mode = 'tracking';
    currentDx = 0;
    captured = false;
    content.style.transition = '';
  });

  row.addEventListener('pointermove', (e: PointerEvent) => {
    if (mode === 'idle' || mode === 'scroll') return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;

    if (mode === 'tracking') {
      if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > SCROLL_DOMINANCE) {
        mode = 'scroll';
        return;
      }
      if (Math.abs(dx) > TAP_MOVE_LIMIT) {
        mode = 'swipe';
        try {
          row.setPointerCapture(e.pointerId);
          captured = true;
        } catch {
          /* capture failed; continue without */
        }
      } else {
        return;
      }
    }

    if (mode === 'swipe') {
      e.preventDefault();
      currentDx = dx;
      applyVisualForDx(dx);
    }
  });

  row.addEventListener('pointerup', (e: PointerEvent) => {
    const elapsed = e.timeStamp - startTime;

    if (mode === 'tracking' && elapsed < TAP_TIME_LIMIT) {
      mode = 'idle';
      callbacks.onTap();
      return;
    }

    if (mode === 'swipe') {
      const threshold = row.offsetWidth * SWIPE_THRESHOLD_RATIO;
      if (currentDx > threshold) {
        mode = 'idle';
        if (captured) {
          try {
            row.releasePointerCapture(e.pointerId);
          } catch {
            /* already released */
          }
          captured = false;
        }
        callbacks.onCompleteCommit();
        return;
      }
      if (currentDx < -threshold) {
        mode = 'idle';
        if (captured) {
          try {
            row.releasePointerCapture(e.pointerId);
          } catch {
            /* already released */
          }
          captured = false;
        }
        callbacks.onDeleteCommit();
        return;
      }
      snapBack(e.pointerId);
    }
    mode = 'idle';
  });

  row.addEventListener('pointercancel', (e: PointerEvent) => {
    if (mode === 'swipe') {
      snapBack(e.pointerId);
    } else {
      clearTransform();
      if (captured) {
        try {
          row.releasePointerCapture(e.pointerId);
        } catch {
          /* already released */
        }
        captured = false;
      }
    }
    mode = 'idle';
  });
}
