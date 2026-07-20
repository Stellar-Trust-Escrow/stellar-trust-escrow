'use client';

import React, { useRef, useState, useCallback, useEffect } from 'react';
import { cn } from '../../lib/utils';
import AnnotationCanvas from './AnnotationCanvas';

export interface ImageViewerProps {
  bytes: ArrayBuffer;
  filename: string;
  mimeType: 'image/jpeg' | 'image/png';
  className?: string;
}

export default function ImageViewer({ bytes, filename, mimeType, className }: ImageViewerProps) {
  const [naturalSize, setNaturalSize] = useState<{ width: number; height: number } | null>(null);
  const [showAnnotations, setShowAnnotations] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  const blob = new Blob([bytes], { type: mimeType });
  const url = URL.createObjectURL(blob);

  useEffect(() => {
    return () => URL.revokeObjectURL(url);
  }, [url]);

  const handleImageLoad = useCallback(() => {
    if (imgRef.current) {
      setNaturalSize({
        width: imgRef.current.naturalWidth,
        height: imgRef.current.naturalHeight,
      });
    }
  }, []);

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      {showAnnotations && naturalSize && (
        <AnnotationCanvas imageWidth={naturalSize.width} imageHeight={naturalSize.height} />
      )}

      <div
        ref={containerRef}
        className="relative flex items-start justify-center overflow-auto rounded-lg border border-gray-700 bg-gray-900 p-2"
      >
        <img
          ref={imgRef}
          src={url}
          alt={`Evidence: ${filename}`}
          onLoad={handleImageLoad}
          className="max-w-full h-auto rounded"
          draggable={false}
        />
      </div>

      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => setShowAnnotations((v) => !v)}
          className={cn(
            'rounded-md px-3 py-1.5 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400',
            showAnnotations
              ? 'bg-indigo-600 text-white'
              : 'bg-gray-700 text-gray-300 hover:bg-gray-600',
          )}
        >
          {showAnnotations ? 'Hide annotations' : 'Annotate'}
        </button>

        <a
          href={url}
          download={filename}
          className="rounded-md bg-gray-700 px-3 py-1.5 text-xs font-medium text-gray-300 transition-colors hover:bg-gray-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
        >
          Download
        </a>
      </div>

      {naturalSize && (
        <p className="text-center text-xs text-gray-500">
          {naturalSize.width} &times; {naturalSize.height}px
        </p>
      )}
    </div>
  );
}
