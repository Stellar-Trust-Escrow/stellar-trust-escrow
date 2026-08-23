'use client';

/**
 * XlmAmount
 *
 * Displays a raw XLM amount with a live ≈ $USD sub-label, computed
 * client-side from useLiveXlmRate(). Grays out and shows a tooltip when
 * the underlying rate is stale.
 *
 * @param {object} props
 * @param {number} props.amount — XLM amount (not stroops)
 * @param {string} [props.className]
 */

import { useLiveXlmRate } from '../../hooks/useLiveXlmRate';

export default function XlmAmount({ amount, className = '' }) {
  const { rate_usd, stale, loading } = useLiveXlmRate();

  const xlm = Number.isFinite(amount) ? amount : 0;
  const usd = Number.isFinite(rate_usd) ? xlm * rate_usd : null;
  const usdLabel =
    usd !== null ? usd.toLocaleString('en-US', { style: 'currency', currency: 'USD' }) : null;

  return (
    <span className={className}>
      <span>{xlm.toLocaleString('en-US', { maximumFractionDigits: 7 })} XLM</span>
      {!loading && usdLabel && (
        <span
          className={stale ? 'text-gray-400' : 'text-gray-500'}
          title={stale ? 'Rate may be outdated' : undefined}
        >
          {' '}
          ≈ {usdLabel} {stale && <span aria-label="stale rate">⚠</span>}
        </span>
      )}
    </span>
  );
}
