'use client';

/**
 * StaleIndexerWarning Component — Issue #234
 *
 * Displays a dismissible warning banner in the explorer when the
 * Stellar event indexer is lagging behind the live ledger by more
 * than a configured threshold.
 *
 * The warning shows:
 *  - Last processed ledger number
 *  - Current lag (in ledgers)
 *  - Retry guidance for the user
 *
 * The banner hides automatically when lag drops back below the threshold.
 *
 * @param {object}  props
 * @param {number}  props.lastProcessedLedger  — most recent ledger the indexer has seen
 * @param {number}  props.currentLedger        — latest ledger on the network (0 = unknown)
 * @param {number}  [props.lagThreshold=50]    — ledgers behind before showing warning
 * @param {boolean} [props.isLoading=false]    — suppress banner while initial data loads
 */

import { useState, useEffect } from 'react';
import { AlertTriangle, RefreshCw, X } from 'lucide-react';

const DEFAULT_LAG_THRESHOLD = 50;

export default function StaleIndexerWarning({
  lastProcessedLedger,
  currentLedger,
  lagThreshold = DEFAULT_LAG_THRESHOLD,
  isLoading = false,
}) {
  const [dismissed, setDismissed] = useState(false);

  const lag =
    currentLedger > 0 && lastProcessedLedger > 0
      ? currentLedger - lastProcessedLedger
      : 0;

  const isStale = !isLoading && lag >= lagThreshold;

  // Auto-show the banner again if lag worsens after being dismissed
  useEffect(() => {
    if (isStale) {
      setDismissed(false);
    }
  }, [isStale]);

  if (!isStale || dismissed) {
    return null;
  }

  return (
    <div
      role="alert"
      aria-live="polite"
      data-testid="stale-indexer-warning"
      className="flex items-start gap-3 bg-amber-900/20 border border-amber-500/40 rounded-lg px-4 py-3 text-sm"
    >
      {/* Icon */}
      <AlertTriangle
        size={18}
        className="text-amber-400 shrink-0 mt-0.5"
        aria-hidden="true"
      />

      {/* Message */}
      <div className="flex-1 min-w-0">
        <p className="text-amber-300 font-medium">
          Explorer data may be outdated
        </p>
        <p className="text-amber-400/80 text-xs mt-0.5">
          The indexer is{' '}
          <span className="font-semibold text-amber-300">
            {lag.toLocaleString()} ledger{lag !== 1 ? 's' : ''}
          </span>{' '}
          behind the network. Last indexed:{' '}
          <span className="font-mono text-amber-300">
            {lastProcessedLedger > 0 ? lastProcessedLedger.toLocaleString() : '—'}
          </span>
          .{' '}
          Try refreshing the page or check back in a moment.
        </p>
      </div>

      {/* Retry / refresh shortcut */}
      <button
        onClick={() => window.location.reload()}
        aria-label="Retry — reload the page"
        className="shrink-0 flex items-center gap-1 text-xs text-amber-400 hover:text-amber-200 transition-colors"
      >
        <RefreshCw size={13} />
        Retry
      </button>

      {/* Dismiss */}
      <button
        onClick={() => setDismissed(true)}
        aria-label="Dismiss stale indexer warning"
        className="shrink-0 text-amber-500 hover:text-amber-200 transition-colors"
      >
        <X size={15} />
      </button>
    </div>
  );
}
