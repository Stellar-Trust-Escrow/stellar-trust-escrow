/**
 * Toast Component
 *
 * A notification toast that appears to inform users of success or error states.
 * Auto-dismisses after a timeout and can be manually closed.
 *
 * @param {object} props
 * @param {string} props.message - The message to display
 * @param {'success' | 'error' | 'info'} props.type - Type of toast
 * @param {Function} props.onClose - Callback when toast is closed
 * @param {number} [props.duration=4000] - Auto-dismiss duration in ms
 */

import { useEffect } from 'react';
import { CheckCircle, XCircle, Info, X } from 'lucide-react';

export default function Toast({ message, type = 'success', onClose, duration = 4000 }) {
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose();
    }, duration);

    return () => clearTimeout(timer);
  }, [duration, onClose]);

  const icons = {
    success: <CheckCircle className="w-5 h-5 text-green-500" />,
    error: <XCircle className="w-5 h-5 text-red-500" />,
    info: <Info className="w-5 h-5 text-blue-500" />,
  };

  const bgColors = {
    success: 'bg-gray-900 border-green-500',
    error: 'bg-gray-900 border-red-500',
    info: 'bg-gray-900 border-blue-500',
  };

  return (
    <div
      className={`fixed bottom-4 right-4 flex items-center gap-3 px-4 py-3 rounded-lg border-l-4 shadow-lg ${bgColors[type]} animate-slide-in`}
      role="alert"
      aria-live="assertive"
    >
      {icons[type]}
      <p className="text-white text-sm font-medium">{message}</p>
      <button
        onClick={onClose}
        className="ml-2 text-gray-400 hover:text-white transition-colors"
        aria-label="Close notification"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
