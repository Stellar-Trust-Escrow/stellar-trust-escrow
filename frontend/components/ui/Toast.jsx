'use client';
import { useState, useEffect, useCallback } from 'react';

const ICONS = {
  success: '✓',
  error: '✕',
  info: 'ℹ',
  warning: '⚠',
};

const STYLES = {
  success: 'bg-green-50 border-green-400 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  error: 'bg-red-50 border-red-400 text-red-800 dark:bg-red-900/30 dark:text-red-300',
  info: 'bg-blue-50 border-blue-400 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  warning:
    'bg-yellow-50 border-yellow-400 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
};

export function Toast({ message, type = 'info', duration = 4000, onClose }) {
  useEffect(() => {
    const t = setTimeout(onClose, duration);
    return () => clearTimeout(t);
  }, [duration, onClose]);

  return (
    <div
      className={`flex items-start gap-3 rounded-lg border px-4 py-3 shadow-md text-sm ${STYLES[type]}`}
    >
      <span className="font-bold">{ICONS[type]}</span>
      <span className="flex-1">{message}</span>
      <button onClick={onClose} className="ml-2 opacity-60 hover:opacity-100">
        ✕
      </button>
    </div>
  );
}

export function ToastContainer({ toasts, onRemove }) {
  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 w-80">
      {toasts.map((t) => (
        <Toast key={t.id} {...t} onClose={() => onRemove(t.id)} />
      ))}
    </div>
  );
}

export function useToast() {
  const [toasts, setToasts] = useState([]);
  const add = useCallback((message, type = 'info') => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, message, type }]);
  }, []);
  const remove = useCallback((id) => setToasts((prev) => prev.filter((t) => t.id !== id)), []);
  return { toasts, toast: add, removeToast: remove };
}

export default Toast;
