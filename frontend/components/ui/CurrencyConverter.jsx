'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

const CRYPTO_ASSETS = ['XLM', 'USDC'];
const FIAT_ASSETS = ['USD', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD'];
const ALL_ASSETS = [...CRYPTO_ASSETS, ...FIAT_ASSETS];
const CACHE_TTL = 5 * 60 * 1000;
const marketCache = new Map();

function formatAmount(value, asset) {
  if (Number.isNaN(value) || value === null) return '';
  const digits = FIAT_ASSETS.includes(asset) ? 2 : 6;
  return value.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: digits });
}

async function fetchCoingeckoPrice(asset, fiat) {
  const cacheKey = `${asset}-${fiat}`;
  const cached = marketCache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) return cached;

  const ids = { XLM: 'stellar', USDC: 'usd-coin' };
  const id = ids[asset];
  if (!id) return null;

  const response = await fetch(
    `https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=${fiat.toLowerCase()}&include_24hr_change=true`,
    { signal: AbortSignal.timeout(5000) },
  );
  if (!response.ok) return null;

  const data = await response.json();
  const price = data[id]?.[fiat.toLowerCase()];
  const change24h = data[id]?.[`${fiat.toLowerCase()}_24h_change`];
  const result = { price, change24h, fetchedAt: Date.now() };
  marketCache.set(cacheKey, result);
  return result;
}

async function fetchFiatRate(from, to) {
  const cacheKey = `fiat-${from}-${to}`;
  const cached = marketCache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) return cached;

  const response = await fetch(
    `https://api.exchangerate.host/latest?base=${from}&symbols=${to}`,
    { signal: AbortSignal.timeout(5000) },
  );
  if (!response.ok) return null;

  const data = await response.json();
  const price = data.rates?.[to];
  const result = { price, change24h: 0, fetchedAt: Date.now() };
  marketCache.set(cacheKey, result);
  return result;
}

function getSlippageEstimate(change24h) {
  if (change24h === null || change24h === undefined) return 0.3;
  return Math.min(15, Math.max(0.2, Math.abs(change24h) * 0.18));
}

function getWarning(change24h) {
  return Math.abs(change24h) > 4
    ? 'High market volatility detected. Slippage may increase.'
    : Math.abs(change24h) > 2
    ? 'Market conditions are active. Confirm rates before submitting.'
    : null;
}

export default function CurrencyConverter({ className = '' }) {
  const [fromAsset, setFromAsset] = useState('XLM');
  const [toAsset, setToAsset] = useState('USD');
  const [fromValue, setFromValue] = useState('1');
  const [toValue, setToValue] = useState('');
  const [priceInfo, setPriceInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const refreshTimer = useRef(null);

  const isCryptoToCrypto = CRYPTO_ASSETS.includes(fromAsset) && CRYPTO_ASSETS.includes(toAsset);
  const isFiatToFiat = FIAT_ASSETS.includes(fromAsset) && FIAT_ASSETS.includes(toAsset);

  const fetchMarketData = async () => {
    setLoading(true);
    setError('');
    try {
      let result;
      if (isFiatToFiat) {
        result = await fetchFiatRate(fromAsset, toAsset);
      } else if (CRYPTO_ASSETS.includes(fromAsset) && FIAT_ASSETS.includes(toAsset)) {
        result = await fetchCoingeckoPrice(fromAsset, toAsset);
      } else if (FIAT_ASSETS.includes(fromAsset) && CRYPTO_ASSETS.includes(toAsset)) {
        result = await fetchCoingeckoPrice(toAsset, fromAsset);
        if (result?.price) result.price = 1 / result.price;
      } else if (isCryptoToCrypto) {
        const [fromUsd, toUsd] = await Promise.all([
          fetchCoingeckoPrice(fromAsset, 'USD'),
          fetchCoingeckoPrice(toAsset, 'USD'),
        ]);
        if (!fromUsd?.price || !toUsd?.price) throw new Error('Conversion unavailable');
        result = {
          price: fromUsd.price / toUsd.price,
          change24h: (fromUsd.change24h + toUsd.change24h) / 2,
          fetchedAt: Date.now(),
        };
      } else {
        result = await fetchCoingeckoPrice(fromAsset, toAsset);
      }
      if (!result?.price) throw new Error('Market data unavailable');
      setPriceInfo(result);
    } catch (err) {
      setError(err.message || 'Unable to fetch prices');
      setPriceInfo(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMarketData();
    if (refreshTimer.current) clearInterval(refreshTimer.current);
    refreshTimer.current = setInterval(fetchMarketData, CACHE_TTL);
    return () => clearInterval(refreshTimer.current);
  }, [fromAsset, toAsset]);

  useEffect(() => {
    if (!priceInfo?.price) return;
    const amount = parseFloat(fromValue);
    if (Number.isNaN(amount)) {
      setToValue('');
      return;
    }
    setToValue(formatAmount(amount * priceInfo.price, toAsset));
  }, [fromValue, priceInfo, toAsset]);

  const handleToChange = (value) => {
    setToValue(value);
    if (!priceInfo?.price) return;
    const amount = parseFloat(value);
    if (Number.isNaN(amount)) {
      setFromValue('');
      return;
    }
    setFromValue(formatAmount(amount / priceInfo.price, fromAsset));
  };

  const swapAssets = () => {
    setFromAsset(toAsset);
    setToAsset(fromAsset);
    setFromValue(toValue);
  };

  const slippage = useMemo(
    () => getSlippageEstimate(priceInfo?.change24h ?? 0),
    [priceInfo],
  );
  const warningMessage = useMemo(() => getWarning(priceInfo?.change24h ?? 0), [priceInfo]);

  return (
    <div className={`rounded-3xl border border-white/10 bg-slate-950/80 p-5 shadow-lg shadow-cyan-500/5 ${className}`}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.35em] text-slate-400">Currency converter</p>
          <h3 className="mt-2 text-lg font-semibold text-white">Dark-mode multi-currency widget</h3>
        </div>
        <button
          type="button"
          onClick={fetchMarketData}
          disabled={loading}
          aria-label="Refresh market prices"
          className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-slate-900 text-slate-300 transition hover:border-cyan-400 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          <RefreshCw className={loading ? 'animate-spin' : ''} size={18} />
        </button>
      </div>

      {warningMessage && (
        <div className="mt-4 rounded-3xl border border-amber-500/20 bg-amber-500/10 p-3 text-sm text-amber-100">
          <div className="flex items-center gap-2">
            <AlertTriangle size={16} />
            <span>{warningMessage}</span>
          </div>
        </div>
      )}

      <div className="mt-5 grid gap-4">
        <AssetInput
          label="From"
          value={fromValue}
          asset={fromAsset}
          assets={ALL_ASSETS}
          onAmountChange={setFromValue}
          onAssetChange={setFromAsset}
        />
        <div className="flex items-center justify-center">
          <button
            type="button"
            onClick={swapAssets}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-slate-900 text-slate-200 transition hover:border-cyan-400 hover:text-cyan-300"
            aria-label="Swap assets"
          >
            ⟷
          </button>
        </div>
        <AssetInput
          label="To"
          value={toValue}
          asset={toAsset}
          assets={ALL_ASSETS}
          onAmountChange={handleToChange}
          onAssetChange={setToAsset}
        />
      </div>

      <div className="mt-6 grid gap-3 rounded-3xl border border-white/10 bg-slate-900/80 p-4 text-sm text-slate-300">
        <div className="flex items-center justify-between">
          <span>Live rate</span>
          <span className="text-white">
            {priceInfo?.price ? `1 ${fromAsset} = ${formatAmount(priceInfo.price, toAsset)} ${toAsset}` : 'Unavailable'}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span>Estimated fee</span>
          <span>{`${formatAmount(0.15, 'USD')}% base + ${formatAmount(slippage, 'USD')}% slippage`}</span>
        </div>
        <div className="flex items-center justify-between">
          <span>24h change</span>
          <span className={priceInfo?.change24h >= 0 ? 'text-emerald-300' : 'text-rose-300'}>
            {priceInfo?.change24h != null ? `${priceInfo.change24h.toFixed(2)}%` : '—'}
          </span>
        </div>
      </div>

      {error ? (
        <div className="mt-4 rounded-3xl border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-100">
          {error}
        </div>
      ) : null}
    </div>
  );
}

function AssetInput({ label, value, asset, assets, onAmountChange, onAssetChange }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-slate-950/80 p-4">
      <label className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-400" htmlFor={`${label}-amount`}>
        {label}
      </label>
      <div className="mt-3 flex gap-3">
        <input
          id={`${label}-amount`}
          type="number"
          min="0"
          value={value}
          onChange={(event) => onAmountChange(event.target.value)}
          className="w-full rounded-3xl border border-slate-700/80 bg-slate-900/90 px-4 py-3 text-lg font-semibold text-white outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-500/20"
          aria-label={`${label} amount`}
          placeholder="0.00"
        />
        <select
          value={asset}
          onChange={(event) => onAssetChange(event.target.value)}
          className="rounded-3xl border border-slate-700/80 bg-slate-900/90 px-4 py-3 text-sm font-semibold text-white outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-500/20"
          aria-label={`${label} asset`}
        >
          {assets.map((option) => (
            <option key={option} value={option} className="bg-slate-950 text-white">
              {option}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
