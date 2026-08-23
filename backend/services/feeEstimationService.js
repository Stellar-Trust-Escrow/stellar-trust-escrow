import { simulateTransaction } from './stellarService.js';
import { createModuleLogger } from '../config/logger.js';

const log = createModuleLogger('service.feeEstimation');
const STROOPS_PER_XLM = 10_000_000;
const CACHE_TTL_MS = 30_000;

const _cache = new Map();

function _cacheKey(params) {
  return JSON.stringify(params);
}

function _fromCache(key) {
  const entry = _cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) { _cache.delete(key); return null; }
  return entry.value;
}

function _toCache(key, value) {
  _cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
}

export function clearCache() {
  _cache.clear();
}

export async function estimateFee(escrowParams) {
  const key = _cacheKey(escrowParams);
  const cached = _fromCache(key);
  if (cached) {
    log.info({ message: 'fee_estimate_cache_hit' });
    return cached;
  }

  const placeholderXdr = Buffer.from(JSON.stringify(escrowParams)).toString('base64');

  let simResult;
  try {
    simResult = await simulateTransaction(placeholderXdr);
  } catch (err) {
    log.warn({ message: 'simulate_failed', error: err.message });
    simResult = { success: false, cost: { cpuInsns: '500000', memBytes: '65536' } };
  }

  const cpuInsns = parseInt(simResult?.cost?.cpuInsns ?? '500000', 10);
  const memBytes = parseInt(simResult?.cost?.memBytes ?? '65536', 10);
  const feeStroops = 100 + Math.ceil(cpuInsns / 10000) + Math.ceil(memBytes / 1024);
  const feeXLM = parseFloat((feeStroops / STROOPS_PER_XLM).toFixed(7));
  const expirationLedger = Math.floor(Date.now() / 5000) + 6;

  const result = { feeStroops, feeXLM, cpuInsns, memBytes, expirationLedger };
  _toCache(key, result);
  log.info({ message: 'fee_estimate_computed', feeStroops });
  return result;
}
