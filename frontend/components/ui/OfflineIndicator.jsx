'use client';

/**
 * OfflineIndicator
 *
 * Floating banner that appears when the browser loses network connectivity.
 * Shows a sync spinner while queued mutations are being replayed.
 * Disappears automatically once back online and synced.
 *
 * Reads state from OfflineContext — wrap your app with <OfflineProvider>.
 */

import { useEffect, useState } from 'react';
import { useOffline } from '../../contexts/OfflineContext.jsx';

export default function OfflineIndicator() {
  const { isOnline, isSyncing, pendingCount } = useOffline();
  const [visible, setVisible] = useState(false);
  const [justReconnected, setJustReconnected] = useState(false);

  // Show banner when offline; briefly show "reconnected" state
  useEffect(() => {
    if (!isOnline) {
      setVisible(true);
      setJustReconnected(false);
    } else if (visible) {
      setJustReconnected(true);
      const t = setTimeout(() => {
        setVisible(false);
        setJustReconnected(false);
      }, 3000);
      return () => clearTimeout(t);
    }
  }, [isOnline]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!visible) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className={`
        fixed bottom-6 left-1/2 -translate-x-1/2 z-50
        flex items-center gap-3 px-5 py-3 rounded-2xl shadow-2xl
        border backdrop-blur-md text-sm font-medium
        transition-all duration-300
        ${justReconnected
          ? 'bg-emerald-900/80 border-emerald-500/40 text-emerald-300'
          : 'bg-gray-900/90 border-gray-700/60 text-gray-200'
        }
      `}
    >
      {/* Status dot / spinner */}
      {isSyncing ? (
        <span
          className="w-4 h-4 rounded-full border-2 border-indigo-400 border-t-transparent animate-spin"
          aria-hidden="true"
        />
      ) : justReconnected ? (
        <span className="text-emerald-400" aria-hidden="true">✓</span>
      ) : (
        <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse" aria-hidden="true" />
      )}

      {/* Message */}
      {isSyncing ? (
        <span>
          Syncing{pendingCount > 0 ? ` ${pendingCount} pending action${pendingCount > 1 ? 's' : ''}` : ''}…
        </span>
      ) : justReconnected ? (
        <span>Back online</span>
      ) : (
        <span>
          You&apos;re offline
          {pendingCount > 0 && (
            <span className="ml-1 text-gray-400">
              · {pendingCount} action{pendingCount > 1 ? 's' : ''} queued
            </span>
          )}
        </span>
      )}
    </div>
  );
}
