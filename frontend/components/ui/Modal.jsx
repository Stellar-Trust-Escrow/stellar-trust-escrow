/**
 * Modal Component
 *
 * Accessible overlay modal with backdrop dismiss and keyboard (Escape) support.
 *
 * @param {object}         props
 * @param {boolean}        props.isOpen     — controls visibility
 * @param {Function}       props.onClose    — called when backdrop/Escape pressed
 * @param {string}         [props.title]    — modal heading
 * @param {React.ReactNode} props.children
 * @param {'sm'|'md'|'lg'} [props.size='md']
 * @param {boolean}        [props.isConfirmation] — shows confirm/cancel buttons
 * @param {Function}       [props.onConfirm] — called when confirm button clicked
 * @param {string}         [props.confirmLabel='Confirm'] — confirm button text
 * @param {string}         [props.cancelLabel='Cancel'] — cancel button text
 * @param {string}         [props.confirmVariant='primary'] — confirm button variant
 *
 * TODO (contributor — easy, Issue #42):
 * - Add focus-trap so keyboard users can't tab outside the modal
 * - Add enter/exit animation (scale + fade)
 */

'use client';

import { useEffect } from 'react';
import Button from './Button';

const SIZE_CLASSES = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-2xl',
};

export default function Modal({
  isOpen,
  onClose,
  title,
  children,
  size = 'md',
  isConfirmation = false,
  onConfirm,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  confirmVariant = 'primary',
}) {
  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  // Prevent body scroll while open
  useEffect(() => {
    document.body.style.overflow = isOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? 'modal-title' : undefined}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      {/* Panel */}
      <div
        className={`relative w-full ${SIZE_CLASSES[size]} bg-gray-900 border border-gray-800
                    rounded-2xl shadow-2xl p-6 space-y-4`}
      >
        {/* Header */}
        <div className="flex items-start justify-between">
          {title && (
            <h2 id="modal-title" className="text-lg font-semibold text-white">
              {title}
            </h2>
          )}
          <button
            onClick={onClose}
            className="ml-auto text-gray-500 hover:text-white transition-colors p-1 rounded-lg
                       hover:bg-gray-800"
            aria-label="Close modal"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div>{children}</div>

        {/* Footer with Confirmation Buttons */}
        {isConfirmation && (
          <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t border-gray-800">
            <Button variant="secondary" className="flex-1" onClick={onClose}>
              {cancelLabel}
            </Button>
            <Button variant={confirmVariant} className="flex-1" onClick={onConfirm}>
              {confirmLabel}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
