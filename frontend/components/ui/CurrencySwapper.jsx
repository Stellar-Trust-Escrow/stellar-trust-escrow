'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

// ── Constants ─────────────────────────────────────────────────────────────────

const STELLAR_HORIZON =
  process.env.NEXT_PUBLIC_HORIZON_URL || 'https://horizon-testnet.stellar.org';

// Stellar AMM liquidity pool asset IDs (testnet defaults)
const ASSETS = {
  XLM: { code: 'XLM', issuer: null },
  USDC: {
    code: 'USDC',
    issuer:
      process.env.NEXT_PUBLIC_USDC_ISSUER ||
      'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
  },
};

const BASE_FEE_XLM = 0.00001; // 100 stroops
const SLIPPAGE_TOLERANCE = 0.005; // 0.5 %

// ── Helpers ───────────────────────────────────────────────────────────────────

function assetParam(asset) {
  if (asset.issuer) return `${asset.code}:${asset.issuer}`;
  return 'native';
}

async function fetchAMMRate(fromToken, toToken, amount) {
  if (!amount || isNaN(amount) || Number(amount) <= 0) return null;

  const selling = assetParam(ASSETS[fromToken]);
  const buying = assetParam(ASSETS[toToken]);

  const url = new URL(`${STELLAR_HORIZON}/paths/strict-send`);
  url.searchParams.set('source_asset_type', fromToken === 'XLM' ? 'native' : 'credit_alphanum4');
  if (fromToken !== 'XLM') {
    url.searchParams.set('source_asset_code', ASSETS[fromToken].code);
    url.searchParams.set('source_asset_issuer', ASSETS[fromToken].issuer);
  }
  url.searchParams.set('source_amount', String(amount));
  url.searchParams.set(
    'destination_assets',
    toToken === 'XLM' ? 'native' : `${ASSETS[toToken].code}:${ASSETS[toToken].issuer}`,
  );

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`Horizon error: ${res.status}`);
  const data = await res.json();

  const paths = data._embedded?.records ?? [];
  if (!paths.length) return null;

  const best = paths[0];
  return {
    destinationAmount: parseFloat(best.destination_amount),
    path: best.path ?? [],
    rate: parseFloat(best.destination_amount) / Number(amount),
  };
}

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * CurrencySwapper
 *
 * @param {object}   props
 * @param {Function} [props.onSwap]  — called with { from, to, amount, quote } when user confirms swap
 * @param {boolean}  [props.walletConnected]
 * @param {Function} [props.onConnectWallet]
 */
export default function CurrencySwapper({ onSwap, walletConnected = false, onConnectWallet }) {
  const [fromToken, setFromToken] = useState('XLM');
  const [toToken, setToToken] = useState('USDC');
  const [fromAmount, setFromAmount] = useState('');
  const [quote, setQuote] = useState(null); // { destinationAmount, rate, path }
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [swapping, setSwapping] = useState(false);
  const [swapSuccess, setSwapSuccess] = useState(false);
  const debounceRef = useRef(null);

  // Fetch live rate whenever fromAmount or tokens change
  useEffect(() => {
    setQuote(null);
    setError('');
    if (!fromAmount || isNaN(fromAmount) || Number(fromAmount) <= 0) return;

    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const result = await fetchAMMRate(fromToken, toToken, fromAmount);
        setQuote(result);
        if (!result) setError('No liquidity path found for this pair.');
      } catch (err) {
        setError(err.message || 'Failed to fetch exchange rate.');
      } finally {
        setLoading(false);
      }
    }, 400);

    return () => clearTimeout(debounceRef.current);
  }, [fromAmount, fromToken, toToken]);

  const flipTokens = useCallback(() => {
    setFromToken(toToken);
    setToToken(fromToken);
    setFromAmount(quote ? String(quote.destinationAmount) : '');
    setQuote(null);
  }, [fromToken, toToken, quote]);

  const handleSwap = async () => {
    if (!walletConnected) {
      onConnectWallet?.();
      return;
    }
    if (!quote) return;
    setSwapping(true);
    setError('');
    try {
      await onSwap?.({ from: fromToken, to: toToken, amount: fromAmount, quote });
      setSwapSuccess(true);
      setTimeout(() => {
        setSwapSuccess(false);
        setFromAmount('');
        setQuote(null);
      }, 2000);
    } catch (err) {
      setError(err.message || 'Swap failed.');
    } finally {
      setSwapping(false);
    }
  };

  const slippage = quote ? (quote.rate * SLIPPAGE_TOLERANCE).toFixed(6) : null;
  const minReceived = quote
    ? (quote.destinationAmount * (1 - SLIPPAGE_TOLERANCE)).toFixed(6)
    : null;

  return (
    <section
      aria-label="Currency Swapper"
      className="bg-gray-900/80 border border-gray-800 rounded-2xl p-5 space-y-4 w-full max-w-sm
                 backdrop-blur-sm shadow-xl"
    >
      <h2 className="text-base font-semibold text-white">Swap Tokens</h2>

      {/* From */}
      <div className="space-y-1">
        <label htmlFor="from-amount" className="text-xs text-gray-400">
          You pay
        </label>
        <div
          className="flex items-center gap-2 bg-slate-800/60 border border-slate-700 rounded-xl px-4 py-3
                        focus-within:border-indigo-500/70 transition-colors"
        >
          <input
            id="from-amount"
            type="number"
            min="0"
            step="any"
            value={fromAmount}
            onChange={(e) => setFromAmount(e.target.value)}
            placeholder="0.00"
            aria-label={`Amount in ${fromToken}`}
            className="flex-1 bg-transparent text-white text-lg font-medium placeholder-gray-600
                       focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none
                       [&::-webkit-inner-spin-button]:appearance-none"
          />
          <TokenBadge token={fromToken} />
        </div>
      </div>

      {/* Flip button */}
      <div className="flex justify-center">
        <button
          onClick={flipTokens}
          aria-label="Flip tokens"
          className="p-2 rounded-full bg-slate-800 border border-slate-700 text-gray-400
                     hover:text-indigo-400 hover:border-indigo-500/50 transition-all
                     focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500
                     focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900"
        >
          <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path
              d="M5 12l-3-3 3-3M15 8l3 3-3 3M2 9h16"
              stroke="currentColor"
              strokeWidth="1.5"
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>

      {/* To */}
      <div className="space-y-1">
        <label className="text-xs text-gray-400">You receive</label>
        <div className="flex items-center gap-2 bg-slate-800/40 border border-slate-700 rounded-xl px-4 py-3">
          <span
            aria-live="polite"
            aria-label={`Estimated receive amount in ${toToken}`}
            className="flex-1 text-lg font-medium text-white"
          >
            {loading ? (
              <span className="inline-flex items-center gap-1 text-gray-500 text-sm">
                <svg
                  className="animate-spin h-3 w-3"
                  viewBox="0 0 24 24"
                  fill="none"
                  aria-hidden="true"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                Fetching…
              </span>
            ) : quote ? (
              quote.destinationAmount.toFixed(6)
            ) : (
              <span className="text-gray-600">0.00</span>
            )}
          </span>
          <TokenBadge token={toToken} />
        </div>
      </div>

      {/* Rate details */}
      {quote && !loading && (
        <dl className="bg-slate-800/40 border border-slate-700/50 rounded-xl px-4 py-3 space-y-1.5 text-xs">
          <div className="flex justify-between text-gray-400">
            <dt>Rate</dt>
            <dd className="text-white font-medium">
              1 {fromToken} ≈ {quote.rate.toFixed(6)} {toToken}
            </dd>
          </div>
          <div className="flex justify-between text-gray-400">
            <dt>Slippage tolerance</dt>
            <dd className="text-white">{(SLIPPAGE_TOLERANCE * 100).toFixed(1)}%</dd>
          </div>
          <div className="flex justify-between text-gray-400">
            <dt>Min. received</dt>
            <dd className="text-white">
              {minReceived} {toToken}
            </dd>
          </div>
          <div className="flex justify-between text-gray-400">
            <dt>Network fee</dt>
            <dd className="text-white">{BASE_FEE_XLM} XLM</dd>
          </div>
          {quote.path?.length > 0 && (
            <div className="flex justify-between text-gray-400">
              <dt>Route</dt>
              <dd className="text-white">
                {fromToken} → {quote.path.map((p) => p.asset_code || 'XLM').join(' → ')} → {toToken}
              </dd>
            </div>
          )}
        </dl>
      )}

      {/* Error */}
      {error && (
        <div
          role="alert"
          className="bg-red-500/10 border border-red-500/40 text-red-400 text-xs p-3 rounded-xl"
        >
          {error}
        </div>
      )}

      {/* Swap button */}
      <button
        onClick={handleSwap}
        disabled={swapping || swapSuccess || (!walletConnected ? false : !quote || loading)}
        aria-live="polite"
        className="w-full py-3 rounded-xl font-semibold text-sm transition-all
                   focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500
                   focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900
                   disabled:opacity-50
                   bg-indigo-600 hover:bg-indigo-500 text-white
                   hover:shadow-[0_0_20px_rgba(99,102,241,0.4)]"
      >
        {swapSuccess
          ? '✓ Swapped!'
          : swapping
            ? 'Swapping…'
            : !walletConnected
              ? 'Connect Wallet to Swap'
              : 'Swap'}
      </button>
    </section>
  );
}

function TokenBadge({ token }) {
  const colors = { XLM: 'bg-sky-500/20 text-sky-300', USDC: 'bg-blue-500/20 text-blue-300' };
  return (
    <span
      className={`px-2.5 py-1 rounded-lg text-xs font-bold ${colors[token] || 'bg-gray-700 text-gray-300'}`}
    >
      {token}
    </span>
  );
}
