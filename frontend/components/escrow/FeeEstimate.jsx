import React, { useState, useEffect } from 'react';

export default function FeeEstimate({ escrowParams, onLoaded }) {
  const [fee, setFee] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!escrowParams) return;
    setLoading(true);
    setError(null);
    fetch('/api/v1/escrows/estimate-fee', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(escrowParams),
    })
      .then(r => r.json())
      .then(data => { setFee(data); setLoading(false); onLoaded?.(true); })
      .catch(err => { setError(err.message); setLoading(false); onLoaded?.(false); });
  }, [JSON.stringify(escrowParams)]);

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.875rem', color: 'var(--muted,#64748b)' }}>
      <span style={{ width: 14, height: 14, border: '2px solid currentColor', borderTopColor: 'transparent', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.6s linear infinite' }} />
      Estimating fee…
    </div>
  );

  if (error) return (
    <div style={{ fontSize: '0.875rem', color: '#ef4444' }}>Fee estimation unavailable — please try again.</div>
  );

  if (!fee) return null;

  return (
    <div style={{ fontSize: '0.875rem' }}>
      <div>
        Estimated fee: <strong>{fee.feeStroops} stroops</strong> ({fee.feeXLM} XLM)
        <span style={{ marginLeft: 12, color: 'var(--muted,#64748b)', fontSize: '0.75rem' }}>
          CPU: {fee.cpuInsns?.toLocaleString()} insns · Mem: {fee.memBytes?.toLocaleString()} bytes
        </span>
      </div>
      {fee.feeXLM > 0.1 && (
        <div style={{ marginTop: 8, padding: '8px 12px', backgroundColor: '#fef3c7', border: '1px solid #f59e0b', borderRadius: 6, color: '#92400e' }}>
          Warning: estimated fee ({fee.feeXLM} XLM) exceeds 0.1 XLM — ensure sufficient wallet balance.
        </div>
      )}
    </div>
  );
}
