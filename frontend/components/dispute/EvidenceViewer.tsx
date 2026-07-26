'use client';

import React from 'react';
import Image from 'next/image';
import { cn } from '../../lib/utils';

export type EvidenceType = 'pdf' | 'image';
export type EvidenceState = 'loading' | 'loaded' | 'error';

export interface EvidenceViewerProps {
  /** Kind of evidence being previewed. */
  type: EvidenceType;
  /** Load lifecycle state. */
  state: EvidenceState;
  /** Source URL (image src or PDF link). */
  url?: string;
  /** File name shown in the header. */
  fileName?: string;
  /** IPFS / object-storage gateway that failed (surfaced in the `GatewayError` variant). */
  gateway?: string;
  /** Invoked when the user retries after an error. */
  onRetry?: () => void;
  /** Invoked when the user downloads the evidence. */
  onDownload?: () => void;
  className?: string;
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
 * EvidenceViewer — previews dispute / escrow evidence (images or PDFs) with
 * explicit loading, loaded, and gateway-error states.
 *
 * Variants: `PdfLoading`, `PdfLoaded`, `ImageLoaded`, `GatewayError`.
 */
export default function EvidenceViewer({
  type,
  state,
  url,
  fileName = 'evidence',
  gateway,
  onRetry,
  onDownload,
  className,
}: EvidenceViewerProps) {
  const titleId = 'evidence-viewer-title';

  return (
    <figure
      className={cn(
        'w-full max-w-md overflow-hidden rounded-xl border border-gray-800 bg-gray-900',
        className,
      )}
      aria-busy={state === 'loading'}
    >
      <figcaption
        id={titleId}
        className="flex items-center justify-between border-b border-gray-800 px-4 py-2"
      >
        <span className="truncate text-sm font-medium text-gray-200">{fileName}</span>
        <span className="ml-2 shrink-0 text-xs uppercase tracking-wide text-gray-500">{type}</span>
      </figcaption>

      {/* Loading */}
      {state === 'loading' && (
        <div
          className="flex h-56 flex-col items-center justify-center gap-3 text-gray-400"
          role="status"
          aria-label="Loading evidence"
        >
          <Spinner className="h-6 w-6 text-indigo-400" />
          <span className="text-sm">Loading evidence…</span>
        </div>
      )}

      {/* Loaded */}
      {state === 'loaded' && (
        <div className="p-3">
          {type === 'image' ? (
            <div className="relative h-72 w-full">
              <Image
                src={url as string}
                alt={`Preview of ${fileName}`}
                fill
                unoptimized
                sizes="100vw"
                className="rounded-lg object-contain"
              />
            </div>
          ) : (
            <div className="flex h-56 flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-gray-700 bg-gray-800/40 text-center">
              <span className="text-3xl" aria-hidden="true">
                📄
              </span>
              <p className="text-sm text-gray-300">PDF document ready to view</p>
              {url && (
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-indigo-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
                >
                  Open PDF
                </a>
              )}
            </div>
          )}
          {onDownload && (
            <button
              type="button"
              onClick={onDownload}
              className="mt-3 w-full rounded-lg border border-gray-700 px-3 py-1.5 text-xs font-medium text-gray-300 transition-colors hover:bg-gray-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
            >
              Download
            </button>
          )}
        </div>
      )}

      {/* Error (gateway failure) */}
      {state === 'error' && (
        <div
          role="alert"
          className="flex h-56 flex-col items-center justify-center gap-3 p-4 text-center"
        >
          <span className="text-3xl" aria-hidden="true">
            ⚠️
          </span>
          <p className="text-sm text-red-300">
            Couldn’t load evidence
            {gateway ? ` from ${gateway}` : ''}.
          </p>
          <button
            type="button"
            onClick={onRetry}
            className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-red-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
          >
            Retry
          </button>
        </div>
      )}
    </figure>
  );
}
