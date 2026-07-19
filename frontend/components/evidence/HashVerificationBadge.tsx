'use client';

import React from 'react';
import { cn } from '../../lib/utils';
import type { VerificationStatus } from '../../hooks/useEvidenceVerification';

export interface EvidenceHashBadgeProps {
  status: VerificationStatus;
  onRetry?: () => void;
  className?: string;
}

const META: Record<VerificationStatus, { label: string; classes: string; icon: React.ReactNode }> =
  {
    idle: {
      label: 'Not verified',
      classes: 'border-gray-600/30 bg-gray-500/10 text-gray-400',
      icon: null,
    },
    verified: {
      label: 'Hash verified',
      classes: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
      icon: (
        <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path
            fillRule="evenodd"
            d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
            clipRule="evenodd"
          />
        </svg>
      ),
    },
    mismatch: {
      label: 'Hash mismatch',
      classes: 'border-red-500/30 bg-red-500/10 text-red-300',
      icon: (
        <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path
            fillRule="evenodd"
            d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
            clipRule="evenodd"
          />
        </svg>
      ),
    },
    verifying: {
      label: 'Verifying',
      classes: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
      icon: (
        <svg
          className="h-3.5 w-3.5 animate-spin"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
        >
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
    error: {
      label: 'Verification failed',
      classes: 'border-red-500/30 bg-red-500/10 text-red-300',
      icon: (
        <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path
            fillRule="evenodd"
            d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
            clipRule="evenodd"
          />
        </svg>
      ),
    },
  };

export default function EvidenceHashBadge({ status, onRetry, className }: EvidenceHashBadgeProps) {
  const meta = META[status];

  if (status === 'idle') return null;

  const inner = (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium',
        meta.classes,
        className,
      )}
    >
      <span aria-hidden="true" className="flex items-center justify-center">
        {meta.icon}
      </span>
      {meta.label}
    </span>
  );

  if (status === 'error' && onRetry) {
    return (
      <button
        type="button"
        onClick={onRetry}
        className="focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 rounded-full"
      >
        {inner}
      </button>
    );
  }

  return <span role="status">{inner}</span>;
}
