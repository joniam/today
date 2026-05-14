const SWIPE_THRESHOLD_PX = 70;
const SCROLL_DOMINANCE = 8;
const TAP_MOVE_LIMIT = 8;
const TAP_TIME_LIMIT = 400;
const SNAP_DURATION_MS = 150;
const COMMIT_DELETE_DURATION_MS = 200;
const LONG_PRESS_MS = 300;
const LONG_PRESS_MOVE_TOLERANCE = 8;

const PULL_THRESHOLD_PX = 80;
const PULL_MAX_PX = 52;
const PULL_SNAP_MS = 150;

export interface RowGestureCallbacks {
  onTap: () => void;
  onCompleteCommit: () => void;
  onDeleteCommit: () => void;
  onLongPress: (pointerId: number, clientX: number, clientY: number) => void;
}

type Mode = 'idle' | 'tracking' | 'swipe' | 'scroll' | 'long-press';

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

export function initPullToAdd(
  container: HTMLElement,
  isLocked: () => boolean,
  onCommit: () => void,
): void {
  const content = container.querySelector<HTMLElement>('.pull-row-content');

  let active = false;
  let startX = 0;
  let startY = 0;
  let pullDist = 0;
  let committed = false;

  function cleanup(): void {
    document.removeEventListener('touchmove', onTouchMove);
    active = false;
    committed = false;
    pullDist = 0;
  }

  function snapBack(then?: () => void): void {
    container.style.transition = `height ${PULL_SNAP_MS}ms ease`;
    container.style.height = '0';
    if (content) content.style.opacity = '';
    container.classList.remove('pull-past-threshold');
    window.setTimeout(() => {
      container.style.transition = '';
      if (then) then();
    }, PULL_SNAP_MS);
  }

  function cancel(): void {
    if (!active) return;
    const wasCommitted = committed;
    cleanup();
    if (wasCommitted) snapBack();
  }

  function onTouchStart(e: TouchEvent): void {
    if (isLocked()) return;
    if (window.scrollY !== 0) return;
    if (e.touches.length !== 1) return;
    active = true;
    committed = false;
    pullDist = 0;
    startX = e.touches[0]!.clientX;
    startY = e.touches[0]!.clientY;
    document.addEventListener('touchmove', onTouchMove, { passive: false });
  }

  function onTouchMove(e: TouchEvent): void {
    if (!active) return;
    if (e.touches.length !== 1) { cancel(); return; }
    const touch = e.touches[0]!;
    const dx = Math.abs(touch.clientX - startX);
    const dy = touch.clientY - startY;
    if ((dx > 8 && dx > dy) || dy < -4) { cancel(); return; }
    if (dy > 0) {
      e.preventDefault();
      committed = true;
      const prev = pullDist;
      pullDist = dy;
      container.style.height = `${Math.min(dy * 0.65, PULL_MAX_PX)}px`;
      if (content) {
        content.style.opacity = String(Math.min((dy / PULL_THRESHOLD_PX) * 1.2, 1));
      }
      if (prev < PULL_THRESHOLD_PX && pullDist >= PULL_THRESHOLD_PX) {
        container.classList.add('pull-past-threshold');
        vibrate(10);
      } else if (prev >= PULL_THRESHOLD_PX && pullDist < PULL_THRESHOLD_PX) {
        container.classList.remove('pull-past-threshold');
        vibrate([3, 3, 3]);
      }
    }
  }

  function onTouchEnd(): void {
    if (!active) return;
    if (!committed) { cleanup(); return; }
    const dist = pullDist;
    cleanup();
    if (dist >= PULL_THRESHOLD_PX) {
      snapBack(() => onCommit());
    } else {
      snapBack();
    }
  }

  document.addEventListener('touchstart', onTouchStart, { passive: true });
  document.addEventListener('touchend', onTouchEnd, { passive: true });
  document.addEventListener('touchcancel', cancel, { passive: true });
}

export function attachRowGestures(row: HTMLElement, callbacks: RowGestureCallbacks): void {
  const content = row.querySelector<HTMLElement>('.row-content');
  if (!content) return;

  row.addEventListener('contextmenu', (e) => e.preventDefault());

  let startX = 0;
  let startY = 0;
  let startTime = 0;
  let mode: Mode = 'idle';
  let currentDx = 0;
  let captured = false;
  let pastThreshold = false;
  let longPressTimer: number | null = null;

  function cancelLongPress(): void {
    if (longPressTimer !== null) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }
  }

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
    if (dx > SWIPE_THRESHOLD_PX) {
      // Past complete threshold: lock content at threshold position.
      content!.style.transform = `translateX(${SWIPE_THRESHOLD_PX}px)`;
      row.classList.add('show-complete');
      row.classList.remove('show-delete');
      setPastThreshold(true);
    } else if (dx > 0) {
      content!.style.transform = `translateX(${dx}px)`;
      row.classList.add('show-complete');
      row.classList.remove('show-delete');
      setPastThreshold(false);
    } else if (dx < -SWIPE_THRESHOLD_PX) {
      content!.style.transform = `translateX(${-SWIPE_THRESHOLD_PX}px)`;
      row.classList.add('show-delete');
      row.classList.remove('show-complete');
      setPastThreshold(true);
    } else if (dx < 0) {
      content!.style.transform = `translateX(${dx}px)`;
      row.classList.add('show-delete');
      row.classList.remove('show-complete');
      setPastThreshold(false);
    } else {
      content!.style.transform = 'translateX(0)';
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
    const pointerId = e.pointerId;
    const initialX = e.clientX;
    const initialY = e.clientY;
    cancelLongPress();
    longPressTimer = window.setTimeout(() => {
      longPressTimer = null;
      if (mode !== 'tracking') return;
      mode = 'long-press';
      callbacks.onLongPress(pointerId, initialX, initialY);
    }, LONG_PRESS_MS);
  });

  row.addEventListener('pointermove', (e: PointerEvent) => {
    if (mode === 'idle' || mode === 'scroll' || mode === 'long-press') return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;

    if (mode === 'tracking') {
      if (Math.abs(dx) > LONG_PRESS_MOVE_TOLERANCE || Math.abs(dy) > LONG_PRESS_MOVE_TOLERANCE) {
        cancelLongPress();
      }
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
    cancelLongPress();
    const elapsed = e.timeStamp - startTime;

    if (mode === 'long-press') {
      // Drag controller owns the pointer release; nothing to do here.
      return;
    }

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
    cancelLongPress();
    if (mode === 'long-press') {
      return;
    }
    if (mode === 'swipe') {
      snapBack(e.pointerId);
    } else {
      clearTransform();
      release(e.pointerId);
    }
    mode = 'idle';
  });
}
