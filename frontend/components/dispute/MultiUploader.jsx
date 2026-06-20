'use client';

/**
 * MultiUploader
 *
 * Drag-and-drop multi-file evidence uploader for dispute resolution.
 * Supports queuing, per-file progress, captions, retry, cancel, and reorder.
 *
 * @param {object}   props
 * @param {Function} [props.onUpload]          — called with accepted File[] on each addition
 * @param {number}   [props.maxFiles=10]       — max number of files in the queue
 * @param {number}   [props.maxTotalMB=50]     — total size cap in MB
 * @param {string[]} [props.accept]            — MIME types; defaults to PDF/PNG/JPG/TXT
 */

import { useCallback, useRef, useState } from 'react';
import {
  Upload,
  X,
  RotateCcw,
  FileText,
  Image as ImageIcon,
  GripVertical,
  CheckCircle2,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import { cn } from '../../lib/utils';

// ── Constants ─────────────────────────────────────────────────────────────────

const DEFAULT_ACCEPT = {
  'application/pdf': 'PDF',
  'image/png': 'PNG',
  'image/jpeg': 'JPG',
  'text/plain': 'TXT',
};
const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB per file

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function FileTypeIcon({ mimeType }) {
  if (mimeType.startsWith('image/'))
    return <ImageIcon size={16} className="text-indigo-400 shrink-0" aria-hidden="true" />;
  return <FileText size={16} className="text-gray-400 shrink-0" aria-hidden="true" />;
}

/** Animated progress bar for an individual file item. */
function ProgressBar({ value }) {
  return (
    <div
      className="h-1 bg-gray-700 rounded-full overflow-hidden mt-1.5"
      role="progressbar"
      aria-valuenow={Math.round(value)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className="h-full bg-indigo-500 rounded-full transition-all duration-200 ease-out"
        style={{ width: `${value}%` }}
      />
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function MultiUploader({ onUpload, maxFiles = 10, maxTotalMB = 50, accept }) {
  const acceptedTypes = accept
    ? Object.fromEntries(accept.map((t) => [t, t.split('/')[1].toUpperCase()]))
    : DEFAULT_ACCEPT;

  const maxTotalBytes = maxTotalMB * 1024 * 1024;

  /**
   * File entry shape:
   *   { id, name, size, type, raw, caption, progress, status, error }
   *   status: 'uploading' | 'done' | 'error' | 'cancelled'
   */
  const [files, setFiles] = useState([]);
  const [isDragging, setIsDragging] = useState(false);
  const [dragOverId, setDragOverId] = useState(null); // for reorder highlight
  const inputRef = useRef(null);
  const dragSrcId = useRef(null); // id of item being dragged for reorder

  // ── Derived totals ──────────────────────────────────────────────────────────

  const totalBytes = files.reduce((sum, f) => sum + f.size, 0);
  const totalBytesExceeded = totalBytes > maxTotalBytes;

  // ── Upload simulation ───────────────────────────────────────────────────────

  const simulateUpload = useCallback((id) => {
    let progress = 0;
    const tick = () => {
      setFiles((prev) => {
        const entry = prev.find((f) => f.id === id);
        // Stop if cancelled or removed
        if (!entry || entry.status === 'cancelled') return prev;

        progress = Math.min(progress + Math.random() * 20 + 8, 100);
        const done = progress >= 100;
        return prev.map((f) =>
          f.id === id ? { ...f, progress, status: done ? 'done' : 'uploading' } : f,
        );
      });

      if (progress < 100) setTimeout(tick, 120 + Math.random() * 80);
    };
    setTimeout(tick, 80);
  }, []);

  // ── File processing ─────────────────────────────────────────────────────────

  const processFiles = useCallback(
    (rawFiles) => {
      const incoming = [];

      for (const raw of rawFiles) {
        if (files.length + incoming.length >= maxFiles) break;

        let error = null;
        if (!acceptedTypes[raw.type]) {
          error = `Type not allowed. Accepted: ${Object.values(acceptedTypes).join(', ')}`;
        } else if (raw.size > MAX_FILE_BYTES) {
          error = `Exceeds 10 MB limit (${formatBytes(raw.size)})`;
        } else if (
          totalBytes + incoming.reduce((s, f) => s + f.size, 0) + raw.size >
          maxTotalBytes
        ) {
          error = `Would exceed total ${maxTotalMB} MB limit`;
        }

        incoming.push({
          id: `${raw.name}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          name: raw.name,
          size: raw.size,
          type: raw.type,
          raw,
          caption: '',
          progress: error ? 0 : 0,
          status: error ? 'error' : 'uploading',
          error,
        });
      }

      if (!incoming.length) return;

      setFiles((prev) => [...prev, ...incoming]);
      incoming.filter((f) => !f.error).forEach((f) => simulateUpload(f.id));
      onUpload?.(incoming.filter((f) => !f.error).map((f) => f.raw));
    },
    [
      files,
      maxFiles,
      maxTotalBytes,
      maxTotalMB,
      totalBytes,
      acceptedTypes,
      simulateUpload,
      onUpload,
    ],
  );

  // ── Item actions ────────────────────────────────────────────────────────────

  const cancelUpload = (id) =>
    setFiles((prev) =>
      prev.map((f) =>
        f.id === id && f.status === 'uploading' ? { ...f, status: 'cancelled' } : f,
      ),
    );

  const retryUpload = (id) => {
    setFiles((prev) =>
      prev.map((f) => (f.id === id ? { ...f, progress: 0, status: 'uploading', error: null } : f)),
    );
    simulateUpload(id);
  };

  const removeFile = (id) => setFiles((prev) => prev.filter((f) => f.id !== id));

  const updateCaption = (id, caption) =>
    setFiles((prev) => prev.map((f) => (f.id === id ? { ...f, caption } : f)));

  // ── Drag-and-drop (drop zone) ───────────────────────────────────────────────

  const onDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };
  const onDragLeave = (e) => {
    // Only clear when leaving the zone entirely
    if (!e.currentTarget.contains(e.relatedTarget)) setIsDragging(false);
  };
  const onDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    processFiles([...e.dataTransfer.files]);
  };
  const onKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      inputRef.current?.click();
    }
  };

  // ── Drag-and-drop (reorder) ─────────────────────────────────────────────────

  const onItemDragStart = (e, id) => {
    dragSrcId.current = id;
    e.dataTransfer.effectAllowed = 'move';
  };
  const onItemDragOver = (e, id) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverId(id);
  };
  const onItemDrop = (e, targetId) => {
    e.preventDefault();
    setDragOverId(null);
    const srcId = dragSrcId.current;
    if (!srcId || srcId === targetId) return;
    setFiles((prev) => {
      const arr = [...prev];
      const srcIdx = arr.findIndex((f) => f.id === srcId);
      const tgtIdx = arr.findIndex((f) => f.id === targetId);
      const [moved] = arr.splice(srcIdx, 1);
      arr.splice(tgtIdx, 0, moved);
      return arr;
    });
  };
  const onItemDragEnd = () => {
    dragSrcId.current = null;
    setDragOverId(null);
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  const atLimit = files.length >= maxFiles;

  return (
    <section className="space-y-4" aria-label="Multi-file evidence uploader">
      {/* ── Drop zone ── */}
      <div
        role="button"
        tabIndex={atLimit ? -1 : 0}
        aria-label={
          atLimit
            ? `File limit reached (${maxFiles})`
            : 'Drop files here or press Enter to open file picker'
        }
        aria-disabled={atLimit}
        onDragOver={atLimit ? undefined : onDragOver}
        onDragLeave={onDragLeave}
        onDrop={atLimit ? undefined : onDrop}
        onClick={atLimit ? undefined : () => inputRef.current?.click()}
        onKeyDown={atLimit ? undefined : onKeyDown}
        className={cn(
          'relative flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed p-10 cursor-pointer',
          'transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500',
          isDragging
            ? 'border-indigo-500 bg-indigo-500/10 scale-[1.015]'
            : 'border-gray-700 bg-gray-900/50 hover:border-indigo-600 hover:bg-gray-900',
          atLimit && 'opacity-40 cursor-not-allowed pointer-events-none',
        )}
      >
        <Upload
          size={30}
          className={cn(
            'transition-colors duration-200',
            isDragging ? 'text-indigo-400' : 'text-gray-500',
          )}
          aria-hidden="true"
        />
        <div className="text-center select-none">
          <p className="text-sm font-medium text-gray-200">
            {isDragging ? 'Release to add files' : 'Drag & drop files, or click to browse'}
          </p>
          <p className="mt-1 text-xs text-gray-500">
            {Object.values(acceptedTypes).join(', ')} · max 10 MB each · up to {maxFiles} files ·{' '}
            {maxTotalMB} MB total
          </p>
        </div>

        <input
          ref={inputRef}
          type="file"
          multiple
          accept={Object.keys(acceptedTypes).join(',')}
          className="sr-only"
          aria-hidden="true"
          tabIndex={-1}
          onChange={(e) => {
            processFiles([...e.target.files]);
            e.target.value = '';
          }}
        />
      </div>

      {/* ── Total size indicator ── */}
      {files.length > 0 && (
        <div className="flex items-center justify-between text-xs px-1">
          <span className="text-gray-500">
            {files.length} file{files.length !== 1 ? 's' : ''} · {formatBytes(totalBytes)} total
          </span>
          {totalBytesExceeded && (
            <span className="text-red-400 flex items-center gap-1" role="alert">
              <AlertCircle size={12} aria-hidden="true" />
              Exceeds {maxTotalMB} MB limit
            </span>
          )}
        </div>
      )}

      {/* ── File grid ── */}
      {files.length > 0 && (
        <ul className="grid gap-2 sm:grid-cols-1" aria-label="Queued files" aria-live="polite">
          {files.map((file) => (
            <li
              key={file.id}
              draggable
              onDragStart={(e) => onItemDragStart(e, file.id)}
              onDragOver={(e) => onItemDragOver(e, file.id)}
              onDrop={(e) => onItemDrop(e, file.id)}
              onDragEnd={onItemDragEnd}
              className={cn(
                'group flex flex-col gap-2 rounded-xl border bg-gray-900 px-4 py-3',
                'transition-all duration-150 animate-fade-in',
                dragOverId === file.id
                  ? 'border-indigo-500 bg-indigo-500/10'
                  : 'border-gray-800 hover:border-gray-700',
              )}
            >
              {/* Row 1: icon + name + size + status controls */}
              <div className="flex items-center gap-2">
                {/* Drag handle */}
                <GripVertical
                  size={14}
                  className="text-gray-600 cursor-grab active:cursor-grabbing shrink-0"
                  aria-hidden="true"
                />

                <FileTypeIcon mimeType={file.type} />

                <span className="flex-1 min-w-0 text-sm text-white truncate" title={file.name}>
                  {file.name}
                </span>

                <span className="text-xs text-gray-500 shrink-0">{formatBytes(file.size)}</span>

                {/* Status icon */}
                {file.status === 'uploading' && (
                  <Loader2
                    size={14}
                    className="text-indigo-400 animate-spin shrink-0"
                    aria-label="Uploading"
                  />
                )}
                {file.status === 'done' && (
                  <CheckCircle2
                    size={14}
                    className="text-emerald-400 shrink-0"
                    aria-label="Upload complete"
                  />
                )}
                {(file.status === 'error' || file.status === 'cancelled') && (
                  <AlertCircle
                    size={14}
                    className="text-red-400 shrink-0"
                    aria-label={file.status}
                  />
                )}

                {/* Retry (error / cancelled) */}
                {(file.status === 'error' && !file.error) || file.status === 'cancelled' ? (
                  <button
                    onClick={() => retryUpload(file.id)}
                    className="p-1 rounded-lg text-gray-500 hover:text-indigo-400 hover:bg-gray-800 transition-colors"
                    aria-label={`Retry upload for ${file.name}`}
                  >
                    <RotateCcw size={13} />
                  </button>
                ) : null}

                {/* Cancel (while uploading) */}
                {file.status === 'uploading' && (
                  <button
                    onClick={() => cancelUpload(file.id)}
                    className="p-1 rounded-lg text-gray-500 hover:text-yellow-400 hover:bg-gray-800 transition-colors"
                    aria-label={`Cancel upload for ${file.name}`}
                  >
                    <X size={13} />
                  </button>
                )}

                {/* Remove */}
                {file.status !== 'uploading' && (
                  <button
                    onClick={() => removeFile(file.id)}
                    className="p-1 rounded-lg text-gray-600 hover:text-red-400 hover:bg-gray-800 transition-colors"
                    aria-label={`Remove ${file.name}`}
                  >
                    <X size={13} />
                  </button>
                )}
              </div>

              {/* Progress bar */}
              {file.status === 'uploading' && <ProgressBar value={file.progress} />}

              {/* Validation error */}
              {file.error && (
                <p className="text-xs text-red-400" role="alert">
                  {file.error}
                </p>
              )}

              {/* Caption input (shown once done or while uploading) */}
              {(file.status === 'done' || file.status === 'uploading') && (
                <input
                  type="text"
                  value={file.caption}
                  onChange={(e) => updateCaption(file.id, e.target.value)}
                  placeholder="Add a caption for this evidence…"
                  maxLength={200}
                  aria-label={`Caption for ${file.name}`}
                  className={cn(
                    'w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-1.5',
                    'text-xs text-gray-200 placeholder-gray-600',
                    'focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent',
                    'transition-colors duration-150',
                  )}
                />
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
