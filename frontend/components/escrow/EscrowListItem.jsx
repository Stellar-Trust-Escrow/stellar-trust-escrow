'use client';

/**
 * EscrowListItem — swipe-to-action list row (Issue #1444).
 *
 * Wraps the summary {@link EscrowCard} in a swipeable layer:
 *   - Swipe LEFT  → reveals a red "Dispute" action (calls onDispute)
 *   - Swipe RIGHT → reveals a green "Release all" action (calls onReleaseAll)
 *                   only when `canReleaseAll` is true (i.e. all milestones submitted)
 *
 * The card snaps back if the swipe does not cross 40% of its width. Action
 * buttons sit behind the card and are revealed by the translation; a tap on a
 * revealed button performs the action. Every interactive element keeps a
 * minimum 44x44px hit area (min-h-touch / min-w-touch).
 *
 * @param {object}   props
 * @param {object}   props.escrow
 * @param {Function} [props.onDispute]     — (escrow) => void
 * @param {Function} [props.onReleaseAll]  — (escrow) => void
 * @param {boolean}  [props.canReleaseAll] — show the "Release all" action?
 */

import { useState } from 'react';
import EscrowCard from './EscrowCard';
import { useSwipeGesture } from '../../hooks/useSwipeGesture';

const REVEAL_WIDTH = 96; // px of the action button revealed on each side

export default function EscrowListItem({
  escrow,
  onDispute,
  onReleaseAll,
  canReleaseAll = false,
  className = '',
}) {
  const [revealed, setRevealed] = useState(null); // 'dispute' | 'release' | null

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

  // While dragging use the live offset; once "revealed" keep the card pinned
  // open so the action button stays tappable.
  const translateX =
    revealed === 'dispute'
      ? -REVEAL_WIDTH
      : revealed === 'release'
        ? REVEAL_WIDTH
        : offset;

  const hasDispute = typeof onDispute === 'function';
  const hasRelease = canReleaseAll && typeof onReleaseAll === 'function';

  const handleAction = (action) => {
    setRevealed(null);
    if (action === 'dispute') onDispute?.(escrow);
    else onReleaseAll?.(escrow);
  };

  return (
    <div className={`relative overflow-hidden rounded-2xl ${className}`}>
      {/* Action buttons revealed behind the card */}
      <div className="absolute inset-0 flex items-stretch justify-between" aria-hidden={!revealed}>
        {hasRelease && (
          <div className="flex flex-1 items-center bg-emerald-600/90 pl-4">
            <button
              type="button"
              onClick={() => handleAction('release')}
              aria-label={`Release all funds for escrow ${escrow?.title ?? ''}`}
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
              aria-label={`Raise a dispute for escrow ${escrow?.title ?? ''}`}
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
        <EscrowCard escrow={escrow} />
      </div>
    </div>
  );
}
