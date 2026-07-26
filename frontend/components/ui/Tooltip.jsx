/**
 * Tooltip Component
 *
 * Floating text panel on hover/focus with auto-positioning,
 * viewport edge detection, and accessible ARIA wiring.
 *
 * @param {object}   props
 * @param {React.ReactNode} props.children - Trigger element
 * @param {string}   props.content - Tooltip content
 * @param {string}   [props.position='top'] - Preferred position (top/bottom/left/right)
 */

'use client';

import { useState, useRef, useCallback, useEffect, useLayoutEffect, useId } from 'react';

const SHOW_DELAY_MS = 300;
const PADDING = 8;

const POSITION_CLASSES = {
  top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
  bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
  left: 'right-full top-1/2 -translate-y-1/2 mr-2',
  right: 'left-full top-1/2 -translate-y-1/2 ml-2',
};

const ARROW_CLASSES = {
  top: 'top-full left-1/2 -translate-x-1/2 border-t-gray-800 border-x-transparent border-b-transparent',
  bottom: 'bottom-full left-1/2 -translate-x-1/2 border-b-gray-800 border-x-transparent border-t-transparent',
  left: 'left-full top-1/2 -translate-y-1/2 border-l-gray-800 border-y-transparent border-r-transparent',
  right: 'right-full top-1/2 -translate-y-1/2 border-r-gray-800 border-y-transparent border-l-transparent',
};

export default function Tooltip({ children, content, position: preferredPosition = 'top' }) {
  const [isVisible, setIsVisible] = useState(false);
  const [flippedPosition, setFlippedPosition] = useState(preferredPosition);
  const showTimerRef = useRef(null);
  const tooltipRef = useRef(null);
  const triggerRef = useRef(null);
  const tooltipId = useId();

  const actualPosition = flippedPosition;

  const clearShowTimer = useCallback(() => {
    if (showTimerRef.current) {
      clearTimeout(showTimerRef.current);
      showTimerRef.current = null;
    }
  }, []);

  const hide = useCallback(() => {
    clearShowTimer();
    setIsVisible(false);
  }, [clearShowTimer]);

  const show = useCallback(() => {
    clearShowTimer();
    showTimerRef.current = setTimeout(() => {
      setIsVisible(true);
    }, SHOW_DELAY_MS);
  }, [clearShowTimer]);

  // Detect viewport edges and flip position (useLayoutEffect to avoid flash)
  useLayoutEffect(() => {
    if (!isVisible || !tooltipRef.current || !triggerRef.current) return;

    const tooltipRect = tooltipRef.current.getBoundingClientRect();
    const triggerRect = triggerRef.current.getBoundingClientRect();
    const viewportW = window.innerWidth;
    const viewportH = window.innerHeight;

    let bestPosition = preferredPosition;
    const overflowingTop = tooltipRect.top < PADDING;
    const overflowingBottom = tooltipRect.bottom > viewportH - PADDING;
    const overflowingLeft = tooltipRect.left < PADDING;
    const overflowingRight = tooltipRect.right > viewportW - PADDING;

    const opposites = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' };

    if (preferredPosition === 'top' && overflowingTop && !overflowingBottom) {
      bestPosition = 'bottom';
    } else if (preferredPosition === 'bottom' && overflowingBottom && !overflowingTop) {
      bestPosition = 'top';
    } else if (preferredPosition === 'left' && overflowingLeft && !overflowingRight) {
      bestPosition = 'right';
    } else if (preferredPosition === 'right' && overflowingRight && !overflowingLeft) {
      bestPosition = 'left';
    }

    // If the opposite side also overflows, try the next best
    if (
      (bestPosition === opposites[preferredPosition] &&
        ((bestPosition === 'top' && overflowingTop) ||
          (bestPosition === 'bottom' && overflowingBottom) ||
          (bestPosition === 'left' && overflowingLeft) ||
          (bestPosition === 'right' && overflowingRight)))
    ) {
      const horizontal = ['left', 'right'];
      const vertical = ['top', 'bottom'];
      const pool = (horizontal.includes(preferredPosition) ? vertical : horizontal).filter(
        (p) => p !== bestPosition,
      );
      bestPosition = pool[0] || bestPosition;
    }

    setFlippedPosition(bestPosition);
  }, [isVisible, preferredPosition]);

  // Hide on Escape
  useEffect(() => {
    if (!isVisible) return;
    const handler = (e) => {
      if (e.key === 'Escape') hide();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isVisible, hide]);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => clearShowTimer();
  }, [clearShowTimer]);

  return (
    <div className="relative inline-block">
      <div
        ref={triggerRef}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocusCapture={show}
        onBlurCapture={hide}
        aria-describedby={isVisible ? tooltipId : undefined}
      >
        {children}
      </div>

      <div
        ref={tooltipRef}
        id={tooltipId}
        role="tooltip"
        aria-hidden={!isVisible}
        className={`absolute z-50 bg-gray-800 text-white text-xs rounded-lg px-3 py-2 whitespace-nowrap
                     border border-gray-700 shadow-lg pointer-events-none
                     transition-opacity duration-150
                     ${POSITION_CLASSES[actualPosition]}
                     ${isVisible ? 'opacity-100' : 'opacity-0 invisible'}`}
      >
        {content}
        <div
          className={`absolute border-4 ${ARROW_CLASSES[actualPosition]}`}
          aria-hidden="true"
        />
      </div>
    </div>
  );
}
