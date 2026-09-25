'use client';

/**
 * AppealDeadlineIndicator Component — Issue #235
 *
 * Displays the appeal deadline for a resolved dispute and disables the
 * appeal submission button once the backend reports the appeal window is
 * closed (or once the deadline has passed client-side).
 *
 * Renders:
 *  - Countdown / deadline date when window is open
 *  - Clear "window closed" state with explanatory text when expired
 *  - Graceful degradation if the backend rejects the appeal with a 409/422
 *
 * @param {object}    props
 * @param {string}    props.escrowId          — escrow identifier
 * @param {number}    props.disputeId         — dispute identifier
 * @param {string}    props.appealDeadline    — ISO 8601 deadline from the backend
 * @param {boolean}   props.appealWindowOpen  — authoritative flag from backend
 * @param {Function}  props.onAppeal          — async callback to submit appeal; should
 *                                              throw on backend 409/422 so the UI can
 *                                              show a graceful rejection message
 */

import { useState, useEffect } from 'react';
import { Clock, AlertCircle, CheckCircle, ChevronRight } from 'lucide-react';

// ── Countdown helpers ─────────────────────────────────────────────────────────

function getTimeRemaining(deadlineIso) {
  if (!deadlineIso) return null;
  const diff = new Date(deadlineIso).getTime() - Date.now();
  if (diff <= 0) return null;

  const totalSeconds = Math.floor(diff / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return { days, hours, minutes, seconds, totalMs: diff };
}

function formatCountdown({ days, hours, minutes, seconds }) {
  if (days > 0) return `${days}d ${hours}h ${minutes}m remaining`;
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s remaining`;
  return `${minutes}m ${seconds}s remaining`;
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function AppealDeadlineIndicator({
  escrowId,
  disputeId,
  appealDeadline,
  appealWindowOpen,
  onAppeal,
}) {
  const [timeRemaining, setTimeRemaining] = useState(() => getTimeRemaining(appealDeadline));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [backendRejected, setBackendRejected] = useState(false);
  const [rejectionMessage, setRejectionMessage] = useState('');
  const [appealSubmitted, setAppealSubmitted] = useState(false);
  const [error, setError] = useState(null);

  // Live countdown tick
  useEffect(() => {
    if (!appealDeadline || !appealWindowOpen) return;

    const tick = () => setTimeRemaining(getTimeRemaining(appealDeadline));
    tick(); // immediate
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [appealDeadline, appealWindowOpen]);

  // Client-side window: closed when deadline has passed
  const clientWindowClosed = appealWindowOpen && timeRemaining === null;
  const windowClosed = !appealWindowOpen || clientWindowClosed || backendRejected;
  const isDisabled = windowClosed || isSubmitting || appealSubmitted;

  const handleAppeal = async () => {
    if (isDisabled || !onAppeal) return;
    setIsSubmitting(true);
    setError(null);
    try {
      await onAppeal({ escrowId, disputeId });
      setAppealSubmitted(true);
    } catch (err) {
      // Backend-authoritative rejection (409 Conflict or 422 Unprocessable)
      if (err.status === 409 || err.status === 422 || /window.*closed|deadline/i.test(err.message)) {
        setBackendRejected(true);
        setRejectionMessage(err.message || 'The appeal window has closed.');
      } else {
        setError(err.message || 'Failed to submit appeal. Please try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  if (appealSubmitted) {
    return (
      <div
        data-testid="appeal-deadline-indicator"
        className="flex items-start gap-3 bg-emerald-900/20 border border-emerald-500/40 rounded-lg px-4 py-3 text-sm"
      >
        <CheckCircle size={18} className="text-emerald-400 shrink-0 mt-0.5" aria-hidden="true" />
        <div>
          <p className="text-emerald-300 font-medium">Appeal submitted</p>
          <p className="text-emerald-400/80 text-xs mt-0.5">
            Your appeal has been received. The arbiter will review it.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      data-testid="appeal-deadline-indicator"
      className={`rounded-lg border px-4 py-3 text-sm space-y-3 ${
        windowClosed
          ? 'bg-gray-900/40 border-gray-700'
          : 'bg-blue-900/10 border-blue-500/30'
      }`}
    >
      {/* Status row */}
      <div className="flex items-start gap-2">
        {windowClosed ? (
          <AlertCircle size={17} className="text-gray-500 shrink-0 mt-0.5" aria-hidden="true" />
        ) : (
          <Clock size={17} className="text-blue-400 shrink-0 mt-0.5" aria-hidden="true" />
        )}

        <div className="flex-1 min-w-0">
          {windowClosed ? (
            <>
              <p className="text-gray-400 font-medium" data-testid="window-closed-label">
                Appeal window closed
              </p>
              <p className="text-gray-500 text-xs mt-0.5">
                {backendRejected && rejectionMessage
                  ? rejectionMessage
                  : 'The deadline for submitting an appeal on this dispute has passed.'}
              </p>
            </>
          ) : (
            <>
              <p className="text-blue-300 font-medium" data-testid="window-open-label">
                Appeal window open
              </p>
              <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-blue-400/80 mt-0.5">
                {timeRemaining && (
                  <span data-testid="countdown">
                    ⏱ {formatCountdown(timeRemaining)}
                  </span>
                )}
                {appealDeadline && (
                  <span data-testid="deadline-date">
                    Deadline:{' '}
                    <time dateTime={appealDeadline} className="text-blue-300">
                      {new Date(appealDeadline).toLocaleString()}
                    </time>
                  </span>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div
          role="alert"
          className="bg-red-900/20 border border-red-500/30 text-red-400 text-xs rounded px-3 py-2"
        >
          {error}
        </div>
      )}

      {/* Submit appeal button */}
      {onAppeal && (
        <button
          onClick={handleAppeal}
          disabled={isDisabled}
          aria-disabled={isDisabled}
          data-testid="submit-appeal-btn"
          className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-md transition-colors ${
            isDisabled
              ? 'bg-gray-800 text-gray-500 cursor-not-allowed opacity-60'
              : 'bg-blue-700 hover:bg-blue-600 text-white'
          }`}
        >
          {isSubmitting ? (
            'Submitting…'
          ) : windowClosed ? (
            'Appeal window closed'
          ) : (
            <>
              Submit Appeal <ChevronRight size={13} />
            </>
          )}
        </button>
      )}
    </div>
  );
}
