'use client';

import React, { useState } from 'react';
import { cn } from '../../lib/utils';

export interface DisputeEvidence {
  id: string;
  name: string;
  /** Size in bytes, optional. */
  size?: number;
  /** MIME type, optional. */
  type?: string;
}

export interface DisputeFormProps {
  /** Evidence items already attached to the dispute. */
  evidence?: DisputeEvidence[];
  /** Invoked with `{ reason, evidenceIds }` when the form is submitted. */
  onSubmit?: (data: { reason: string; evidenceIds: string[] }) => void;
  /** When true the submit button shows a spinner and is disabled. */
  submitting?: boolean;
  /** Server / validation error message. */
  error?: string | null;
  /** Placeholder text for the reason field. */
  reasonPlaceholder?: string;
  /** Invoked when the user requests to attach evidence. */
  onAddEvidence?: () => void;
  /** Invoked when an attached evidence item is removed. */
  onRemoveEvidence?: (id: string) => void;
  className?: string;
}

function formatSize(bytes?: number) {
  if (!bytes) return '';
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(0)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

function Spinner({ className: c }: { className?: string }) {
  return (
    <svg className={cn('animate-spin', c)} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}

/**
 * DisputeForm — collects a dispute reason and attached evidence.
 *
 * Variants: `Empty`, `WithEvidence`, `Submitting`, `Error`.
 */
export default function DisputeForm({
  evidence = [],
  onSubmit,
  submitting = false,
  error = null,
  reasonPlaceholder = 'Describe what went wrong…',
  onAddEvidence,
  onRemoveEvidence,
  className,
}: DisputeFormProps) {
  const [reason, setReason] = useState('');
  const reasonId = 'dispute-reason';
  const errorId = 'dispute-error';
  const invalid = Boolean(error) || (reason.trim().length > 0 && reason.trim().length < 10);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting || reason.trim().length < 10) return;
    onSubmit?.({ reason: reason.trim(), evidenceIds: evidence.map((ev) => ev.id) });
  };

  return (
    <form
      onSubmit={handleSubmit}
      className={cn(
        'w-full max-w-lg rounded-2xl border border-gray-800 bg-gray-900 p-6',
        className,
      )}
      noValidate
    >
      <h2 className="text-lg font-semibold text-gray-100">Raise a dispute</h2>
      <p className="mt-1 text-sm text-gray-400">
        Explain the problem and attach any supporting evidence.
      </p>

      {error && (
        <div
          role="alert"
          id={errorId}
          className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300"
        >
          {error}
        </div>
      )}

      <div className="mt-4">
        <label htmlFor={reasonId} className="block text-sm font-medium text-gray-200">
          Reason <span className="text-red-400">*</span>
        </label>
        <textarea
          id={reasonId}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={reasonPlaceholder}
          rows={4}
          aria-invalid={invalid}
          aria-describedby={error ? errorId : undefined}
          className={cn(
            'mt-1 w-full rounded-lg border bg-gray-800/60 px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus-visible:ring-2',
            invalid
              ? 'border-red-500/50 focus-visible:ring-red-400'
              : 'border-gray-700 focus-visible:ring-indigo-400',
          )}
        />
        <p className="mt-1 text-xs text-gray-500">
          Minimum 10 characters ({reason.trim().length}/10)
        </p>
      </div>

      <div className="mt-4">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-gray-200">Evidence</span>
          <button
            type="button"
            onClick={onAddEvidence}
            className="rounded-lg border border-gray-700 px-2.5 py-1 text-xs font-medium text-gray-300 transition-colors hover:bg-gray-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
          >
            + Add evidence
          </button>
        </div>

        {evidence.length === 0 ? (
          <p className="mt-2 text-xs text-gray-500">No evidence attached yet.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {evidence.map((ev) => (
              <li
                key={ev.id}
                className="flex items-center justify-between rounded-lg border border-gray-700 bg-gray-800/40 px-3 py-2"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm text-gray-200">{ev.name}</span>
                  {ev.size != null && (
                    <span className="text-xs text-gray-500">{formatSize(ev.size)}</span>
                  )}
                </span>
                <button
                  type="button"
                  onClick={() => onRemoveEvidence?.(ev.id)}
                  aria-label={`Remove evidence ${ev.name}`}
                  className="ml-3 rounded p-1 text-gray-400 transition-colors hover:text-red-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <button
        type="submit"
        disabled={submitting || reason.trim().length < 10}
        className={cn(
          'mt-6 inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors',
          'bg-red-600 hover:bg-red-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400',
          'disabled:cursor-not-allowed disabled:opacity-50',
        )}
      >
        {submitting && <Spinner className="h-4 w-4" />}
        {submitting ? 'Submitting…' : 'Submit dispute'}
      </button>
    </form>
  );
}
