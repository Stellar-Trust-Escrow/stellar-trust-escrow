'use client';

/**
 * BottomSheet — mobile-first bottom-sheet drawer (Issue #1444).
 *
 * On small screens (< 768px) dialogs and modals must render as a bottom sheet:
 *   - slides up from the bottom
 *   - max height 85vh, scrollable content
 *   - a drag handle at the top
 *   - swipe down on the handle/content to dismiss
 *   - tap on the backdrop to dismiss
 *
 * The component is intentionally dependency-free (no framer-motion) — motion is
 * driven by CSS transforms + transitions so it stays light and tree-shakeable.
 *
 * @param {object}         props
 * @param {boolean}        props.isOpen        — controls visibility
 * @param {Function}       props.onClose       — called on backdrop tap / swipe-down / close button
 * @param {string}         [props.title]       — sheet heading
 * @param {React.ReactNode} props.children
 * @param {string}         [props.maxHeight='85vh']
 * @param {string}         [props.className]
 */

import { useEffect, useRef, useState } from 'react';
import { useSwipeGesture } from '../../hooks/useSwipeGesture';

export default function BottomSheet({
  isOpen,
  onClose,
  title,
  children,
  maxHeight = '85vh',
  className = '',
}) {
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  const { offset, bind } = useSwipeGesture({
    axis: 'y',
    threshold: 0.35,
    onSwipeDown: () => closeRef.current?.(),
  });

  useEffect(() => {
    if (isOpen) {
      setMounted(true);
      // Next frame so the enter transition runs.
      const raf = requestAnimationFrame(() => setVisible(true));
      document.body.style.overflow = 'hidden';
      return () => cancelAnimationFrame(raf);
    }

    setVisible(false);
    document.body.style.overflow = '';
    const timer = setTimeout(() => setMounted(false), 300);
    return () => clearTimeout(timer);
  }, [isOpen]);

  // Close on Escape.
  useEffect(() => {
    if (!isOpen) return undefined;
    const handler = (event) => {
      if (event.key === 'Escape') closeRef.current?.();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen]);

  if (!mounted) return null;

  const sheetTransform = offset ? `translateY(${offset}px)` : undefined;

  return (
    <div className="fixed inset-0 z-50" role="presentation">
      {/* Backdrop — tap to dismiss */}
      <div
        aria-hidden="true"
        onClick={() => closeRef.current?.()}
        className={`absolute inset-0 bg-black/70 transition-opacity duration-300 ${
          visible ? 'opacity-100' : 'opacity-0'
        }`}
      />

      {/* Sheet */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title || 'Bottom sheet'}
        className={`absolute bottom-0 left-0 right-0 mx-auto w-full sm:max-w-md
                    bg-gray-900 border-t border-gray-800 rounded-t-2xl shadow-2xl
                    flex flex-col transition-transform duration-300 ease-out
                    ${visible ? 'translate-y-0' : 'translate-y-full'} ${className}`}
        style={{ maxHeight, transform: sheetTransform }}
      >
        {/* Drag handle — swipe down here to dismiss */}
        <div
          {...bind}
          data-testid="bottom-sheet-handle"
          className="flex justify-center pt-3 pb-2 cursor-grab touch-none select-none active:cursor-grabbing"
          aria-hidden="true"
        >
          <span className="block w-10 h-1.5 rounded-full bg-gray-600" />
        </div>

        {/* Header */}
        {title && (
          <div className="flex items-center justify-between px-4 pb-2">
            <h2 className="text-base font-semibold text-white">{title}</h2>
            <button
              type="button"
              onClick={() => closeRef.current?.()}
              aria-label="Close"
              className="min-h-touch min-w-touch flex items-center justify-center rounded-lg text-gray-500 hover:text-white hover:bg-gray-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
            >
              ✕
            </button>
          </div>
        )}

        {/* Scrollable content */}
        <div
          className="overflow-y-auto px-4 pb-6 pt-2"
          style={{ WebkitOverflowScrolling: 'touch', touchAction: 'pan-y' }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
