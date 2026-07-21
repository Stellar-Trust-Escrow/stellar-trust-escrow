/**
 * ExportModal Component
 *
 * Lets a user export their escrow history as CSV or XLSX. The export runs as a
 * background job on the server; this modal enqueues it, shows live progress via
 * polling, and reveals a signed, short-lived download link when it completes.
 *
 * @param {object}   props
 * @param {boolean}  props.isOpen
 * @param {Function} props.onClose
 */

'use client';

import { useState } from 'react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Progress from '../ui/Progress';
import { useEscrowExport } from '../../hooks/useEscrowExport';

const FORMATS = [
  { value: 'csv', label: 'CSV' },
  { value: 'xlsx', label: 'Excel (XLSX)' },
];

const STATUSES = ['Active', 'Completed', 'Disputed', 'Cancelled'];

export default function ExportModal({ isOpen, onClose }) {
  const [format, setFormat] = useState('csv');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [statuses, setStatuses] = useState([]);

  const {
    phase,
    progress,
    downloadUrl,
    error,
    estimatedSeconds,
    isBusy,
    startExport,
    retry,
    reset,
  } = useEscrowExport();

  const invalidRange = Boolean(dateFrom && dateTo && dateTo < dateFrom);
  const canSubmit = Boolean(dateFrom && dateTo) && !invalidRange && !isBusy;

  const toggleStatus = (status) => {
    setStatuses((prev) =>
      prev.includes(status) ? prev.filter((s) => s !== status) : [...prev, status],
    );
  };

  const handleSubmit = () => {
    if (!canSubmit) return;
    startExport({
      format,
      dateFrom,
      dateTo,
      status: statuses.length ? statuses : undefined,
    });
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleDownload = () => {
    if (downloadUrl && typeof window !== 'undefined') {
      window.open(downloadUrl, '_blank', 'noopener,noreferrer');
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Export Escrow History">
      <div className="space-y-5">
        {/* Format */}
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-gray-300">Format</legend>
          <div className="flex gap-2">
            {FORMATS.map((f) => (
              <button
                key={f.value}
                type="button"
                onClick={() => setFormat(f.value)}
                aria-pressed={format === f.value}
                disabled={isBusy}
                className={`flex-1 rounded-lg border px-3 py-2 text-sm transition-colors ${
                  format === f.value
                    ? 'border-brand-500 bg-brand-500/10 text-white'
                    : 'border-gray-700 text-gray-400 hover:border-gray-600'
                } ${isBusy ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </fieldset>

        {/* Date range */}
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-gray-300">Date range</legend>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1 text-xs text-gray-500">
              From
              <input
                type="date"
                value={dateFrom}
                max={dateTo || undefined}
                disabled={isBusy}
                onChange={(e) => setDateFrom(e.target.value)}
                className="rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white
                           focus:border-brand-500 focus:outline-none disabled:opacity-50"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-gray-500">
              To
              <input
                type="date"
                value={dateTo}
                min={dateFrom || undefined}
                disabled={isBusy}
                onChange={(e) => setDateTo(e.target.value)}
                className="rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white
                           focus:border-brand-500 focus:outline-none disabled:opacity-50"
              />
            </label>
          </div>
          {invalidRange && (
            <p className="text-xs text-red-400">The end date must be on or after the start date.</p>
          )}
        </fieldset>

        {/* Status filter */}
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-gray-300">
            Status <span className="text-gray-500">(optional)</span>
          </legend>
          <div className="flex flex-wrap gap-2">
            {STATUSES.map((status) => (
              <label
                key={status}
                className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-1.5 text-sm ${
                  statuses.includes(status)
                    ? 'border-brand-500 bg-brand-500/10 text-white'
                    : 'border-gray-700 text-gray-400'
                } ${isBusy ? 'cursor-not-allowed opacity-50' : ''}`}
              >
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={statuses.includes(status)}
                  disabled={isBusy}
                  onChange={() => toggleStatus(status)}
                />
                {status}
              </label>
            ))}
          </div>
        </fieldset>

        {/* Progress / result */}
        {(isBusy || phase === 'done') && (
          <div className="space-y-2" aria-live="polite">
            <div className="flex justify-between text-xs text-gray-400">
              <span>
                {phase === 'done'
                  ? 'Export ready'
                  : phase === 'pending'
                    ? 'Queued…'
                    : 'Generating…'}
              </span>
              <span>{progress}%</span>
            </div>
            <Progress value={progress} max={100} className="" />
            {isBusy && estimatedSeconds ? (
              <p className="text-xs text-gray-500">
                Estimated time: ~{estimatedSeconds}s. You can keep working — we&apos;ll update this
                automatically.
              </p>
            ) : null}
          </div>
        )}

        {phase === 'failed' && error && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-2.5 text-sm text-red-400">
            {error}
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-col gap-3 border-t border-gray-800 pt-4 sm:flex-row">
          <Button variant="secondary" className="flex-1" onClick={handleClose}>
            {phase === 'done' ? 'Close' : 'Cancel'}
          </Button>

          {phase === 'done' ? (
            <Button variant="primary" className="flex-1" onClick={handleDownload}>
              Download
            </Button>
          ) : phase === 'failed' ? (
            <Button variant="primary" className="flex-1" onClick={() => retry()}>
              Retry
            </Button>
          ) : (
            <Button
              variant="primary"
              className="flex-1"
              disabled={!canSubmit}
              isLoading={isBusy}
              onClick={handleSubmit}
            >
              Export
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}
