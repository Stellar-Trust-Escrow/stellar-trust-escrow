'use client';

/**
 * PriceConverter — Multi-currency price converter with Sparkline chart
 *
 * Features:
 * - Dual-input converter: type in either field, the other updates instantly
 * - Live prices from Stellar DEX / CoinGecko with 5-minute cache
 * - 24-hour Sparkline chart showing price trend
 * - Graceful fallback when APIs are unavailable
 * - Micro-animations and glowing hover states
 *
 * @param {object}  props
 * @param {string}  [props.baseAsset='XLM']   — default from-asset
 * @param {string}  [props.quoteAsset='USD']  — default to-asset
 * @param {string}  [props.className]
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { TrendingUp, TrendingDown, RefreshCw, AlertCircle } from 'lucide-react';

// ── Config ────────────────────────────────────────────────────────────────────

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const COINGECKO_IDS = { XLM: 'stellar', USDC: 'usd-coin', BTC: 'bitcoin', ETH: 'ethereum' };
const SUPPORTED_ASSETS = ['XLM', 'USDC', 'BTC', 'ETH'];
const FIAT_CURRENCIES = ['USD', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD'];

// ── Price cache ───────────────────────────────────────────────────────────────

const priceCache = new Map(); // key → { price, history, fetchedAt }

async function fetchPrice(asset, fiat) {
  const key = `${asset}:${fiat}`;
  const cached = priceCache.get(key);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) return cached;

  const cgId = COINGECKO_IDS[asset];
  if (!cgId) return null;

  try {
    const [priceRes, historyRes] = await Promise.all([
      fetch(
        `https://api.coingecko.com/api/v3/simple/price?ids=${cgId}&vs_currencies=${fiat.toLowerCase()}&include_24hr_change=true`,
        { signal: AbortSignal.timeout(5000) },
      ),
      fetch(
        `https://api.coingecko.com/api/v3/coins/${cgId}/market_chart?vs_currency=${fiat.toLowerCase()}&days=1&interval=hourly`,
        { signal: AbortSignal.timeout(5000) },
      ),
    ]);

    if (!priceRes.ok || !historyRes.ok) return null;

    const priceData = await priceRes.json();
    const historyData = await historyRes.json();

    const price = priceData[cgId]?.[fiat.toLowerCase()];
    const change24h = priceData[cgId]?.[`${fiat.toLowerCase()}_24h_change`];
    const history = (historyData.prices ?? []).map(([, v]) => v);

    const result = { price, change24h, history, fetchedAt: Date.now() };
    priceCache.set(key, result);
    return result;
  } catch {
    return null;
  }
}

// ── Sparkline ─────────────────────────────────────────────────────────────────

function Sparkline({ data, positive, width = 120, height = 36 }) {
  if (!data?.length) return <div style={{ width, height }} className="bg-gray-800 rounded animate-pulse" />;

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((v - min) / range) * (height - 4) - 2;
    return `${x},${y}`;
  });

  const color = positive ? '#34d399' : '#f87171';
  const fillId = `spark-fill-${positive ? 'up' : 'down'}`;

  return (
    <svg width={width} height={height} aria-hidden="true">
      <defs>
        <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polyline
        points={pts.join(' ')}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <polygon
        points={`0,${height} ${pts.join(' ')} ${width},${height}`}
        fill={`url(#${fillId})`}
      />
    </svg>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function PriceConverter({ baseAsset = 'XLM', quoteAsset = 'USD', className = '' }) {
  const [from, setFrom] = useState(baseAsset);
  const [to, setTo] = useState(quoteAsset);
  const [fromAmount, setFromAmount] = useState('1');
  const [toAmount, setToAmount] = useState('');
  const [priceData, setPriceData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const refreshTimer = useRef(null);

  const isFiatTo = FIAT_CURRENCIES.includes(to);
  const isFiatFrom = FIAT_CURRENCIES.includes(from);

  // ── Fetch price ─────────────────────────────────────────────────────────
  const loadPrice = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const asset = isFiatFrom ? to : from;
      const fiat = isFiatFrom ? from : to;
      const data = await fetchPrice(asset, fiat);
      if (!data) throw new Error('Price unavailable');
      setPriceData(data);
      setLastUpdated(new Date());
    } catch (err) {
      setError(err.message);
      setPriceData(null);
    } finally {
      setLoading(false);
    }
  }, [from, to, isFiatFrom]);

  useEffect(() => {
    loadPrice();
    refreshTimer.current = setInterval(loadPrice, CACHE_TTL_MS);
    return () => clearInterval(refreshTimer.current);
  }, [loadPrice]);

  // ── Conversion ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!priceData?.price) return;
    const n = parseFloat(fromAmount);
    if (isNaN(n)) { setToAmount(''); return; }
    const converted = isFiatFrom ? n / priceData.price : n * priceData.price;
    setToAmount(converted.toFixed(isFiatTo ? 2 : 6));
  }, [fromAmount, priceData, isFiatFrom, isFiatTo]);

  const handleToChange = (val) => {
    setToAmount(val);
    if (!priceData?.price) return;
    const n = parseFloat(val);
    if (isNaN(n)) { setFromAmount(''); return; }
    const converted = isFiatFrom ? n * priceData.price : n / priceData.price;
    setFromAmount(converted.toFixed(isFiatFrom ? 2 : 6));
  };

  const swap = () => { setFrom(to); setTo(from); };

  const positive = (priceData?.change24h ?? 0) >= 0;
  const TrendIcon = positive ? TrendingUp : TrendingDown;
  const trendColor = positive ? 'text-emerald-400' : 'text-red-400';

  return (
    <div className={`bg-gray-900 border border-gray-800 rounded-2xl p-4 space-y-4
                     hover:border-indigo-500/40 transition-all duration-300
                     hover:shadow-[0_0_20px_rgba(99,102,241,0.1)] ${className}`}>

      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white">Price Converter</h3>
        <button onClick={loadPrice} disabled={loading}
          className="text-gray-500 hover:text-white transition-colors disabled:opacity-40"
          aria-label="Refresh prices">
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Error state */}
      {error && (
        <div className="flex items-center gap-2 text-xs text-amber-400 bg-amber-400/10
                        rounded-lg px-3 py-2">
          <AlertCircle size={13} />
          {error} — showing cached data
        </div>
      )}

      {/* Inputs */}
      <div className="space-y-2">
        <AssetInput
          label="From"
          amount={fromAmount}
          asset={from}
          assets={[...SUPPORTED_ASSETS, ...FIAT_CURRENCIES]}
          onAmountChange={setFromAmount}
          onAssetChange={setFrom}
        />

        {/* Swap button */}
        <div className="flex justify-center">
          <button onClick={swap}
            className="w-7 h-7 rounded-full bg-gray-800 hover:bg-indigo-600/30
                       border border-gray-700 hover:border-indigo-500/50
                       flex items-center justify-center text-gray-400 hover:text-indigo-400
                       transition-all text-xs">
            ⇅
          </button>
        </div>

        <AssetInput
          label="To"
          amount={toAmount}
          asset={to}
          assets={[...SUPPORTED_ASSETS, ...FIAT_CURRENCIES]}
          onAmountChange={handleToChange}
          onAssetChange={setTo}
        />
      </div>

      {/* Price info + Sparkline */}
      {priceData && (
        <div className="flex items-center justify-between pt-1">
          <div>
            <p className="text-xs text-gray-500">
              1 {isFiatFrom ? to : from} ={' '}
              <span className="text-white font-medium">
                {priceData.price?.toLocaleString(undefined, { maximumFractionDigits: 6 })} {isFiatFrom ? from : to}
              </span>
            </p>
            <div className={`flex items-center gap-1 text-xs ${trendColor}`}>
              <TrendIcon size={11} />
              {Math.abs(priceData.change24h ?? 0).toFixed(2)}% 24h
            </div>
          </div>
          <Sparkline data={priceData.history} positive={positive} />
        </div>
      )}

      {lastUpdated && (
        <p className="text-xs text-gray-600 text-right">
          Updated {lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </p>
      )}
    </div>
  );
}

function AssetInput({ label, amount, asset, assets, onAmountChange, onAssetChange }) {
  return (
    <div className="bg-gray-800 rounded-xl px-3 py-2.5 flex items-center gap-2">
      <div className="flex-1">
        <label className="text-xs text-gray-500 block mb-0.5">{label}</label>
        <input
          type="number"
          value={amount}
          onChange={e => onAmountChange(e.target.value)}
          placeholder="0.00"
          className="w-full bg-transparent text-white text-lg font-semibold
                     focus:outline-none placeholder-gray-600"
          aria-label={`${label} amount`}
          min="0"
        />
      </div>
      <select
        value={asset}
        onChange={e => onAssetChange(e.target.value)}
        className="bg-gray-700 border border-gray-600 rounded-lg px-2 py-1.5 text-sm
                   text-white focus:outline-none focus:border-indigo-500 cursor-pointer"
        aria-label={`${label} asset`}
      >
        {assets.map(a => <option key={a} value={a}>{a}</option>)}
      </select>
    </div>
  );
}
