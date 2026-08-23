/**
 * Pre-warms the XLM/USD price cache on an interval so the REST endpoint
 * never waits on an external call. Mirrors the pattern used by other
 * interval-driven workers in this codebase (e.g. keyRotationQueue).
 */

import { createModuleLogger } from '../config/logger.js';
import { refreshCache } from '../services/priceOracleService.js';

const log = createModuleLogger('worker.priceOracle');

const REFRESH_INTERVAL_MS = parseInt(process.env.PRICE_ORACLE_REFRESH_MS || '60000', 10);

let timer = null;

async function tick() {
  try {
    const entry = await refreshCache();
    log.info({
      message: 'price_oracle_refreshed',
      source: entry.source,
      price_usd: entry.price_usd,
    });
  } catch (err) {
    log.error({ message: 'price_oracle_refresh_failed', error: err.message });
  }
}

export function startPriceOracleWorker() {
  if (timer) return timer;
  tick(); // warm immediately on boot
  timer = setInterval(tick, REFRESH_INTERVAL_MS);
  timer.unref?.();
  return timer;
}

export function stopPriceOracleWorker() {
  if (timer) clearInterval(timer);
  timer = null;
}

export default { startPriceOracleWorker, stopPriceOracleWorker };
