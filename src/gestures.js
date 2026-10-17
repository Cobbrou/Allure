import { useEffect, useState } from 'react';

// Touch gestures of a native app shell: swipe from the left edge to go back, pull the
// feed down to refresh. Touch only: mouse users have the back button and reloads.

const EDGE = 24; // px from the left edge where a back swipe can start
const BACK_AT = 90; // px dragged to go back on release
const PULL_AT = 70; // px pulled to refresh on release
const PULL_MAX = 110;

/** While `enabled`, a horizontal swipe from the left edge drags the page and calls onBack. */
export function useEdgeSwipeBack(enabled, onBack) {
  useEffect(() => {
    if (!enabled) return;
    let s = null; // { x, y, dx, locked }
    // Header and page move together; the fixed tab bar stays (a transform would unpin it).
    const parts = () => document.querySelectorAll('.app > header, .app > main');
    const drag = (x, animate) => parts().forEach((el) => {
      el.style.transition = animate ? 'transform 0.2s ease' : 'none';
      el.style.transform = x ? `translateX(${x}px)` : '';
    });
    const start = (e) => {
      const t = e.touches[0];
      s = t.clientX <= EDGE && e.touches.length === 1 ? { x: t.clientX, y: t.clientY, dx: 0, locked: false } : null;
    };
    const move = (e) => {
      if (!s) return;
      const t = e.touches[0], dx = t.clientX - s.x, dy = t.clientY - s.y;
      if (!s.locked) {
        if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) { s = null; return; } // a scroll
        if (dx < 10) return;
        s.locked = true;
      }
      s.dx = Math.max(0, dx);
      drag(s.dx * 0.7);
    };
    const end = () => {
      if (!s?.locked) { s = null; return; }
      const go = s.dx > BACK_AT;
      s = null;
      drag(0, !go);
      if (go) onBack();
    };
    addEventListener('touchstart', start, { passive: true });
    addEventListener('touchmove', move, { passive: true });
    addEventListener('touchend', end);
    addEventListener('touchcancel', end);
    return () => {
      removeEventListener('touchstart', start);
      removeEventListener('touchmove', move);
      removeEventListener('touchend', end);
      removeEventListener('touchcancel', end);
      drag(0);
    };
  }, [enabled, onBack]);
}

/**
 * Pull down from the top of the page to call onRefresh (async). Returns { pull, busy }:
 * pull is the indicator height in px.
 */
export function usePullToRefresh(onRefresh) {
  const [pull, setPull] = useState(0);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let y0 = null, last = 0;
    const start = (e) => { y0 = scrollY <= 0 && e.touches.length === 1 ? e.touches[0].clientY : null; };
    const move = (e) => {
      if (y0 == null) return;
      const dy = e.touches[0].clientY - y0;
      if (dy <= 0) { setPull((last = 0)); return; }
      setPull((last = Math.min(PULL_MAX, dy * 0.5)));
    };
    const end = async () => {
      if (y0 == null) return;
      y0 = null;
      if (last < PULL_AT) { setPull((last = 0)); return; }
      setBusy(true);
      setPull(PULL_AT * 0.7);
      try { await onRefresh(); } finally { setBusy(false); setPull((last = 0)); }
    };
    addEventListener('touchstart', start, { passive: true });
    addEventListener('touchmove', move, { passive: true });
    addEventListener('touchend', end);
    return () => {
      removeEventListener('touchstart', start);
      removeEventListener('touchmove', move);
      removeEventListener('touchend', end);
    };
  }, [onRefresh]);
  return { pull, busy, ready: pull >= PULL_AT };
}
