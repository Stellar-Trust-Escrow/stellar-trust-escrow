'use client';

import React from 'react';
import { cn } from '../../lib/utils';

export type HashVerificationStatus = 'verified' | 'mismatch' | 'verifying';

export interface HashVerificationBadgeProps {
  /** Verification outcome, drives colour + icon. */
  status: HashVerificationStatus;
  /** The hash being verified (shown in a tooltip / aria-label). */
  hash?: string;
  /** Optional click handler — e.g. re-run verification. */
  onVerify?: () => void;
  className?: string;
}

const META: Record<
  HashVerificationStatus,
  { label: string; classes: string; icon: React.ReactNode }
> = {
  verified: {
    label: 'Verified',
    classes: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
    icon: '✓',
  },
  mismatch: {
    label: 'Hash mismatch',
    classes: 'border-red-500/30 bg-red-500/10 text-red-300',
    icon: '!',
  },
  verifying: {
    label: 'Verifying…',
    classes: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
    icon: (
      <svg className="h-3 w-3 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle
          className="opacity-25"
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          strokeWidth="4"
        />
        <path
          className="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
        />
      </svg>
    ),
  },
};

/**
 * HashVerificationBadge — compact indicator of on-chain hash verification.
 *
 * Variants: `Verified`, `Mismatch`, `Verifying`. Announces status politely via
 * `role="status"` so screen readers are notified of state changes.
 */
export default function HashVerificationBadge({
  status,
  hash,
  onVerify,
  className,
}: HashVerificationBadgeProps) {
  const meta = META[status];
  const inner = (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium',
        meta.classes,
        className,
      )}
    >
      <span
        aria-hidden="true"
        className="flex h-3 w-3 items-center justify-center text-[10px] font-bold"
      >
        {meta.icon}
      </span>
      {meta.label}
    </span>
  );

  const aria = hash ? `${meta.label} (${hash})` : meta.label;

  if (onVerify) {
    return (
      <button
        type="button"
        onClick={onVerify}
        aria-label={aria}
        className="focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 rounded-full"
      >
        {inner}
      </button>
    );
  }

  return (
    <span role="status" aria-label={aria}>
      {inner}
    </span>
  );
}
