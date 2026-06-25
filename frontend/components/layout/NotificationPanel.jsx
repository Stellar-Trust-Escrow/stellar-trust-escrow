'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { formatRelativeTime } from '../../lib/formatRelativeTime';

const EVENT_LABELS = {
  escrow_funded: 'Escrow funded',
  release_requested: 'Release requested',
  dispute_raised: 'Dispute raised',
  dispute_resolved: 'Dispute resolved',
  escrow_expired: 'Escrow expired',
};

const EVENT_ICONS = {
  escrow_funded: '💰',
  release_requested: '📤',
  dispute_raised: '⚠️',
  dispute_resolved: '✅',
  escrow_expired: '⏰',
};

/**
 * Notification panel — dropdown on desktop, slide-in drawer on mobile.
 *
 * @param {{ notifications: Array, onMarkRead: (id: string) => void, onMarkAllRead: () => void, onClose: () => void }} props
 */
export default function NotificationPanel({ notifications, onMarkRead, onMarkAllRead, onClose }) {
  const panelRef = useRef(null);

  // Close on outside click
  useEffect(() => {
    const handler = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  // Close on Escape
  useEffect(() => {
    const handler = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <>
      {/* Mobile overlay */}
      <div
        className="fixed inset-0 bg-black/40 z-40 md:hidden"
        aria-hidden="true"
        onClick={onClose}
      />

      {/* Panel */}
      <div
        ref={panelRef}
        role="dialog"
        aria-label="Notifications"
        aria-modal="true"
        className={[
          // Mobile: full-width slide-in from bottom
          'fixed bottom-0 left-0 right-0 z-50 rounded-t-2xl',
          'md:absolute md:bottom-auto md:left-auto md:right-0 md:top-full md:mt-2',
          'md:w-96 md:rounded-2xl md:shadow-2xl',
          'bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700',
          'flex flex-col max-h-[80vh] md:max-h-[480px]',
          'transition-transform duration-200',
        ].join(' ')}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Notifications</h2>
          <div className="flex items-center gap-2">
            {notifications.some((n) => !n.read) && (
              <button
                onClick={onMarkAllRead}
                className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline"
              >
                Mark all read
              </button>
            )}
            <button
              onClick={onClose}
              aria-label="Close notifications"
              className="text-gray-400 hover:text-gray-700 dark:hover:text-white p-1 rounded transition-colors"
            >
              <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                <path
                  fillRule="evenodd"
                  d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                  clipRule="evenodd"
                />
              </svg>
            </button>
          </div>
        </div>

        {/* List */}
        <ul className="overflow-y-auto flex-1 divide-y divide-gray-100 dark:divide-gray-800">
          {notifications.length === 0 ? (
            <li className="px-4 py-8 text-center text-sm text-gray-500 dark:text-gray-400">
              No notifications yet
            </li>
          ) : (
            notifications.map((n) => (
              <li key={n.id}>
                <Link
                  href={`/escrow/${n.escrowId}`}
                  onClick={() => {
                    if (!n.read) onMarkRead(n.id);
                    onClose();
                  }}
                  className={[
                    'flex gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors',
                    !n.read ? 'bg-indigo-50 dark:bg-indigo-950/30' : '',
                  ].join(' ')}
                >
                  {/* Icon */}
                  <span className="text-lg leading-none mt-0.5" aria-hidden="true">
                    {EVENT_ICONS[n.type] ?? '🔔'}
                  </span>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-900 dark:text-white truncate">
                      {n.message ?? EVENT_LABELS[n.type] ?? n.type}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      {formatRelativeTime(n.createdAt)}
                    </p>
                  </div>

                  {/* Unread dot */}
                  {!n.read && (
                    <span
                      className="w-2 h-2 rounded-full bg-indigo-500 self-center shrink-0"
                      aria-label="Unread"
                    />
                  )}
                </Link>
              </li>
            ))
          )}
        </ul>
      </div>
    </>
  );
}
