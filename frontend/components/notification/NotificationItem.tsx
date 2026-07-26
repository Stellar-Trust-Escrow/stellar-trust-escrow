'use client';

import React from 'react';
import { cn } from '../../lib/utils';

export interface NotificationItemProps {
  id: string;
  title: string;
  message: string;
  /** Whether the notification has been read. Drives emphasis + the unread dot. */
  read: boolean;
  /** ISO timestamp; rendered as a relative-ish localized date. */
  createdAt?: string;
  /** When provided, renders a "View escrow" action linking to the escrow. */
  escrowLink?: string;
  /** Invoked when the user marks the notification as read. */
  onMarkRead?: (id: string) => void;
  /** Invoked when the notification body is activated. */
  onClick?: (id: string) => void;
  className?: string;
}

/**
 * NotificationItem — a single notification row.
 *
 * Variants: `Unread`, `Read`, `WithEscrowLink`. Unread items are emphasised and
 * expose an accessible "Mark as read" control; read items are visually muted.
 */
export default function NotificationItem({
  id,
  title,
  message,
  read,
  createdAt,
  escrowLink,
  onMarkRead,
  onClick,
  className,
}: NotificationItemProps) {
  const labelId = `notif-${id}-title`;
  const descId = `notif-${id}-desc`;

  return (
    <article
      aria-labelledby={labelId}
      aria-describedby={descId}
      className={cn(
        'flex gap-3 rounded-xl border p-4 transition-colors',
        read ? 'border-gray-800 bg-gray-900/40' : 'border-indigo-500/30 bg-indigo-500/5',
        className,
      )}
    >
      {/* Unread indicator */}
      <span className="mt-1.5 shrink-0" aria-hidden="true">
        <span
          className={cn('block h-2 w-2 rounded-full', read ? 'bg-transparent' : 'bg-indigo-400')}
        />
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <h3 id={labelId} className="text-sm font-semibold text-gray-100">
            {title}
            {!read && <span className="sr-only"> (unread)</span>}
          </h3>
          {createdAt && (
            <time dateTime={createdAt} className="shrink-0 text-xs text-gray-500">
              {new Date(createdAt).toLocaleDateString(undefined, {
                month: 'short',
                day: 'numeric',
              })}
            </time>
          )}
        </div>

        <p id={descId} className={cn('mt-0.5 text-sm', read ? 'text-gray-400' : 'text-gray-300')}>
          {message}
        </p>

        <div className="mt-3 flex items-center gap-3">
          {!read && (
            <button
              type="button"
              onClick={() => onMarkRead?.(id)}
              className="rounded-lg border border-gray-700 px-2.5 py-1 text-xs font-medium text-gray-300 transition-colors hover:bg-gray-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
            >
              Mark as read
            </button>
          )}
          {escrowLink && (
            <a
              href={escrowLink}
              onClick={(e) => {
                e.preventDefault();
                onClick?.(id);
              }}
              className="rounded-lg px-2.5 py-1 text-xs font-medium text-indigo-400 transition-colors hover:text-indigo-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
            >
              View escrow →
            </a>
          )}
        </div>
      </div>
    </article>
  );
}
