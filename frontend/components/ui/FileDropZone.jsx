'use client';

/**
 * FileDropZone — Premium drag-and-drop multi-file uploader
 *
 * Features:
 * - Dotted drop zone with glowing border on hover/drag
 * - Live progress bars per file
 * - Upload cancel buttons
 * - File size and type validation with inline alerts
 * - Micro-animations: slide-ins, fades, progress transitions
 * - Screen reader live region for upload progress
 * - Dark-mode glassmorphic styling
 *
 * @param {object}   props
 * @param {Function} [props.onFilesAccepted]  — called with accepted File[] on drop
 * @param {Function} [props.onUpload]         — async (file) => void, called per file
 * @param {string[]} [props.acceptedTypes]    — MIME types, default: common doc/image types
 * @param {number}   [props.maxSizeBytes]     — default 10 MB
 * @param {number}   [props.maxFiles]         — default 10
 * @param {string}   [props.className]
 */

import { useCallback, useRef, useState, useId } from 'react';
import { Upload, X, FileText, Image, Film, File, CheckCircle, AlertCircle } from 'lucide-react';

const DEFAULT_ACCEPTED = {
  'application/pdf': 'PDF',
  'image/png': 'PNG',
  'image/jpeg': 'JPG',
  'image/gif': 'GIF',
  'image/webp': 'WEBP',
  'text/plain': 'TXT',
  'video/mp4': 'MP4',
};

const DEFAULT_MAX_SIZE = 10 * 1024 * 1024; // 10 MB
const DEFAULT_MAX_FILES = 10;

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileIcon(type) {
  if (type.startsWith('image/'))
    return <Image size={16} className="text-indigo-400" aria-hidden="true" />;
  if (type.startsWith('video/'))
    return <Film size={16} className="text-purple-400" aria-hidden="true" />;
  if (type === 'application/pdf')
    return <FileText size={16} className="text-red-400" aria-hidden="true" />;
  return <File size={16} className="text-gray-400" aria-hidden="true" />;
}

// ── File row ──────────────────────────────────────────────────────────────────

function FileRow({ file, onCancel }) {
  const isDone = file.progress >= 100 && !file.error;
  const isCancelled = file.cancelled;

  return (
    <li
      className="flex items-center gap-3 rounded-xl px-4 py-3 transition-all duration-300"
      style={{
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.06)',
        animation: 'slideInFile 0.25s ease-out both',
        opacity: isCancelled ? 0.4 : 1,
      }}
      aria-label={`${file.name}${file.error ? `, error: ${file.error}` : isDone ? ', uploaded' : `, ${Math.round(file.progress)}% uploaded`}`}
    >
      {/* Icon */}
      <div className="flex-shrink-0">{getFileIcon(file.type)}</div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2 mb-1">
          <span className="text-xs text-white font-medium truncate">{file.name}</span>
          <span className="text-[10px] text-gray-500 flex-shrink-0">{formatBytes(file.size)}</span>
        </div>

        {file.error ? (
          <p className="text-[11px] text-red-400 flex items-center gap-1" role="alert">
            <AlertCircle size={11} aria-hidden="true" />
            {file.error}
          </p>
        ) : isCancelled ? (
          <p className="text-[11px] text-gray-500">Cancelled</p>
        ) : isDone ? (
          <p className="text-[11px] text-emerald-400 flex items-center gap-1">
            <CheckCircle size={11} aria-hidden="true" />
            Uploaded
          </p>
        ) : (
          <div
            className="h-1 rounded-full overflow-hidden"
            style={{ background: 'rgba(255,255,255,0.08)' }}
            role="progressbar"
            aria-valuenow={Math.round(file.progress)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`Uploading ${file.name}: ${Math.round(file.progress)}%`}
          >
            <div
              className="h-full rounded-full transition-all duration-200"
              style={{
                width: `${file.progress}%`,
                background: 'linear-gradient(90deg, #6366f1, #8b5cf6)',
                boxShadow: '0 0 6px rgba(99,102,241,0.5)',
              }}
            />
          </div>
        )}
      </div>

      {/* Cancel / remove */}
      {!isCancelled && (
        <button
          onClick={() => onCancel(file.id)}
          className="flex-shrink-0 text-gray-600 hover:text-red-400 p-1 rounded-lg hover:bg-white/5 transition-colors focus:outline-none focus:ring-2 focus:ring-red-500"
          aria-label={isDone ? `Remove ${file.name}` : `Cancel upload of ${file.name}`}
        >
          <X size={14} />
        </button>
      )}
    </li>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function FileDropZone({
  onFilesAccepted,
  onUpload,
  acceptedTypes = DEFAULT_ACCEPTED,
  maxSizeBytes = DEFAULT_MAX_SIZE,
  maxFiles = DEFAULT_MAX_FILES,
  className = '',
}) {
  const [files, setFiles] = useState([]);
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef(null);
  const liveRef = useRef(null);
  const cancelRefs = useRef({});
  const dropZoneId = useId();

  const announce = useCallback((msg) => {
    if (liveRef.current) liveRef.current.textContent = msg;
  }, []);

  const processFiles = useCallback(
    (rawFiles) => {
      const newEntries = [];
      const currentCount = files.filter((f) => !f.cancelled).length;

      for (const raw of rawFiles) {
        if (currentCount + newEntries.length >= maxFiles) break;

        let error = null;
        if (!acceptedTypes[raw.type]) {
          error = `Unsupported type. Allowed: ${Object.values(acceptedTypes).join(', ')}`;
        } else if (raw.size > maxSizeBytes) {
          error = `Too large (max ${formatBytes(maxSizeBytes)})`;
        }

        newEntries.push({
          id: `${raw.name}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          name: raw.name,
          size: raw.size,
          type: raw.type,
          raw,
          progress: 0,
          error,
          cancelled: false,
        });
      }

      if (newEntries.length === 0) return;

      setFiles((prev) => [...prev, ...newEntries]);

      const valid = newEntries.filter((f) => !f.error);
      onFilesAccepted?.(valid.map((f) => f.raw));

      // Start upload simulation / real upload per file
      valid.forEach((entry) => startUpload(entry));

      announce(
        `${valid.length} file${valid.length !== 1 ? 's' : ''} added. ${
          newEntries.length - valid.length
        } rejected.`,
      );
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [files, maxFiles, maxSizeBytes, acceptedTypes, onFilesAccepted, announce],
  );

  const startUpload = useCallback(
    (entry) => {
      if (onUpload) {
        // Real upload path
        let cancelled = false;
        cancelRefs.current[entry.id] = () => {
          cancelled = true;
        };

        Promise.resolve(
          onUpload(entry.raw, (progress) => {
            if (cancelled) return;
            setFiles((prev) => prev.map((f) => (f.id === entry.id ? { ...f, progress } : f)));
            announce(`${entry.name}: ${Math.round(progress)}% uploaded`);
          }),
        )
          .then(() => {
            if (cancelled) return;
            setFiles((prev) => prev.map((f) => (f.id === entry.id ? { ...f, progress: 100 } : f)));
            announce(`${entry.name} uploaded successfully`);
          })
          .catch((err) => {
            if (cancelled) return;
            setFiles((prev) =>
              prev.map((f) =>
                f.id === entry.id ? { ...f, error: err.message || 'Upload failed' } : f,
              ),
            );
          });
      } else {
        // Simulated upload
        let progress = 0;
        const interval = setInterval(() => {
          if (cancelRefs.current[entry.id] === 'cancelled') {
            clearInterval(interval);
            return;
          }
          progress += Math.random() * 20 + 8;
          const clamped = Math.min(progress, 100);
          setFiles((prev) =>
            prev.map((f) => (f.id === entry.id ? { ...f, progress: clamped } : f)),
          );
          if (clamped >= 100) {
            clearInterval(interval);
            announce(`${entry.name} uploaded`);
          }
        }, 120);
        cancelRefs.current[entry.id] = () => clearInterval(interval);
      }
    },
    [onUpload, announce],
  );

  const cancelFile = useCallback((id) => {
    const cancel = cancelRefs.current[id];
    if (typeof cancel === 'function') {
      cancel();
      cancelRefs.current[id] = 'cancelled';
    }
    setFiles((prev) => prev.map((f) => (f.id === id ? { ...f, cancelled: true } : f)));
  }, []);

  // ── Drag handlers ─────────────────────────────────────────────────────────

  const onDragOver = useCallback((e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    setIsDragging(true);
  }, []);

  const onDragLeave = useCallback((e) => {
    // Only clear if leaving the drop zone entirely
    if (!e.currentTarget.contains(e.relatedTarget)) {
      setIsDragging(false);
    }
  }, []);

  const onDrop = useCallback(
    (e) => {
      e.preventDefault();
      setIsDragging(false);
      processFiles([...e.dataTransfer.files]);
    },
    [processFiles],
  );

  const onKeyDown = useCallback((e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      inputRef.current?.click();
    }
  }, []);

  const activeCount = files.filter((f) => !f.cancelled).length;
  const isFull = activeCount >= maxFiles;

  return (
    <div className={`space-y-3 ${className}`}>
      {/* Inline keyframe styles */}
      <style>{`
        @keyframes slideInFile {
          from { opacity: 0; transform: translateY(-8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes glowPulse {
          0%, 100% { box-shadow: 0 0 12px rgba(99,102,241,0.4), 0 0 24px rgba(99,102,241,0.2); }
          50%       { box-shadow: 0 0 20px rgba(99,102,241,0.7), 0 0 40px rgba(99,102,241,0.3); }
        }
      `}</style>

      {/* Drop zone */}
      <div
        id={dropZoneId}
        role="button"
        tabIndex={isFull ? -1 : 0}
        aria-label={
          isFull
            ? `File upload zone — maximum ${maxFiles} files reached`
            : `Drag and drop files here, or press Enter to open file picker. Accepted: ${Object.values(acceptedTypes).join(', ')}. Max size: ${formatBytes(maxSizeBytes)}.`
        }
        aria-disabled={isFull}
        onDragOver={isFull ? undefined : onDragOver}
        onDragLeave={onDragLeave}
        onDrop={isFull ? undefined : onDrop}
        onClick={isFull ? undefined : () => inputRef.current?.click()}
        onKeyDown={isFull ? undefined : onKeyDown}
        className={`
          relative flex flex-col items-center justify-center gap-4
          border-2 border-dashed rounded-2xl p-10 cursor-pointer
          transition-all duration-250 select-none
          focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-gray-950
          ${isFull ? 'opacity-40 cursor-not-allowed' : ''}
        `}
        style={{
          background: isDragging ? 'rgba(99,102,241,0.08)' : 'rgba(255,255,255,0.02)',
          borderColor: isDragging ? '#6366f1' : 'rgba(255,255,255,0.12)',
          animation: isDragging ? 'glowPulse 1.5s ease-in-out infinite' : 'none',
          boxShadow: isDragging
            ? '0 0 20px rgba(99,102,241,0.4), inset 0 0 20px rgba(99,102,241,0.05)'
            : 'none',
          transition: 'border-color 0.2s, background 0.2s, box-shadow 0.2s',
        }}
      >
        {/* Upload icon */}
        <div
          className="w-14 h-14 rounded-2xl flex items-center justify-center transition-all duration-300"
          style={{
            background: isDragging ? 'rgba(99,102,241,0.2)' : 'rgba(255,255,255,0.04)',
            boxShadow: isDragging ? '0 0 16px rgba(99,102,241,0.5)' : 'none',
          }}
        >
          <Upload
            size={24}
            className="transition-colors duration-300"
            style={{ color: isDragging ? '#818cf8' : '#6b7280' }}
            aria-hidden="true"
          />
        </div>

        <div className="text-center space-y-1">
          <p className="text-sm font-medium" style={{ color: isDragging ? '#a5b4fc' : '#d1d5db' }}>
            {isDragging ? 'Release to upload' : 'Drag & drop files here'}
          </p>
          <p className="text-xs text-gray-500">
            or <span className="text-indigo-400 underline underline-offset-2">browse files</span>
          </p>
          <p className="text-[11px] text-gray-600 mt-1">
            {Object.values(acceptedTypes).join(', ')} · max {formatBytes(maxSizeBytes)} · up to{' '}
            {maxFiles} files
          </p>
        </div>

        {/* File count indicator */}
        {activeCount > 0 && (
          <div
            className="absolute top-3 right-3 text-[10px] font-medium px-2 py-0.5 rounded-full"
            style={{
              background: 'rgba(99,102,241,0.2)',
              color: '#a5b4fc',
              border: '1px solid rgba(99,102,241,0.3)',
            }}
            aria-hidden="true"
          >
            {activeCount}/{maxFiles}
          </div>
        )}

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

      {/* File list */}
      {files.length > 0 && (
        <ul
          className="space-y-2"
          aria-label="Selected files"
          aria-live="polite"
          aria-relevant="additions removals"
        >
          {files.map((file) => (
            <FileRow key={file.id} file={file} onCancel={cancelFile} />
          ))}
        </ul>
      )}

      {/* Screen reader live region */}
      <div
        ref={liveRef}
        role="status"
        aria-live="assertive"
        aria-atomic="true"
        className="sr-only"
      />
    </div>
  );
}
