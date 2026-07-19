'use client';

import React, { useEffect } from 'react';
import { cn } from '../../lib/utils';
import { useEvidenceVerification } from '../../hooks/useEvidenceVerification';
import EvidenceHashBadge from './HashVerificationBadge';
import PdfViewer from './PdfViewer';
import ImageViewer from './ImageViewer';

export interface EvidenceViewerProps {
  cid: string;
  expectedHash: string;
  filename: string;
  mimeType: 'application/pdf' | 'image/jpeg' | 'image/png' | 'text/plain';
  className?: string;
}

export default function EvidenceViewer({
  cid,
  expectedHash,
  filename,
  mimeType,
  className,
}: EvidenceViewerProps) {
  const { status, progress, error, bytes, verify, reset } = useEvidenceVerification({
    cid,
    expectedHash,
  });

  useEffect(() => {
    verify();
  }, [verify]);

  const isImage = mimeType === 'image/jpeg' || mimeType === 'image/png';
  const isPdf = mimeType === 'application/pdf';
  const isText = mimeType === 'text/plain';

  return (
    <div
      className={cn(
        'w-full max-w-4xl overflow-hidden rounded-xl border border-gray-800 bg-gray-900',
        className,
      )}
    >
      <div className="flex items-center justify-between border-b border-gray-800 px-4 py-3">
        <div className="flex items-center gap-3 min-w-0">
          <span className="truncate text-sm font-medium text-gray-200">{filename}</span>
          <span className="shrink-0 rounded bg-gray-800 px-2 py-0.5 text-[10px] uppercase tracking-wide text-gray-500">
            {mimeType.split('/')[1]}
          </span>
        </div>
        <EvidenceHashBadge status={status} onRetry={verify} />
      </div>

      {status === 'verifying' && (
        <div className="px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-800">
              <div
                className="h-full rounded-full bg-indigo-500 transition-all duration-200 ease-out"
                style={{ width: `${Math.max(progress, 5)}%` }}
              />
            </div>
            <span className="shrink-0 text-xs text-gray-400">{Math.round(progress)}%</span>
          </div>
          <p className="mt-1 text-xs text-gray-500">Fetching from IPFS gateway...</p>
        </div>
      )}

      {status === 'verified' && bytes && (
        <div className="p-4">
          {isPdf && <PdfViewer file={bytes} filename={filename} />}
          {isImage && (
            <ImageViewer
              bytes={bytes}
              filename={filename}
              mimeType={mimeType as 'image/jpeg' | 'image/png'}
            />
          )}
          {isText && <TextViewer bytes={bytes} filename={filename} />}
        </div>
      )}

      {status === 'mismatch' && (
        <div role="alert" className="flex flex-col items-center gap-3 px-4 py-12 text-center">
          <span className="text-4xl" aria-hidden="true">
            ⚠️
          </span>
          <p className="text-sm font-medium text-red-300">
            Hash mismatch &mdash; file may be tampered or corrupted
          </p>
          <p className="text-xs text-gray-500">
            Expected SHA-256:{' '}
            <code className="rounded bg-gray-800 px-1.5 py-0.5 font-mono text-red-400">
              {expectedHash}
            </code>
          </p>
          <button
            type="button"
            onClick={verify}
            className="mt-2 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-indigo-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
          >
            Retry verification
          </button>
        </div>
      )}

      {status === 'error' && (
        <div role="alert" className="flex flex-col items-center gap-3 px-4 py-12 text-center">
          <span className="text-4xl" aria-hidden="true">
            🚫
          </span>
          <p className="text-sm font-medium text-red-300">File unavailable</p>
          <p className="text-xs text-gray-500">{error}</p>
          <div className="flex items-center gap-2">
            <code className="max-w-[300px] truncate rounded bg-gray-800 px-2 py-1 font-mono text-xs text-gray-400">
              {cid}
            </code>
            <CopyButton text={cid} />
          </div>
          <button
            type="button"
            onClick={verify}
            className="mt-2 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-indigo-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
          >
            Retry
          </button>
        </div>
      )}
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = React.useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
    }
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      aria-label="Copy CID"
      className="rounded-md bg-gray-800 px-2.5 py-1.5 text-xs font-medium text-gray-300 transition-colors hover:bg-gray-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
    >
      {copied ? 'Copied!' : 'Copy CID'}
    </button>
  );
}

function TextViewer({ bytes, filename }: { bytes: ArrayBuffer; filename: string }) {
  const text = new TextDecoder('utf-8').decode(bytes);

  return (
    <div className="rounded-lg border border-gray-700 bg-gray-950 p-4">
      <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-all font-mono text-sm text-gray-300">
        {text}
      </pre>
      <p className="mt-2 text-center text-xs text-gray-500">{filename}</p>
    </div>
  );
}
