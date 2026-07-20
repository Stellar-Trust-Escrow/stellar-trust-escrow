'use client';

import React, { useState, useCallback } from 'react';
import { Document, Page } from 'react-pdf';
import 'react-pdf/dist/esm/Page/AnnotationLayer.css';
import 'react-pdf/dist/esm/Page/TextLayer.css';
import { cn } from '../../lib/utils';

export interface PdfViewerProps {
  file: ArrayBuffer;
  filename: string;
  className?: string;
}

const ZOOM_OPTIONS = [0.5, 0.75, 1, 1.25, 1.5] as const;

export default function PdfViewer({ file, filename, className }: PdfViewerProps) {
  const [numPages, setNumPages] = useState<number | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [scale, setScale] = useState(1);

  const onLoadSuccess = useCallback(({ numPages: n }: { numPages: number }) => {
    setNumPages(n);
  }, []);

  const goToPrevPage = useCallback(() => {
    setPageNumber((p) => Math.max(1, p - 1));
  }, []);

  const goToNextPage = useCallback(() => {
    setPageNumber((p) => Math.min(numPages ?? p, p + 1));
  }, [numPages]);

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <div className="flex items-center justify-between rounded-lg border border-gray-700 bg-gray-800/60 px-3 py-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={goToPrevPage}
            disabled={pageNumber <= 1}
            aria-label="Previous page"
            className="rounded-md p-1.5 text-gray-300 transition-colors hover:bg-gray-700 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
          >
            <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <path
                fillRule="evenodd"
                d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z"
                clipRule="evenodd"
              />
            </svg>
          </button>
          <span className="text-sm font-medium text-gray-200" aria-live="polite">
            Page {pageNumber} of {numPages ?? '?'}
          </span>
          <button
            type="button"
            onClick={goToNextPage}
            disabled={numPages !== null && pageNumber >= numPages}
            aria-label="Next page"
            className="rounded-md p-1.5 text-gray-300 transition-colors hover:bg-gray-700 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
          >
            <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <path
                fillRule="evenodd"
                d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"
                clipRule="evenodd"
              />
            </svg>
          </button>
        </div>

        <select
          value={scale}
          onChange={(e) => setScale(Number(e.target.value))}
          aria-label="Zoom level"
          className="rounded-md border border-gray-700 bg-gray-900 px-2 py-1 text-xs font-medium text-gray-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
        >
          {ZOOM_OPTIONS.map((z) => (
            <option key={z} value={z}>
              {Math.round(z * 100)}%
            </option>
          ))}
        </select>
      </div>

      <div className="flex justify-center overflow-auto rounded-lg border border-gray-700 bg-gray-900 p-4">
        <Document
          file={file}
          onLoadSuccess={onLoadSuccess}
          onLoadError={(err) => console.error('PDF load error:', err)}
          loading={
            <div className="flex h-48 items-center justify-center text-sm text-gray-400">
              Loading PDF...
            </div>
          }
          className="flex flex-col items-center"
        >
          <Page
            pageNumber={pageNumber}
            scale={scale}
            renderTextLayer
            renderAnnotationLayer
            className="shadow-xl"
          />
        </Document>
      </div>

      {numPages && (
        <p className="text-center text-xs text-gray-500">
          {filename} &mdash; {numPages} page{numPages !== 1 ? 's' : ''}
        </p>
      )}
    </div>
  );
}
