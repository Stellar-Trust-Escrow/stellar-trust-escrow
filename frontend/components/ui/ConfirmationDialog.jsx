'use client';

import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

export default function ConfirmationDialog({
  isOpen,
  title,
  description,
  details,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  isDangerous = false,
  onConfirm,
  onCancel,
}) {
  const cancelRef = useRef(null);
  const confirmRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      cancelRef.current?.focus();
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onCancel?.();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onCancel]);

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
        aria-describedby="dialog-description"
        className="bg-white rounded-lg shadow-2xl p-6 max-w-md w-full mx-4"
        data-testid="confirmation-dialog"
      >
        {/* Title */}
        <h2 id="dialog-title" className="text-lg font-bold text-gray-900 mb-2">
          {title}
        </h2>

        {/* Description */}
        <p id="dialog-description" className="text-sm text-gray-600 mb-4">
          {description}
        </p>

        {/* Details */}
        {details && (
          <div className="bg-gray-50 rounded-lg p-4 mb-6 text-sm space-y-2">
            {Object.entries(details).map(([key, value]) => (
              <div key={key} className="flex justify-between">
                <span className="text-gray-600">{key}:</span>
                <span className="font-mono text-gray-900 break-all">{value}</span>
              </div>
            ))}
          </div>
        )}

        {/* Warning for dangerous actions */}
        {isDangerous && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-6">
            <p className="text-xs text-red-700 font-medium">
              ⚠️ This action cannot be undone.
            </p>
          </div>
        )}

        {/* Buttons */}
        <div className="flex gap-3 justify-end">
          <button
            ref={cancelRef}
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors focus-visible:ring-2 focus-visible:ring-gray-400"
            data-testid="cancel-button"
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            onClick={onConfirm}
            className={`px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors focus-visible:ring-2 ${
              isDangerous
                ? 'bg-red-600 hover:bg-red-700 focus-visible:ring-red-400'
                : 'bg-indigo-600 hover:bg-indigo-700 focus-visible:ring-indigo-400'
            }`}
            data-testid="confirm-button"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export function useConfirmationDialog() {
  return {
    ConfirmationDialog,
  };
}
