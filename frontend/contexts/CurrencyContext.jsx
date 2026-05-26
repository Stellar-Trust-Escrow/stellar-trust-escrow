'use client';

/**
 * CurrencyContext
 *
 * Provides multi-currency support across the app:
 *   - Currency selection (persisted to localStorage)
 *   - Exchange rate fetching with in-memory + localStorage cache
 *   - Fallback to USD if rates are unavailable
 *   - Conversion and locale-aware formatting helpers
 *
 * ## Supported currencies
 * USD, EUR, GBP, JPY, CAD, AUD, CHF, CNY, INR, BRL, MXN, SGD, KRW, NGN, ZAR
 *
 * ## Exchange rate source
 * Uses the free Open Exchange Rates compatible endpoint at
 * https://open.er-api.com/v6/latest/USD (no API key required, 1500 req/month).
 * Override with NEXT_PUBLIC_EXCHANGE_RATE_API_URL env var.
 *
 * ## Cache strategy
 * Rates are cached in localStorage for CACHE_TTL_MS (default 1 hour).
 * On cache miss the context fetches fresh rates. If the fetch fails,
 * it falls back to the last cached rates, then to USD (1:1).
 *
 * ## Usage
 *
 *   // Wrap your app (already done in layout.jsx)
 *   <CurrencyProvider>...</CurrencyProvider>
 *
 *   // In any component
 *   const { currency, setCurrency, convert, format, formatAmount } = useCurrency();
 *
 *   format(1000000, 'USDC')   // "1,000.00 USDC" → "$1,000.00" in USD, "€920.00" in EUR
 *   formatAmount(1000000)     // raw converted number formatted in selected currency
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

// ── Constants ─────────────────────────────────────────────────────────────────

const CACHE_KEY = 'ste_fx_rates';
const CACHE_TTL_MS = parseInt(
  process.env.NEXT_PUBLIC_FX_CACHE_TTL_MS || String(60 * 60 * 1000),
  10,
);
const RATES_URL =
  process.env.NEXT_PUBLIC_EXCHANGE_RATE_API_URL ||
  'https://open.er-api.com/v6/latest/USD';

export const SUPPORTED_CURRENCIES = [
  { code: 'USD', symbol: '$',  name: 'US Dollar',         locale: 'en-US' },
  { code: 'EUR', symbol: '€',  name: 'Euro',              locale: 'de-DE' },
  { code: 'GBP', symbol: '£',  name: 'British Pound',     locale: 'en-GB' },
  { code: 'JPY', symbol: '¥',  name: 'Japanese Yen',      locale: 'ja-JP' },
  { code: 'CAD', symbol: 'CA$',name: 'Canadian Dollar',   locale: 'en-CA' },
  { code: 'AUD', symbol: 'A$', name: 'Australian Dollar', locale: 'en-AU' },
  { code: 'CHF', symbol: 'Fr', name: 'Swiss Franc',       locale: 'de-CH' },
  { code: 'CNY', symbol: '¥',  name: 'Chinese Yuan',      locale: 'zh-CN' },
  { code: 'INR', symbol: '₹',  name: 'Indian Rupee',      locale: 'en-IN' },
  { code: 'BRL', symbol: 'R$', name: 'Brazilian Real',    locale: 'pt-BR' },
  { code: 'MXN', symbol: 'MX$',name: 'Mexican Peso',      locale: 'es-MX' },
  { code: 'SGD', symbol: 'S$', name: 'Singapore Dollar',  locale: 'en-SG' },
  { code: 'KRW', symbol: '₩',  name: 'South Korean Won',  locale: 'ko-KR' },
  { code: 'NGN', symbol: '₦',  name: 'Nigerian Naira',    locale: 'en-NG' },
  { code: 'ZAR', symbol: 'R',  name: 'South African Rand',locale: 'en-ZA' },
];

const DEFAULT_CURRENCY = 'USD';

// On-chain amounts are stored in stroops (1 USDC = 10_000_000 stroops)
// but the API returns them as raw i128 strings. We treat 1 unit = 1 USDC
// for display purposes (the contract uses 7 decimal places).
const STROOP_DIVISOR = 10_000_000;

// ── Cache helpers ─────────────────────────────────────────────────────────────

function readCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const { rates, fetchedAt } = JSON.parse(raw);
    if (Date.now() - fetchedAt > CACHE_TTL_MS) return null;
    return rates;
  } catch {
    return null;
  }
}

function writeCache(rates) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ rates, fetchedAt: Date.now() }));
  } catch {
    // localStorage may be unavailable (SSR, private browsing quota)
  }
}

// ── Context ───────────────────────────────────────────────────────────────────

const CurrencyContext = createContext(null);

export function CurrencyProvider({ children }) {
  const [currency, _setCurrency] = useState(DEFAULT_CURRENCY);
  const [rates, setRates] = useState({ USD: 1 }); // USD base
  const [ratesLoading, setRatesLoading] = useState(true);
  const [ratesError, setRatesError] = useState(null);
  const fetchedRef = useRef(false);

  // ── Restore persisted currency on mount ───────────────────────────────────
  useEffect(() => {
    try {
      const saved = localStorage.getItem('ste_currency');
      if (saved && SUPPORTED_CURRENCIES.some((c) => c.code === saved)) {
        _setCurrency(saved);
      }
    } catch {
      // ignore
    }
  }, []);

  // ── Fetch exchange rates ───────────────────────────────────────────────────
  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;

    // Try cache first
    const cached = readCache();
    if (cached) {
      setRates(cached);
      setRatesLoading(false);
      return;
    }

    setRatesLoading(true);
    fetch(RATES_URL)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data) => {
        // open.er-api.com returns { rates: { USD: 1, EUR: 0.92, ... } }
        const fetched = data.rates ?? data.conversion_rates ?? {};
        if (!fetched.USD) fetched.USD = 1;
        setRates(fetched);
        writeCache(fetched);
        setRatesError(null);
      })
      .catch((err) => {
        console.warn('[Currency] Failed to fetch exchange rates:', err.message);
        setRatesError(err.message);
        // Keep whatever rates we have (USD fallback)
      })
      .finally(() => setRatesLoading(false));
  }, []);

  // ── setCurrency — persists to localStorage ────────────────────────────────
  const setCurrency = useCallback((code) => {
    if (!SUPPORTED_CURRENCIES.some((c) => c.code === code)) return;
    _setCurrency(code);
    try {
      localStorage.setItem('ste_currency', code);
    } catch {
      // ignore
    }
  }, []);

  // ── convert(usdcAmount) → number in selected currency ─────────────────────
  /**
   * Converts a raw on-chain amount (stroops) to the selected fiat currency.
   *
   * @param {string|number|bigint} rawAmount — on-chain amount (stroops)
   * @returns {number}
   */
  const convert = useCallback(
    (rawAmount) => {
      const usdc = Number(rawAmount) / STROOP_DIVISOR;
      const rate = rates[currency] ?? 1;
      return usdc * rate;
    },
    [rates, currency],
  );

  // ── formatAmount(fiatValue) → locale string ───────────────────────────────
  /**
   * Formats a fiat value (already converted) using the locale for the
   * selected currency.
   *
   * @param {number} fiatValue
   * @param {object} [opts]
   * @param {boolean} [opts.compact]  — use compact notation (1.2K, 3.4M)
   * @returns {string}
   */
  const formatAmount = useCallback(
    (fiatValue, { compact = false } = {}) => {
      const meta = SUPPORTED_CURRENCIES.find((c) => c.code === currency) ?? SUPPORTED_CURRENCIES[0];
      try {
        return new Intl.NumberFormat(meta.locale, {
          style: 'currency',
          currency: meta.code,
          notation: compact ? 'compact' : 'standard',
          maximumFractionDigits: ['JPY', 'KRW'].includes(meta.code) ? 0 : 2,
        }).format(fiatValue);
      } catch {
        // Fallback for environments without full Intl support
        return `${meta.symbol}${fiatValue.toFixed(2)}`;
      }
    },
    [currency],
  );

  // ── format(rawAmount) → full pipeline: convert + format ──────────────────
  /**
   * Converts a raw on-chain stroop amount and formats it in the selected
   * currency. This is the main helper used by display components.
   *
   * @param {string|number|bigint} rawAmount
   * @param {object} [opts]
   * @returns {string}  e.g. "$1,000.00" or "€920.00"
   */
  const format = useCallback(
    (rawAmount, opts) => formatAmount(convert(rawAmount), opts),
    [convert, formatAmount],
  );

  // ── formatUSDC(rawAmount) → "1,000.00 USDC" (no conversion) ──────────────
  /**
   * Formats a raw stroop amount as USDC without currency conversion.
   * Useful for showing the on-chain denomination alongside the fiat value.
   *
   * @param {string|number|bigint} rawAmount
   * @returns {string}
   */
  const formatUSDC = useCallback((rawAmount) => {
    const usdc = Number(rawAmount) / STROOP_DIVISOR;
    return `${usdc.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDC`;
  }, []);

  const value = useMemo(
    () => ({
      currency,
      setCurrency,
      rates,
      ratesLoading,
      ratesError,
      convert,
      format,
      formatAmount,
      formatUSDC,
      supportedCurrencies: SUPPORTED_CURRENCIES,
    }),
    [currency, setCurrency, rates, ratesLoading, ratesError, convert, format, formatAmount, formatUSDC],
  );

  return <CurrencyContext.Provider value={value}>{children}</CurrencyContext.Provider>;
}

export function useCurrency() {
  const ctx = useContext(CurrencyContext);
  if (!ctx) throw new Error('useCurrency must be used within CurrencyProvider');
  return ctx;
}
