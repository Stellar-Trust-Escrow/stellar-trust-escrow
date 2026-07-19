'use client';

import React from 'react';
import { cn } from '../../lib/utils';

export type MilestoneStatus = 'pending' | 'approved' | 'disputed';

export interface Milestone {
  id: string;
  title: string;
  description?: string;
  /** Target release amount for the milestone, already formatted (e.g. "500 XLM"). */
  amount?: string;
  status: MilestoneStatus;
}

export interface MilestoneTimelineProps {
  milestones: Milestone[];
  /** Index of the milestone currently awaiting action (drives the "current" ring). */
  currentIndex?: number;
  className?: string;
}

const STATUS_META: Record<MilestoneStatus, { label: string; ring: string; icon: string }> = {
  pending: {
    label: 'Pending',
    ring: 'border-gray-600 bg-gray-800 text-gray-400',
    icon: '○',
  },
  approved: {
    label: 'Approved',
    ring: 'border-emerald-500 bg-emerald-500/20 text-emerald-300',
    icon: '✓',
  },
  disputed: {
    label: 'Disputed',
    ring: 'border-red-500 bg-red-500/20 text-red-300',
    icon: '!',
  },
};

/**
 * MilestoneTimeline — vertical, accessible timeline of escrow milestones.
 *
 * Each milestone is a list item (`<li>`) inside an ordered list, with a
 * status-specific marker, title, optional description/amount, and an
 * `aria-current="step"` marker on the active milestone.
 */
export default function MilestoneTimeline({
  milestones,
  currentIndex,
  className,
}: MilestoneTimelineProps) {
  return (
    <ol className={cn('relative space-y-0', className)} aria-label="Escrow milestone timeline">
      {milestones.map((m, i) => {
        const meta = STATUS_META[m.status];
        const isLast = i === milestones.length - 1;
        const isCurrent = currentIndex === i;
        return (
          <li
            key={m.id}
            className="relative flex gap-3 pb-5 last:pb-0"
            aria-current={isCurrent ? 'step' : undefined}
          >
            {/* Connector line */}
            {!isLast && (
              <span
                className={cn(
                  'absolute left-[11px] top-6 h-full w-px',
                  m.status === 'approved' ? 'bg-emerald-500/40' : 'bg-gray-700',
                )}
                aria-hidden="true"
              />
            )}
            {/* Marker */}
            <span
              className={cn(
                'z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-bold',
                meta.ring,
                isCurrent && 'ring-2 ring-indigo-400 ring-offset-2 ring-offset-gray-900',
              )}
              role="img"
              aria-label={`${m.title}: ${meta.label}`}
            >
              {meta.icon}
            </span>
            {/* Content */}
            <div className="min-w-0 pt-0.5">
              <p className="text-sm font-medium text-gray-100">{m.title}</p>
              {m.description && <p className="mt-0.5 text-xs text-gray-400">{m.description}</p>}
              <div className="mt-1 flex items-center gap-2">
                <span
                  className={cn(
                    'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium',
                    m.status === 'approved'
                      ? 'bg-emerald-500/15 text-emerald-300'
                      : m.status === 'disputed'
                        ? 'bg-red-500/15 text-red-300'
                        : 'bg-gray-500/15 text-gray-400',
                  )}
                >
                  {meta.label}
                </span>
                {m.amount && <span className="font-mono text-xs text-gray-500">{m.amount}</span>}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
