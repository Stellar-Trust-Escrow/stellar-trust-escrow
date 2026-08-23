/**
 * XLM/USD Price Oracle Service
 *
 * Multi-source price feed with failover, backed by cacheService (Redis with
 * in-memory fallback — see services/cacheService.js). The REST endpoint never
 * blocks on an external call: a background job (see priceOracleJob.js)
 * proactively refreshes the cache every REFRESH_INTERVAL_MS.
 *
 * Source priority:
 *   1. Configured Stellar Anchor SEP-38 quote server (optional)
 *   2. Coingecko simple price API
 *   3. Binance ticker price API
 */

import { createModuleLogger } from '../config/logger.js';
import cacheService from './cacheService.js';

const log = createModuleLogger('service.priceOracle');

const CACHE_KEY = 'market:xlm_usd';
const CACHE_TTL_SECONDS = 60;
const STALE_AFTER_MS = 5 * 60 * 1000;

const FETCH_TIMEOUT_MS = parseInt(process.env.PRICE_ORACLE_FETCH_TIMEOUT_MS || '5000', 10);

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

async function fetchFromSep38() {
  const sep38QuoteServer = process.env.SEP38_QUOTE_SERVER_URL || null;
  if (!sep38QuoteServer) throw new Error('SEP-38 quote server not configured');
  const start = Date.now();
  const data = await fetchWithTimeout(
    `${sep38QuoteServer}/price?sell_asset=stellar:native&buy_asset=iso4217:USD&sell_amount=1`,
  );
  const price = parseFloat(data.buy_amount ?? data.price);
  if (!Number.isFinite(price) || price <= 0) throw new Error('Invalid SEP-38 price payload');
  return { price_usd: price, source: 'sep38', latencyMs: Date.now() - start };
}

async function fetchFromCoingecko() {
  const start = Date.now();
  const data = await fetchWithTimeout(
    'https://api.coingecko.com/api/v3/simple/price?ids=stellar&vs_currencies=usd',
  );
  const price = data?.stellar?.usd;
  if (!Number.isFinite(price) || price <= 0) throw new Error('Invalid Coingecko payload');
  return { price_usd: price, source: 'coingecko', latencyMs: Date.now() - start };
}

async function fetchFromBinance() {
  const start = Date.now();
  const data = await fetchWithTimeout('https://api.binance.com/api/v3/ticker/price?symbol=XLMUSDT');
  const price = parseFloat(data?.price);
  if (!Number.isFinite(price) || price <= 0) throw new Error('Invalid Binance payload');
  return { price_usd: price, source: 'binance', latencyMs: Date.now() - start };
}

// Ordered failover chain — exported so tests can mock individual sources.
export const SOURCES = [fetchFromSep38, fetchFromCoingecko, fetchFromBinance];

/**
 * Attempts each source in priority order, returns the first success.
 * Throws only if every source fails.
 */
export async function fetchLivePrice() {
  const errors = [];
  for (const source of SOURCES) {
    try {
      const result = await source();
      log.info({
        message: 'price_oracle_source_succeeded',
        source: result.source,
        latencyMs: result.latencyMs,
      });
      return result;
    } catch (err) {
      errors.push({ source: source.name, error: err.message });
      log.warn({ message: 'price_oracle_source_failed', source: source.name, error: err.message });
    }
  }
  const err = new Error('All price oracle sources failed');
  err.details = errors;
  throw err;
}

/**
 * Refreshes the cache from live sources. Called by the background job and
 * safe to call directly (e.g. from tests or an admin endpoint).
 */
export async function refreshCache() {
  const { price_usd, source } = await fetchLivePrice();
  const entry = { price_usd, source, timestamp: new Date().toISOString(), stale: false };
  await cacheService.set(CACHE_KEY, entry, CACHE_TTL_SECONDS);
  // Keep a longer-lived shadow copy so we can still serve (stale) data if
  // every source fails on a later refresh and the primary TTL has expired.
  await cacheService.set(`${CACHE_KEY}:last_known`, entry, Math.ceil(STALE_AFTER_MS / 1000));
  return entry;
}

/**
 * Returns the current price for the REST endpoint. Never calls out to an
 * external API on this path — relies entirely on the cache the background
 * job maintains. Returns null only when no cached value exists at all and
 * a live fetch also fails (first-boot / total outage case).
 */
export async function getCachedPrice() {
  const fresh = await cacheService.get(CACHE_KEY);
  if (fresh) return fresh;

  const lastKnown = await cacheService.get(`${CACHE_KEY}:last_known`);
  if (lastKnown) {
    const age = Date.now() - new Date(lastKnown.timestamp).getTime();
    if (age <= STALE_AFTER_MS) {
      return { ...lastKnown, stale: true };
    }
  }

  // No usable cache at all — one synchronous attempt (first boot only).
  try {
    return await refreshCache();
  } catch (err) {
    log.error({ message: 'price_oracle_cold_start_failed', error: err.message });
    return null;
  }
}

export default { fetchLivePrice, refreshCache, getCachedPrice, SOURCES, CACHE_KEY };
