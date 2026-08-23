import React, { useState, useEffect, useCallback } from 'react';

/**
 * ArbitrationPanel — displays and manages on-chain dispute arbitration state
 * for a given escrow. Shows current dispute status, a form to raise a new
 * dispute, and (when resolved) the resolution details.
 */
export default function ArbitrationPanel({ escrowId }) {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState(null);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`/api/disputes/escrow/${escrowId}/status`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setStatus(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [escrowId]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const handleRaiseDispute = async () => {
    if (!reason.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/disputes/escrow/${escrowId}/raise`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to raise dispute');
      setStatus({ ...data, status: 'RAISED' });
      setReason('');
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="arbitration-panel arbitration-panel--loading">
        <span>Loading dispute status…</span>
      </div>
    );
  }

  const isNone = !status || status.status === 'NONE';
  const isRaised = status?.status === 'RAISED';
  const isResolved = status?.status === 'RESOLVED';

  return (
    <div className="arbitration-panel">
      <h3 className="arbitration-panel__title">Dispute &amp; Arbitration</h3>

      <div className={`arbitration-panel__status arbitration-panel__status--${(status?.status || 'none').toLowerCase()}`}>
        Status: <strong>{status?.status || 'NONE'}</strong>
      </div>

      {error && (
        <div className="arbitration-panel__error" role="alert">{error}</div>
      )}

      {isNone && (
        <div className="arbitration-panel__raise">
          <label htmlFor="dispute-reason" className="arbitration-panel__label">
            Describe the dispute
          </label>
          <textarea
            id="dispute-reason"
            className="arbitration-panel__textarea"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Explain why you are raising this dispute and provide any relevant details…"
            rows={5}
            disabled={submitting}
          />
          <button
            className="arbitration-panel__btn arbitration-panel__btn--raise"
            onClick={handleRaiseDispute}
            disabled={!reason.trim() || submitting}
          >
            {submitting ? 'Submitting…' : 'Raise Dispute'}
          </button>
        </div>
      )}

      {isRaised && (
        <div className="arbitration-panel__details">
          <p><strong>Raised by:</strong> {status.raisedByAddress}</p>
          <p><strong>Raised at:</strong> {new Date(status.raisedAt).toLocaleString()}</p>
          {status.evidenceCount > 0 && (
            <p><strong>Evidence items:</strong> {status.evidenceCount}</p>
          )}
          <p className="arbitration-panel__pending">
            Awaiting arbitrator resolution. Escalations: {status.escalationCount ?? 0}
          </p>
        </div>
      )}

      {isResolved && (
        <div className="arbitration-panel__details arbitration-panel__details--resolved">
          <p><strong>Resolved by:</strong> {status.resolvedBy}</p>
          <p><strong>Resolved at:</strong> {new Date(status.resolvedAt).toLocaleString()}</p>
          <p><strong>Resolution:</strong> {status.resolution}</p>
          <p><strong>Type:</strong> {status.resolutionType}</p>
        </div>
      )}
    </div>
  );
}
