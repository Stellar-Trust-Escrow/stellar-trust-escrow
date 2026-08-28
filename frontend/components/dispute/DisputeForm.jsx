'use client';

/**
 * DisputeForm
 *
 * Accessible dispute submission form: reason textarea, drag-and-drop evidence
 * upload (chunked, with per-file SHA-256 hash display), and a focus-trapping
 * confirmation modal before the dispute is raised.
 *
 * @param {object} props
 * @param {string} props.escrowId — escrow the dispute is raised against
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import api from '../../lib/api/client';
import { MAX_FILES, sha256Hex, uploadFileChunked, validateFile } from '../../lib/fileUpload';

function ProgressBar({ value, label }) {
  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(value)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
      className="mt-2 h-1 overflow-hidden rounded-full bg-gray-700"
    >
      <div
        className="h-full rounded-full bg-indigo-500 transition-all duration-200 ease-out"
        style={{ width: `${value}%` }}
      />
    </div>
  );
}

function ConfirmDisputeModal({ open, confirming, onConfirm, onCancel }) {
  const dialogRef = useRef(null);
  const previouslyFocused = useRef(null);

  useEffect(() => {
    if (!open) return undefined;

    previouslyFocused.current = document.activeElement;
    const dialog = dialogRef.current;
    const getFocusable = () =>
      dialog
        ? Array.from(
            dialog.querySelectorAll(
              'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
            ),
          )
        : [];

    getFocusable()[0]?.focus();

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
        return;
      }
      if (e.key !== 'Tab') return;
      const focusable = getFocusable();
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      previouslyFocused.current?.focus?.();
    };
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="dispute-confirm-title"
        aria-describedby="dispute-confirm-desc"
        className="w-full max-w-md rounded-2xl border border-gray-800 bg-gray-900 p-6"
      >
        <h2 id="dispute-confirm-title" className="text-lg font-semibold text-gray-100">
          Raise this dispute?
        </h2>
        <p id="dispute-confirm-desc" className="mt-2 text-sm text-gray-400">
          This action raises a dispute. Funds will be frozen until an arbiter resolves it.
        </p>
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg px-4 py-2 text-sm font-medium text-gray-300 hover:bg-gray-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={confirming}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {confirming ? 'Submitting…' : 'Confirm dispute'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function DisputeForm({ escrowId }) {
  const router = useRouter();
  const inputRef = useRef(null);

  const [reason, setReason] = useState('');
  const [files, setFiles] = useState([]);
  const [isDragging, setIsDragging] = useState(false);
  const [queueError, setQueueError] = useState(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);

  const updateFile = (id, patch) =>
    setFiles((prev) => prev.map((f) => (f.id === id ? { ...f, ...patch } : f)));

  const processEntry = useCallback(async (entry) => {
    try {
      const hash = await sha256Hex(entry.file);
      updateFile(entry.id, { hash, status: 'uploading' });
      await uploadFileChunked(entry.file, {
        onProgress: (progress) => updateFile(entry.id, { progress }),
      });
      updateFile(entry.id, { status: 'done', progress: 100 });
    } catch (err) {
      updateFile(entry.id, { status: 'error', error: err?.message || 'Upload failed.' });
    }
  }, []);

  const processFiles = useCallback(
    (rawFiles) => {
      const incoming = [];
      let rejectedForCount = false;

      for (const raw of rawFiles) {
        if (files.length + incoming.length >= MAX_FILES) {
          rejectedForCount = true;
          break;
        }
        const { valid, error } = validateFile(raw);
        incoming.push({
          id: `${raw.name}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          file: raw,
          name: raw.name,
          size: raw.size,
          hash: null,
          progress: 0,
          status: valid ? 'hashing' : 'error',
          error: valid ? null : error,
        });
      }

      setQueueError(rejectedForCount ? `You can attach up to ${MAX_FILES} files.` : null);
      if (!incoming.length) return;

      setFiles((prev) => [...prev, ...incoming]);
      incoming.filter((entry) => entry.status !== 'error').forEach((entry) => processEntry(entry));
    },
    [files, processEntry],
  );

  const removeFile = (id) => setFiles((prev) => prev.filter((f) => f.id !== id));

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };
  const handleDragLeave = (e) => {
    if (!e.currentTarget.contains(e.relatedTarget)) setIsDragging(false);
  };
  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    processFiles(Array.from(e.dataTransfer.files));
  };
  const handleInputChange = (e) => {
    processFiles(Array.from(e.target.files));
    e.target.value = '';
  };

  const busy = files.some((f) => f.status === 'hashing' || f.status === 'uploading');
  const canSubmit = reason.trim().length > 0 && !submitting && !busy;
  const evidenceHashes = files.filter((f) => f.status === 'done' && f.hash).map((f) => f.hash);

  const handleOpenConfirm = (e) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitError(null);
    setShowConfirm(true);
  };

  const handleCancelConfirm = () => setShowConfirm(false);

  const handleConfirmSubmit = async () => {
    setSubmitting(true);
    setSubmitError(null);
    try {
      await api.post(`/v1/escrows/${escrowId}/dispute`, {
        reason: reason.trim(),
        evidenceHashes,
      });
      setShowConfirm(false);
      router.push(`/escrows/${escrowId}`);
    } catch (err) {
      setSubmitError(err?.response?.data?.message || err?.message || 'Failed to submit dispute.');
      setShowConfirm(false);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form
      onSubmit={handleOpenConfirm}
      className="w-full max-w-lg rounded-2xl border border-gray-800 bg-gray-900 p-6"
      noValidate
    >
      <h2 className="text-lg font-semibold text-gray-100">Raise a dispute</h2>
      <p className="mt-1 text-sm text-gray-400">
        Explain the problem and attach any supporting evidence.
      </p>

      {submitError && (
        <div
          role="alert"
          className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300"
        >
          {submitError}
        </div>
      )}

      <div className="mt-4">
        <label htmlFor="dispute-reason" className="block text-sm font-medium text-gray-200">
          Reason <span className="text-red-400">*</span>
        </label>
        <textarea
          id="dispute-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Describe the dispute…"
          rows={4}
          className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-800/60 px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
        />
      </div>

      <div className="mt-4">
        <span className="text-sm font-medium text-gray-200">Evidence</span>

        <div
          role="button"
          aria-label="Drag and drop evidence files, or use the button below to browse"
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`mt-2 flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-6 transition-colors ${
            isDragging ? 'border-indigo-500 bg-indigo-500/10' : 'border-gray-700 bg-gray-900/50'
          }`}
        >
          <p className="text-sm text-gray-400">Drag & drop files here</p>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="rounded-lg border border-gray-700 px-3 py-1.5 text-xs font-medium text-gray-300 hover:bg-gray-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
          >
            Browse files
          </button>
          <p className="text-xs text-gray-500">
            Images, PDF, or ZIP · max 20 MB each · up to {MAX_FILES} files
          </p>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept="image/*,application/pdf,application/zip"
            className="sr-only"
            aria-hidden="true"
            tabIndex={-1}
            onChange={handleInputChange}
          />
        </div>

        {queueError && (
          <p role="alert" className="mt-2 text-xs text-red-400">
            {queueError}
          </p>
        )}

        {files.length > 0 && (
          <ul aria-live="polite" aria-label="Evidence files" className="mt-3 space-y-2">
            {files.map((f) => (
              <li key={f.id} className="rounded-xl border border-gray-800 bg-gray-900 px-4 py-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate text-sm text-gray-200" title={f.name}>
                    {f.name}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeFile(f.id)}
                    aria-label={`Remove ${f.name}`}
                    className="ml-3 rounded p-1 text-gray-400 hover:text-red-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
                  >
                    ✕
                  </button>
                </div>

                {(f.status === 'hashing' || f.status === 'uploading') && (
                  <ProgressBar
                    value={f.status === 'hashing' ? 0 : f.progress}
                    label={`Upload progress for ${f.name}`}
                  />
                )}

                {f.hash && (
                  <p className="mt-2 break-all font-mono text-xs text-gray-500">SHA-256: {f.hash}</p>
                )}

                {f.status === 'done' && <p className="mt-2 text-xs text-emerald-400">Uploaded</p>}

                {f.error && (
                  <p role="alert" className="mt-2 text-xs text-red-400">
                    {f.error}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <button
        type="submit"
        disabled={!canSubmit}
        className="mt-6 inline-flex items-center justify-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400 disabled:cursor-not-allowed disabled:opacity-50"
      >
        Submit dispute
      </button>

      <ConfirmDisputeModal
        open={showConfirm}
        confirming={submitting}
        onConfirm={handleConfirmSubmit}
        onCancel={handleCancelConfirm}
      />
    </form>
  );
}
