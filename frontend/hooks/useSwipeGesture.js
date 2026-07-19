'use client';

/**
 * useSwipeGesture — lightweight, dependency-free swipe/pan gesture hook.
 *
 * Built on the Pointer Events API (works for touch, mouse and pen) so it does
 * not require `@use-gesture/react` or any external gesture library. It is used
 * for:
 *   - swipe-to-action on list items (axis: 'x')
 *   - swipe-to-dismiss on bottom-sheet drawers (axis: 'y')
 *
 * The hook tracks a live `offset` (px) while the pointer is down and, on
 * release, decides whether the gesture crossed the `threshold` (a fraction of
 * the element's width for x, or height for y). If it did, the matching
 * `onSwipeLeft` / `onSwipeRight` / `onSwipeDown` callback fires; otherwise the
 * offset snaps back to 0.
 *
 * @param {object}   options
 * @param {Function} [options.onSwipeLeft]   — fired when swiped past threshold to the left (x)
 * @param {Function} [options.onSwipeRight]  — fired when swiped past threshold to the right (x)
 * @param {Function} [options.onSwipeDown]   — fired when swiped down past threshold (y)
 * @param {'x'|'y'}  [options.axis='x']      — gesture axis
 * @param {number}   [options.threshold=0.4] — fraction of size required to commit the swipe
 * @returns {{ offset: number, swiping: boolean, bind: object }}
 */

import { useCallback, useRef, useState } from 'react';

export function useSwipeGesture({
  onSwipeLeft,
  onSwipeRight,
  onSwipeDown,
  axis = 'x',
  threshold = 0.4,
} = {}) {
  const [offset, setOffset] = useState(0);
  const [swiping, setSwiping] = useState(false);
  const start = useRef(null);

  const sizeOf = useCallback(
    (el) => (axis === 'x' ? el.getBoundingClientRect().width : el.getBoundingClientRect().height),
    [axis],
  );

  const onPointerDown = useCallback(
    (event) => {
      const el = event.currentTarget;
      start.current = {
        x: event.clientX,
        y: event.clientY,
        size: sizeOf(el),
      };
      setSwiping(true);
    },
    [sizeOf],
  );

  const onPointerMove = useCallback(
    (event) => {
      if (!start.current) return;
      const dx = event.clientX - start.current.x;
      const dy = event.clientY - start.current.y;
      // Only track the configured axis. For vertical dismiss we ignore upward
      // movement so the sheet content can still scroll.
      if (axis === 'x') {
        setOffset(dx);
      } else if (dy > 0) {
        setOffset(dy);
      }
    },
    [axis],
  );

  const onPointerUp = useCallback(
    (event) => {
      if (!start.current) return;
      const dx = event.clientX - start.current.x;
      const dy = event.clientY - start.current.y;
      const size = start.current.size;
      const limit = size * threshold;

      setSwiping(false);
      start.current = null;

      if (axis === 'x') {
        if (dx <= -limit && typeof onSwipeLeft === 'function') {
          onSwipeLeft();
        } else if (dx >= limit && typeof onSwipeRight === 'function') {
          onSwipeRight();
        }
        setOffset(0);
        return;
      }

      if (dy >= limit && typeof onSwipeDown === 'function') {
        onSwipeDown();
      }
      setOffset(0);
    },
    [axis, threshold, onSwipeLeft, onSwipeRight, onSwipeDown],
  );

  const onPointerCancel = useCallback(
    (event) => {
      setSwiping(false);
      start.current = null;
      setOffset(0);
    },
    [],
  );

  const bind = { onPointerDown, onPointerMove, onPointerUp, onPointerCancel };

  return { offset, swiping, bind };
}

export default useSwipeGesture;
