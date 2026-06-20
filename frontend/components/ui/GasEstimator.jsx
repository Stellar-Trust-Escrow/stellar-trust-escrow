'use client';

/**
 * GasEstimator — Stellar network fee estimator widget
 *
 * Queries Stellar Horizon fee stats and presents three speed tiers
 * (Low / Standard / High) with projected costs and confirmation times.
 * Emits the selected fee via `onFeeSelect` for use in transaction builders.
 *
 * @param {object}   props
 * @param {function} [props.onFeeSelect]   — called with fee (stroops) when user picks a tier
 * @param {string}   [props.className]
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { Zap, Clock, AlertTriangle, RefreshCw, CheckCircle } from 'lucide-react';

// ── Config ────────────────────────────────────────────────────────────────────

const HORIZON_URL = process.env.NEXT_PUBLIC_HORIZON_URL || 'https://horizon-testnet.stellar.org';
const REFRESH_INTERVAL_MS = 15_000; // 15 s — fee stats change quickly under congestion
const BASE_RESERVE_XLM = 0.5; // minimum base reserve per entry (informational)
const STROOPS_PER_XLM = 10_000_000;

/**
 * Speed tiers derived from Horizon fee_stats percentiles.
 * p10 → Low, p50 → Standard, p90 → High.
 */
const TIERS = [
  {
    id: 'low',
    label: 'Low',
    description: 'Safe · slower confirmation',
    icon: Clock,
    color: 'text-blue-400',
    border: 'border-blue-500/40',
    bg: 'bg-blue-500/10',
    selectedBorder: 'border-blue-500',
    selectedBg: 'bg-blue-500/20',
    percentile: 'p10',
    confirmSeconds: '60–120',
  },
  {
    id: 'standard',
    label: 'Standard',
    description: 'Recommended · typical speed',
    icon: CheckCircle,
    color: 'text-emerald-400',
    border: 'border-emerald-500/40',
    bg: 'bg-emerald-500/10',
    selectedBorder: 'border-emerald-500',
    selectedBg: 'bg-emerald-500/20',
    percentile: 'p50',
    confirmSeconds: '5–15',
  },
  {
    id: 'high',
    label: 'High',
    description: 'Priority · fastest inclusion',
    icon: Zap,
    color: 'text-amber-400',
    border: 'border-amber-500/40',
    bg: 'bg-amber-500/10',
    selectedBorder: 'border-amber-500',
    selectedBg: 'bg-amber-500/20',
    percentile: 'p90',
    confirmSeconds: '1–5',
  },
];

// ── Fee fetching ──────────────────────────────────────────────────────────────

/**
 * Fetches /fee_stats from Horizon and returns a normalised object:
 * { p10, p50, p90, min, max, ledgerBaseFee, congestionLevel }
 */
async function fetchFeeStats() {
  const res = await fetch(`${HORIZON_URL}/fee_stats`, {
    signal: AbortSignal.timeout(8_000),
  });
  if (!res.ok) throw new Error(`Horizon responded ${res.status}`);
  const data = await res.json();

  const charged = data.fee_charged;
  const p10 = parseInt(charged?.p10 ?? charged?.min ?? 100, 10);
  const p50 = parseInt(charged?.p50 ?? 100, 10);
  const p90 = parseInt(charged?.p90 ?? 100, 10);
  const min = parseInt(charged?.min ?? 100, 10);
  const max = parseInt(charged?.max ?? p90, 10);
  const ledgerBaseFee = parseInt(data.last_ledger_base_fee ?? 100, 10);

  // Congestion: if p90 > 5× base fee, flag as high congestion
  const ratio = p90 / ledgerBaseFee;
  const congestionLevel = ratio >= 5 ? 'high' : ratio >= 2 ? 'medium' : 'normal';

  return { p10, p50, p90, min, max, ledgerBaseFee, congestionLevel };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function stroopsToXlm(stroops) {
  return (stroops / STROOPS_PER_XLM).toFixed(7).replace(/\.?0+$/, '');
}

function formatStroops(n) {
  return n.toLocaleString();
}

const CONGESTION_CONFIG = {
  normal: { label: 'Normal', color: 'text-emerald-400', bg: 'bg-emerald-400/10' },
  medium: { label: 'Moderate', color: 'text-amber-400', bg: 'bg-amber-400/10' },
  high: { label: 'High', color: 'text-red-400', bg: 'bg-red-400/10' },
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function GasEstimator({ onFeeSelect, className = '' }) {
  const [feeStats, setFeeStats] = useState(null);
  const [selected, setSelected] = useState('standard');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const stats = await fetchFeeStats();
      setFeeStats(stats);
      setLastUpdated(new Date());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    timerRef.current = setInterval(load, REFRESH_INTERVAL_MS);
    return () => clearInterval(timerRef.current);
  }, [load]);

  // Notify parent whenever selection or fee data changes
  useEffect(() => {
    if (!feeStats || !onFeeSelect) return;
    const tier = TIERS.find((t) => t.id === selected);
    onFeeSelect(feeStats[tier.percentile]);
  }, [selected, feeStats, onFeeSelect]);

  const congestion = feeStats ? CONGESTION_CONFIG[feeStats.congestionLevel] : null;

  return (
    <div
      className={`bg-gray-900 border border-gray-800 rounded-2xl p-4 space-y-4
                  hover:border-indigo-500/40 transition-all duration-300
                  hover:shadow-[0_0_20px_rgba(99,102,241,0.1)] ${className}`}
      role="region"
      aria-label="Gas fee estimator"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Zap size={15} className="text-indigo-400" />
          <h3 className="text-sm font-semibold text-white">Fee Estimator</h3>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="text-gray-500 hover:text-white transition-colors disabled:opacity-40"
          aria-label="Refresh fee estimates"
        >
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Congestion alert */}
      {congestion && feeStats?.congestionLevel !== 'normal' && (
        <div
          className={`flex items-center gap-2 text-xs rounded-lg px-3 py-2
                      ${congestion.color} ${congestion.bg}`}
          role="alert"
        >
          <AlertTriangle size={13} aria-hidden="true" />
          <span>
            <strong>{congestion.label} network congestion</strong> — fees are elevated. Consider
            using Standard or High for reliable inclusion.
          </span>
        </div>
      )}

      {/* Error */}
      {error && (
        <div
          className="flex items-center gap-2 text-xs text-amber-400 bg-amber-400/10 rounded-lg px-3 py-2"
          role="alert"
        >
          <AlertTriangle size={13} aria-hidden="true" />
          Could not fetch fee stats: {error}
        </div>
      )}

      {/* Tier cards */}
      <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Transaction speed">
        {TIERS.map((tier) => {
          const Icon = tier.icon;
          const fee = feeStats?.[tier.percentile];
          const isSelected = selected === tier.id;

          return (
            <button
              key={tier.id}
              role="radio"
              aria-checked={isSelected}
              onClick={() => setSelected(tier.id)}
              className={`rounded-xl p-3 text-left border transition-all duration-200 focus:outline-none
                          focus-visible:ring-2 focus-visible:ring-indigo-500
                          ${
                            isSelected
                              ? `${tier.selectedBorder} ${tier.selectedBg}`
                              : `${tier.border} ${tier.bg} hover:border-opacity-70`
                          }`}
            >
              <div className={`flex items-center gap-1.5 mb-2 ${tier.color}`}>
                <Icon size={13} aria-hidden="true" />
                <span className="text-xs font-semibold">{tier.label}</span>
              </div>

              {/* Fee amount */}
              <div className="space-y-0.5">
                {loading && !fee ? (
                  <div className="h-4 w-16 bg-gray-700 rounded animate-pulse" />
                ) : fee ? (
                  <>
                    <p className="text-white text-sm font-bold tabular-nums">
                      {formatStroops(fee)}
                      <span className="text-gray-500 text-xs font-normal ml-1">str</span>
                    </p>
                    <p className="text-gray-500 text-xs tabular-nums">{stroopsToXlm(fee)} XLM</p>
                  </>
                ) : (
                  <p className="text-gray-600 text-xs">—</p>
                )}
              </div>

              {/* Confirmation time */}
              <p className="text-gray-500 text-xs mt-2">~{tier.confirmSeconds}s</p>
            </button>
          );
        })}
      </div>

      {/* Network stats footer */}
      {feeStats && (
        <div className="flex items-center justify-between text-xs text-gray-600 pt-1 border-t border-gray-800">
          <span>
            Base fee:{' '}
            <span className="text-gray-400">{formatStroops(feeStats.ledgerBaseFee)} str</span>
            {' · '}
            Congestion:{' '}
            <span className={congestion?.color ?? 'text-gray-400'}>{congestion?.label ?? '—'}</span>
          </span>
          {lastUpdated && (
            <span>
              {lastUpdated.toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
              })}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
