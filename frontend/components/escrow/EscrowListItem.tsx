'use client';

import React, { useState } from 'react';
import { cn } from '../../lib/utils';
import EscrowCard from './EscrowCard';
import { useSwipeGesture } from '../../hooks/useSwipeGesture';

export type EscrowStatus = 'active' | 'disputed' | 'completed' | 'cancelled';

export interface EscrowListItemProps {
  escrow?: {
    id: string | number;
    title: string;
    status: string;
    totalAmount: string;
    milestoneProgress?: string;
    counterparty: string;
    role?: 'client' | 'freelancer';
    transactionHash?: string;
  };
  onReleaseAll?: (escrow: any) => void;
  canReleaseAll?: boolean;

  // Multi-select props
  isSelectMode?: boolean;
  isSelected?: boolean;
  onToggleSelect?: (id: string) => void;

  // Fallback props for compatibility (e.g. Storybook)
  id?: string;
  title?: string;
  counterparty?: string;
  amount?: string;
  status?: EscrowStatus;
  createdAt?: string;
  milestonesApproved?: number;
  milestonesTotal?: number;
  onView?: () => void;
  onDispute?: (escrow?: any) => void;
  className?: string;
}

const REVEAL_WIDTH = 96; // px of the action button revealed on each side

export default function EscrowListItem({
  escrow,
  onDispute,
  onReleaseAll,
  canReleaseAll = false,
  className = '',
  isSelectMode = false,
  isSelected = false,
  onToggleSelect,
  // Destructured fallback props
  id,
  title,
  counterparty,
  amount,
  status,
  createdAt,
  milestonesApproved = 0,
  milestonesTotal = 0,
  onView,
}: EscrowListItemProps) {
  const [revealed, setRevealed] = useState<'dispute' | 'release' | null>(null);

  // Unify incoming props into a single structured escrow object
  const resolvedEscrow = escrow || {
    id: id || '',
    title: title || '',
    status: status || 'active',
    totalAmount: amount || '0 XLM',
    milestoneProgress: `${milestonesApproved} / ${milestonesTotal}`,
    counterparty: counterparty || '',
    role: 'client',
  };

  const { offset, bind } = useSwipeGesture({
    axis: 'x',
    threshold: 0.4,
    onSwipeLeft: () => {
      if (typeof onDispute === 'function') setRevealed('dispute');
    },
    onSwipeRight: () => {
      if (canReleaseAll && typeof onReleaseAll === 'function') setRevealed('release');
    },
  });

  const translateX =
    revealed === 'dispute'
      ? -REVEAL_WIDTH
      : revealed === 'release'
        ? REVEAL_WIDTH
        : offset;

  const hasDispute = typeof onDispute === 'function';
  const hasRelease = canReleaseAll && typeof onReleaseAll === 'function';

  const handleAction = (action: 'dispute' | 'release') => {
    setRevealed(null);
    if (action === 'dispute') {
      onDispute?.(resolvedEscrow);
    } else {
      onReleaseAll?.(resolvedEscrow);
    }
  };

  // Keyboard Space toggles selection without navigating when in select mode
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === ' ') {
      if (isSelectMode) {
        e.preventDefault();
        onToggleSelect?.(String(resolvedEscrow.id));
      }
    }
  };

  return (
    <div
      className={cn('relative group transition-all duration-200', className)}
      onKeyDown={handleKeyDown}
    >
      {/* Checkbox Overlay */}
      <div
        className={cn(
          'absolute left-4 top-1/2 -translate-y-1/2 z-20 flex items-center justify-center transition-all duration-200',
          isSelectMode
            ? 'opacity-100 translate-x-0'
            : 'opacity-0 group-hover:opacity-100 -translate-x-2 pointer-events-none group-hover:pointer-events-auto',
        )}
      >
        <input
          type="checkbox"
          checked={isSelected}
          onChange={() => onToggleSelect?.(String(resolvedEscrow.id))}
          className="h-5 w-5 rounded border-gray-700 bg-gray-900 text-indigo-600 focus:ring-indigo-500 focus:ring-offset-gray-950 focus:ring-offset-2 cursor-pointer"
          aria-label={`Select escrow ${resolvedEscrow.title}`}
          tabIndex={isSelectMode ? 0 : -1}
        />
      </div>

      {/* Swipeable item shifted right to leave room for checkbox */}
      <div
        className={cn(
          'relative overflow-hidden rounded-2xl transition-all duration-200',
          isSelectMode || isSelected ? 'pl-12' : 'pl-0 group-hover:pl-12',
        )}
      >
        {/* Action buttons revealed behind the card */}
        <div className="absolute inset-0 flex items-stretch justify-between" aria-hidden={!revealed}>
          {hasRelease && (
            <div className="flex flex-1 items-center bg-emerald-600/90 pl-4">
              <button
                type="button"
                onClick={() => handleAction('release')}
                aria-label={`Release all funds for escrow ${resolvedEscrow.title}`}
                className="min-h-touch min-w-touch flex items-center gap-2 px-3 text-sm font-semibold text-white"
              >
                ✓ Release all
              </button>
            </div>
          )}
          {hasDispute && (
            <div className="flex flex-1 items-center justify-end bg-red-600/90 pr-4">
              <button
                type="button"
                onClick={() => handleAction('dispute')}
                aria-label={`Raise a dispute for escrow ${resolvedEscrow.title}`}
                className="min-h-touch min-w-touch flex items-center gap-2 px-3 text-sm font-semibold text-white"
              >
                ⚠ Dispute
              </button>
            </div>
          )}
        </div>

        {/* Card on top (translated by the swipe) */}
        <div
          {...bind}
          data-testid="escrow-swipe-row"
          onClick={() => revealed && setRevealed(null)}
          className="relative touch-pan-y bg-gray-950"
          style={{ transform: translateX ? `translateX(${translateX}px)` : undefined }}
        >
          <EscrowCard escrow={resolvedEscrow} />
        </div>
      </div>
    </div>
  );
}
