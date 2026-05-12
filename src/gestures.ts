const SWIPE_THRESHOLD_PX = 90;
const SCROLL_DOMINANCE = 8;
const TAP_MOVE_LIMIT = 8;
const TAP_TIME_LIMIT = 400;
const SNAP_DURATION_MS = 150;
const COMMIT_DELETE_DURATION_MS = 200;

export interface RowGestureCallbacks {
  onTap: () => void;
  onCompleteCommit: () => void;
  onDeleteCommit: () => void;
}

type Mode = 'idle' | 'tracking' | 'swipe' | 'scroll';

interface VibrateNavigator {
  vibrate?: (pattern: number | number[]) => boolean;
}

function vibrate(pattern: number | number[]): void {
  try {
    (navigator as VibrateNavigator).vibrate?.(pattern);
  } catch {
    /* unsupported */
  }
}

export function attachRowGestures(row: HTMLElement, callbacks: RowGestureCallbacks): void {
  const content = row.querySelector<HTMLElement>('.row-content');
  if (!content) return;

  let startX = 0;
  let startY = 0;
  let startTime = 0;
  let mode: Mode = 'idle';
  let currentDx = 0;
  let captured = false;
  let pastThreshold = false;

  function release(pointerId: number): void {
    if (!captured) return;
    try {
      row.releasePointerCapture(pointerId);
    } catch {
      /* already released */
    }
    captured = false;
  }

  function setPastThreshold(value: boolean): void {
    if (value === pastThreshold) return;
    pastThreshold = value;
    if (value) {
      row.classList.add('past-threshold');
      vibrate(10);
    } else {
      row.classList.remove('past-threshold');
      vibrate([3, 3, 3]);
    }
  }

  function applyVisualForDx(dx: number): void {
    content!.style.transform = `translateX(${dx}px)`;
    if (dx > 0) {
      row.classList.add('show-complete');
      row.classList.remove('show-delete');
      setPastThreshold(dx > SWIPE_THRESHOLD_PX);
    } else if (dx < 0) {
      row.classList.add('show-delete');
      row.classList.remove('show-complete');
      setPastThreshold(dx < -SWIPE_THRESHOLD_PX);
    } else {
      row.classList.remove('show-complete', 'show-delete');
      setPastThreshold(false);
    }
  }

  function clearTransform(): void {
    content!.style.transform = '';
    content!.style.transition = '';
    row.classList.remove('show-complete', 'show-delete', 'past-threshold');
    pastThreshold = false;
  }

  function snapBack(pointerId: number): void {
    release(pointerId);
    content!.style.transition = `transform ${SNAP_DURATION_MS}ms ease`;
    content!.style.transform = 'translateX(0)';
    row.classList.remove('past-threshold');
    pastThreshold = false;
    window.setTimeout(clearTransform, SNAP_DURATION_MS);
  }

  function commitComplete(pointerId: number): void {
    release(pointerId);
    content!.style.transition = `transform ${SNAP_DURATION_MS}ms ease`;
    content!.style.transform = 'translateX(0)';
    window.setTimeout(() => callbacks.onCompleteCommit(), SNAP_DURATION_MS);
  }

  function commitDelete(pointerId: number): void {
    release(pointerId);
    const h = row.offsetHeight;
    row.style.height = `${h}px`;
    void row.offsetHeight;
    row.style.transition = `height ${COMMIT_DELETE_DURATION_MS}ms ease, opacity ${COMMIT_DELETE_DURATION_MS}ms ease`;
    row.style.height = '0';
    row.style.opacity = '0';
    window.setTimeout(() => callbacks.onDeleteCommit(), COMMIT_DELETE_DURATION_MS);
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
      if (currentDx > SWIPE_THRESHOLD_PX) {
        mode = 'idle';
        commitComplete(e.pointerId);
        return;
      }
      if (currentDx < -SWIPE_THRESHOLD_PX) {
        mode = 'idle';
        commitDelete(e.pointerId);
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
      release(e.pointerId);
    }
    mode = 'idle';
  });
}
