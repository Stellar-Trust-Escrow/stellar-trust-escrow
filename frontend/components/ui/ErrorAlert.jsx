/**
 * ErrorAlert Component
 *
 * Displays error messages with dismiss button.
 * Used for form submission errors and API failures.
 *
 * @param {object}   props
 * @param {string}   props.message - Error message to display
 * @param {Function} props.onDismiss - Called when dismiss button clicked
 * @param {string}   [props.title='Error'] - Alert title
 */

'use client';

export default function ErrorAlert({ message, onDismiss, title = 'Error' }) {
  if (!message) return null;

  return (
    <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 flex items-start gap-3">
      <span className="text-red-400 text-lg flex-shrink-0">⚠</span>
      <div className="flex-1 min-w-0">
        <h3 className="text-red-400 font-semibold text-sm">{title}</h3>
        <p className="text-red-300 text-sm mt-1 break-words">{message}</p>
      </div>
      <button
        onClick={onDismiss}
        className="text-red-400 hover:text-red-300 transition-colors flex-shrink-0 p-1"
        aria-label="Dismiss error"
      >
        ✕
      </button>
    </div>
  );
}
