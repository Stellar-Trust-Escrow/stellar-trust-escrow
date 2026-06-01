import React, { useMemo, useState } from 'react';

function smallChart(values = []) {
  const max = Math.max(...values, 1);
  const points = values.map((v, i) => `${(i / (values.length - 1 || 1)) * 100},${100 - (v / max) * 100}`);
  return `0,100 ${points.join(' ')} 100,100`;
}

export default function ParameterSimulator({ initial = { fee: 0.5, timeout: 7 }, history = [] }) {
  const [fee, setFee] = useState(initial.fee);
  const [timeout, setTimeoutValue] = useState(initial.timeout);

  const projection = useMemo(() => {
    // simple projection: revenue = base * fee * trend
    const base = 100000;
    return Array.from({ length: 12 }).map((_, i) => base * (1 + i * 0.02) * fee);
  }, [fee]);

  return (
    <div className="parameter-simulator">
      <h3>Governance Parameter Simulator</h3>
      <div style={{ display: 'flex', gap: 24 }}>
        <div style={{ flex: 1 }}>
          <label>Platform fee: {fee.toFixed(2)}</label>
          <input
            type="range"
            min="0"
            max="2"
            step="0.01"
            value={fee}
            onChange={(e) => setFee(parseFloat(e.target.value))}
          />

          <label>Dispute timeout (days): {timeout}</label>
          <input
            type="range"
            min="1"
            max="30"
            step="1"
            value={timeout}
            onChange={(e) => setTimeoutValue(parseInt(e.target.value, 10))}
          />
        </div>

        <div style={{ width: 300 }} aria-hidden>
          <svg viewBox="0 0 100 100" width="300" height="160" role="img">
            <polyline fill="#e6f0ff" stroke="#3b82f6" points={smallChart(projection)} />
          </svg>
          <div style={{ fontSize: 12 }}>
            <strong>Projection</strong>
            <div>Estimated monthly revenue (simple model)</div>
          </div>
        </div>
      </div>

      <div style={{ marginTop: 12 }}>
        <pre style={{ background: '#f7f7f7', padding: 8 }}>{JSON.stringify({ fee, timeout }, null, 2)}</pre>
      </div>
    </div>
  );
}
