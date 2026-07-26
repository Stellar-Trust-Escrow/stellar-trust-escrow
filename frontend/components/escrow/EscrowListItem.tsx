'use client';

import React from 'react';
import { cn } from '../../lib/utils';

export type EscrowStatus = 'active' | 'disputed' | 'completed' | 'cancelled';

export interface EscrowListItemProps {
  /** Unique escrow identifier (used for labels/keys). */
  id: string;
  /** Human readable escrow title. */
  title: string;
  /** Counterparty display name (the other party in the escrow). */
  counterparty: string;
  /** Amount released / held, already formatted (e.g. "1,250 XLM"). */
  amount: string;
  /** Current lifecycle status; drives the badge colour and available actions. */
  status: EscrowStatus;
  /** ISO date string for when the escrow was created. */
  createdAt?: string;
  /** Number of milestones that have been approved. */
  milestonesApproved?: number;
  /** Total number of milestones in the escrow. */
  milestonesTotal?: number;
  /** Invoked when the user chooses to open the escrow detail view. */
  onView?: () => void;
  /** Invoked when the user raises a dispute from this row. */
  onDispute?: () => void;
  className?: string;
}

const STATUS_STYLES: Record<EscrowStatus, { badge: string; dot: string; label: string }> = {
  active: {
    badge: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30',
    dot: 'bg-indigo-400',
    label: 'Active',
  },
  disputed: {
    badge: 'bg-red-500/15 text-red-300 border-red-500/30',
    dot: 'bg-red-400',
    label: 'Disputed',
  },
  completed: {
    badge: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    dot: 'bg-emerald-400',
    label: 'Completed',
  },
  cancelled: {
    badge: 'bg-gray-500/15 text-gray-300 border-gray-500/30',
    dot: 'bg-gray-400',
    label: 'Cancelled',
  },
};

function StatusBadge({ status }: { status: EscrowStatus }) {
  const s = STATUS_STYLES[status];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium',
        s.badge,
      )}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', s.dot)} aria-hidden="true" />
      {s.label}
    </span>
  );
}

/**
 * EscrowListItem — a single row in an escrow list.
 *
 * Renders the escrow title, counterparty, locked amount, a status badge and a
 * milestone progress indicator, plus contextual action buttons ("View" always,
 * "Raise dispute" only while `active`). Fully keyboard accessible.
 */
export default function EscrowListItem({
  id,
  title,
  counterparty,
  amount,
  status,
  createdAt,
  milestonesApproved = 0,
  milestonesTotal = 0,
  onView,
  onDispute,
  className,
}: EscrowListItemProps) {
  const canDispute = status === 'active';
  const pct = milestonesTotal > 0 ? Math.round((milestonesApproved / milestonesTotal) * 100) : 0;

  return (
    <article
      aria-labelledby={`escrow-${id}-title`}
      className={cn(
        'rounded-xl border border-gray-800 bg-gray-900/60 p-4 transition-colors hover:border-gray-700 focus-within:border-indigo-500',
        className,
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 id={`escrow-${id}-title`} className="truncate text-sm font-semibold text-gray-100">
            {title}
          </h3>
          <p className="mt-0.5 text-xs text-gray-400">
            with <span className="text-gray-300">{counterparty}</span>
          </p>
        </div>
        <StatusBadge status={status} />
      </div>

      <div className="mt-3 flex items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-gray-500">Amount</p>
          <p className="mt-0.5 font-mono text-base font-semibold text-gray-100">{amount}</p>
        </div>
        {createdAt && (
          <p className="text-xs text-gray-500">
            {new Date(createdAt).toLocaleDateString(undefined, {
              year: 'numeric',
              month: 'short',
              day: 'numeric',
            })}
          </p>
        )}
      </div>

      {milestonesTotal > 0 && (
        <div className="mt-4">
          <div className="flex items-center justify-between text-xs text-gray-400">
            <span>
              Milestones {milestonesApproved}/{milestonesTotal}
            </span>
            <span>{pct}%</span>
          </div>
          <div
            className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-gray-800"
            role="progressbar"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`Milestone progress ${pct} percent`}
          >
            <div
              className={cn(
                'h-full rounded-full transition-all',
                status === 'cancelled'
                  ? 'bg-gray-500'
                  : status === 'disputed'
                    ? 'bg-red-400'
                    : status === 'completed'
                      ? 'bg-emerald-400'
                      : 'bg-indigo-400',
              )}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      )}

      <div className="mt-4 flex items-center gap-2">
        <button
          type="button"
          onClick={onView}
          className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-indigo-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
        >
          View details
        </button>
        {canDispute && (
          <button
            type="button"
            onClick={onDispute}
            className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-300 transition-colors hover:bg-red-500/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
          >
            Raise dispute
          </button>
        )}
      </div>
    </article>
  );
}
