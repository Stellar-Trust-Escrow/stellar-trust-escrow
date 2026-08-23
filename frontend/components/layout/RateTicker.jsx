'use client';

/**
 * RateTicker
 *
 * Header-bar widget: "1 XLM = $0.XXX USD" with a green/red delta arrow vs
 * the previous poll. Links out to Stellar Expert market data.
 */

import { useRef, useState, useEffect } from 'react';
import { useLiveXlmRate } from '../../hooks/useLiveXlmRate';

export default function RateTicker() {
  const { rate_usd, stale, loading } = useLiveXlmRate();
  const [delta, setDelta] = useState(0); // -1, 0, 1
  const prevRateRef = useRef(null);

  useEffect(() => {
    if (rate_usd == null) return;
    if (prevRateRef.current != null) {
      if (rate_usd > prevRateRef.current) setDelta(1);
      else if (rate_usd < prevRateRef.current) setDelta(-1);
      else setDelta(0);
    }
    prevRateRef.current = rate_usd;
  }, [rate_usd]);

  if (loading || rate_usd == null) return null;

  return (
    <a
      href="https://stellar.expert/explorer/public/asset/XLM"
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex items-center gap-1 text-xs font-medium ${
        stale ? 'text-gray-400' : 'text-gray-600'
      }`}
      title={stale ? 'Rate may be outdated' : 'View on Stellar Expert'}
    >
      <span>1 XLM = ${rate_usd.toFixed(4)} USD</span>
      {delta === 1 && <span className="text-green-500">▲</span>}
      {delta === -1 && <span className="text-red-500">▼</span>}
    </a>
  );
}
