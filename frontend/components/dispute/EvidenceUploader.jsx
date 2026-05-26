'use client';

/**
 * EvidenceUploader
 *
 * Drag-and-drop file upload zone for dispute evidence.
 * Supports PDF, PNG, JPG, TXT files up to 10 MB each.
 * Shows live upload progress, inline previews, and a lightbox viewer.
 *
 * @param {object}   props
 * @param {Function} props.onUpload  — called with File[] when files are accepted
 * @param {number}   [props.maxFiles=5]
 */

import { useCallback, useRef, useState } from 'react';
import { X, Upload, FileText, Image, Eye, ChevronLeft, ChevronRight } from 'lucide-react';

const ACCEPTED_TYPES = {
  'application/pdf': 'PDF',
  'image/png': 'PNG',
  'image/jpeg': 'JPG',
  'text/plain': 'TXT',
};
const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ── File icon ─────────────────────────────────────────────────────────────────

function FileIcon({ type }) {
  if (type.startsWith('image/')) return <Image size={18} className="text-indigo-400" />;
  return <FileText size={18} className="text-gray-400" />;
}

// ── Lightbox ──────────────────────────────────────────────────────────────────

function Lightbox({ files, index, onClose, onPrev, onNext }) {
  const file = files[index];
  if (!file) return null;

  const isImage = file.type.startsWith('image/');
  const url = URL.createObjectURL(file.raw);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`Preview: ${file.name}`}
      onClick={onClose}
    >
      <div
        className="relative max-w-3xl w-full bg-gray-900 border border-gray-700 rounded-2xl overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
          <span className="text-sm text-white font-medium truncate">{file.name}</span>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-white p-1 rounded-lg hover:bg-gray-800 transition-colors"
            aria-label="Close preview"
          >
            <X size={16} />
          </button>
        </div>

        {/* Content */}
        <div className="flex items-center justify-center min-h-64 p-4 bg-gray-950">
          {isImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt={file.name} className="max-h-[60vh] object-contain rounded-lg" />
          ) : (
            <div className="text-center text-gray-400 space-y-2">
              <FileText size={48} className="mx-auto text-gray-600" />
              <p className="text-sm">{file.name}</p>
              <p className="text-xs text-gray-600">{formatBytes(file.size)}</p>
              <a
                href={url}
                download={file.name}
                className="inline-block mt-2 text-indigo-400 hover:text-indigo-300 text-xs underline"
              >
                Download to view
              </a>
            </div>
          )}
        </div>

        {/* Navigation */}
        {files.length > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-800">
            <button
              onClick={onPrev}
              disabled={index === 0}
              className="flex items-center gap-1 text-sm text-gray-400 hover:text-white disabled:opacity-30 transition-colors"
              aria-label="Previous file"
            >
              <ChevronLeft size={16} /> Prev
            </button>
            <span className="text-xs text-gray-600">{index + 1} / {files.length}</span>
            <button
              onClick={onNext}
              disabled={index === files.length - 1}
              className="flex items-center gap-1 text-sm text-gray-400 hover:text-white disabled:opacity-30 transition-colors"
              aria-label="Next file"
            >
              Next <ChevronRight size={16} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function EvidenceUploader({ onUpload, maxFiles = 5 }) {
  const [files, setFiles] = useState([]);   // { id, name, size, type, raw, progress, error }
  const [isDragging, setIsDragging] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(null);
  const inputRef = useRef(null);

  const processFiles = useCallback((rawFiles) => {
    const accepted = [];
    for (const raw of rawFiles) {
      if (files.length + accepted.length >= maxFiles) break;

      let error = null;
      if (!ACCEPTED_TYPES[raw.type]) {
        error = `Unsupported type. Allowed: ${Object.values(ACCEPTED_TYPES).join(', ')}`;
      } else if (raw.size > MAX_SIZE_BYTES) {
        error = `File too large (max ${formatBytes(MAX_SIZE_BYTES)})`;
      }

      accepted.push({
        id: `${raw.name}-${Date.now()}-${Math.random()}`,
        name: raw.name,
        size: raw.size,
        type: raw.type,
        raw,
        progress: error ? 0 : 0,
        error,
      });
    }

    if (accepted.length === 0) return;

    setFiles((prev) => {
      const next = [...prev, ...accepted];
      // Simulate upload progress for valid files
      accepted.filter((f) => !f.error).forEach((f) => simulateUpload(f.id));
      onUpload?.(next.filter((f) => !f.error).map((f) => f.raw));
      return next;
    });
  }, [files, maxFiles, onUpload]);

  const simulateUpload = (id) => {
    let progress = 0;
    const interval = setInterval(() => {
      progress += Math.random() * 25 + 10;
      if (progress >= 100) {
        progress = 100;
        clearInterval(interval);
      }
      setFiles((prev) =>
        prev.map((f) => (f.id === id ? { ...f, progress: Math.min(progress, 100) } : f)),
      );
    }, 150);
  };

  const removeFile = (id) => setFiles((prev) => prev.filter((f) => f.id !== id));

  // ── Drag handlers ─────────────────────────────────────────────────────────

  const onDragOver = (e) => { e.preventDefault(); setIsDragging(true); };
  const onDragLeave = () => setIsDragging(false);
  const onDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    processFiles([...e.dataTransfer.files]);
  };

  // ── Keyboard activation of drop zone ─────────────────────────────────────

  const onKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      inputRef.current?.click();
    }
  };

  return (
    <div className="space-y-4">
      {/* Drop zone */}
      <div
        role="button"
        tabIndex={0}
        aria-label="Upload evidence files. Press Enter or Space to open file picker."
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        onKeyDown={onKeyDown}
        className={`
          relative flex flex-col items-center justify-center gap-3
          border-2 border-dashed rounded-2xl p-8 cursor-pointer
          transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-indigo-500
          ${isDragging
            ? 'border-indigo-500 bg-indigo-500/10 scale-[1.01]'
            : 'border-gray-700 bg-gray-900/50 hover:border-gray-600 hover:bg-gray-900'
          }
          ${files.length >= maxFiles ? 'opacity-50 pointer-events-none' : ''}
        `}
      >
        <Upload
          size={28}
          className={`transition-colors ${isDragging ? 'text-indigo-400' : 'text-gray-500'}`}
          aria-hidden="true"
        />
        <div className="text-center">
          <p className="text-sm text-gray-300 font-medium">
            {isDragging ? 'Drop files here' : 'Drag & drop or click to upload'}
          </p>
          <p className="text-xs text-gray-500 mt-1">
            PDF, PNG, JPG, TXT · max {formatBytes(MAX_SIZE_BYTES)} each · up to {maxFiles} files
          </p>
        </div>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={Object.keys(ACCEPTED_TYPES).join(',')}
          className="sr-only"
          aria-hidden="true"
          tabIndex={-1}
          onChange={(e) => processFiles([...e.target.files])}
        />
      </div>

      {/* File list */}
      {files.length > 0 && (
        <ul className="space-y-2" aria-label="Uploaded files">
          {files.map((file, i) => (
            <li
              key={file.id}
              className="flex items-center gap-3 bg-gray-900 border border-gray-800 rounded-xl px-4 py-3"
            >
              <FileIcon type={file.type} />

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm text-white truncate">{file.name}</span>
                  <span className="text-xs text-gray-500 flex-shrink-0">{formatBytes(file.size)}</span>
                </div>

                {file.error ? (
                  <p className="text-xs text-red-400 mt-0.5" role="alert">{file.error}</p>
                ) : file.progress < 100 ? (
                  <div className="mt-1.5">
                    <div
                      className="h-1 bg-gray-800 rounded-full overflow-hidden"
                      role="progressbar"
                      aria-valuenow={Math.round(file.progress)}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-label={`Uploading ${file.name}`}
                    >
                      <div
                        className="h-full bg-indigo-500 rounded-full transition-all duration-150"
                        style={{ width: `${file.progress}%` }}
                      />
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-emerald-400 mt-0.5">Uploaded</p>
                )}
              </div>

              {/* Preview button */}
              {!file.error && file.progress === 100 && (
                <button
                  onClick={() => setLightboxIndex(i)}
                  className="text-gray-500 hover:text-indigo-400 transition-colors p-1 rounded-lg hover:bg-gray-800"
                  aria-label={`Preview ${file.name}`}
                >
                  <Eye size={15} />
                </button>
              )}

              {/* Remove button */}
              <button
                onClick={() => removeFile(file.id)}
                className="text-gray-600 hover:text-red-400 transition-colors p-1 rounded-lg hover:bg-gray-800"
                aria-label={`Remove ${file.name}`}
              >
                <X size={15} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Lightbox */}
      {lightboxIndex !== null && (
        <Lightbox
          files={files.filter((f) => !f.error && f.progress === 100)}
          index={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onPrev={() => setLightboxIndex((i) => Math.max(0, i - 1))}
          onNext={() => setLightboxIndex((i) => Math.min(files.length - 1, i + 1))}
        />
      )}
    </div>
  );
}
