/**
 * Advanced per-user rate limiter with sliding window, burst handling, and adaptive limits.
 *
 * Algorithm: sliding window — tracks individual request timestamps per key so
 * the count reflects actual traffic in the last `windowMs` milliseconds rather
 * than snapping to a fixed boundary.
 *
 * Features:
 *  - Sliding window  — accurate per-key request counting with no boundary spike
 *  - Burst limiting  — secondary short-window guard against sudden spikes
 *  - Adaptive limits — automatically reduces effective max under high server load
 *  - Distributed     — store interface allows swapping in-memory for Redis
 */
import {
  RATE_LIMIT_WINDOW_MS,
  BURST_WINDOW_MS,
  getLimitForTier,
  getBurstLimitForTier,
  DEFAULT_TIER,
} from '../../config/rateLimits.js';

// ── Sliding window store ──────────────────────────────────────────────────────

/**
 * In-memory sliding window store.
 * Each key maps to a sorted (ascending) array of request timestamps.
 *
 * For distributed deployments swap this with a RedisWindowStore that uses
 * Redis sorted sets:  ZADD key score member  /  ZREMRANGEBYSCORE  /  ZCARD.
 */
class SlidingWindowStore {
  constructor() {
    /** @type {Map<string, number[]>} */
    this._store = new Map();
  }

  /** Remove entries older than cutoff from a timestamp array (mutates in place). */
  _prune(timestamps, cutoff) {
    let lo = 0;
    while (lo < timestamps.length && timestamps[lo] <= cutoff) lo++;
    if (lo > 0) timestamps.splice(0, lo);
  }

  /**
   * Record a new request for `key` within `windowMs` and return the new count.
   * @param {string} key
   * @param {number} windowMs
   * @param {number} [now]
   * @returns {number}
   */
  record(key, windowMs, now = Date.now()) {
    let ts = this._store.get(key);
    if (!ts) {
      ts = [];
      this._store.set(key, ts);
    }
    this._prune(ts, now - windowMs);
    ts.push(now);
    return ts.length;
  }

  /**
   * Count requests for `key` within the last `windowMs` ms (prunes stale entries).
   * @param {string} key
   * @param {number} windowMs
   * @param {number} [now]
   * @returns {number}
   */
  count(key, windowMs, now = Date.now()) {
    const ts = this._store.get(key);
    if (!ts || ts.length === 0) return 0;
    this._prune(ts, now - windowMs);
    if (ts.length === 0) {
      this._store.delete(key);
      return 0;
    }
    return ts.length;
  }

  /**
   * Return the oldest timestamp recorded for `key`, or null if none.
   * @param {string} key
   * @returns {number|null}
   */
  oldest(key) {
    const ts = this._store.get(key);
    return ts && ts.length > 0 ? ts[0] : null;
  }

  /**
   * Return a usage summary for `key` — compatible with getUserUsage callers.
   * @param {string} key
   * @param {number} windowMs
   * @param {number} [now]
   * @returns {{ count: number, resetAt: Date|null }}
   */
  getEntry(key, windowMs, now = Date.now()) {
    const count = this.count(key, windowMs, now);
    if (count === 0) return { count: 0, resetAt: null };
    const oldest = this.oldest(key);
    return { count, resetAt: oldest ? new Date(oldest + windowMs) : null };
  }

  clear() {
    this._store.clear();
  }
}

// Module-level shared store (single instance per process).
const slidingStore = new SlidingWindowStore();

// ── Adaptive load tracking ────────────────────────────────────────────────────

let _adaptiveErrorRate = 0;

/**
 * Update the current server error rate (0–1).
 * Call this from your error handler or a metrics collector.
 * @param {number} errorRate - fraction of requests that resulted in 5xx (0–1)
 */
export function updateAdaptiveLoad(errorRate) {
  _adaptiveErrorRate = Math.max(0, Math.min(1, errorRate));
}

function _getAdaptiveFactor() {
  if (_adaptiveErrorRate > 0.5) return 0.5;
  if (_adaptiveErrorRate > 0.25) return 0.75;
  return 1.0;
}

// ── Public store accessors (backwards compat + testing) ───────────────────────

/** Returns the shared SlidingWindowStore instance. Useful for tests / inspection. */
export function getUsageStore() {
  return slidingStore;
}

/**
 * Return the current usage for a user within the default rate-limit window.
 * @param {string} userId
 * @returns {{ count: number, resetAt: Date|null }}
 */
export function getUserUsage(userId) {
  return slidingStore.getEntry(`user:${userId}`, RATE_LIMIT_WINDOW_MS);
}

/**
 * Manually record a usage hit for a key.
 * @param {string} key
 * @param {number} windowMs
 * @returns {number} new count
 */
export function trackUsage(key, windowMs) {
  return slidingStore.record(key, windowMs);
}

// ── Core sliding-window factory ───────────────────────────────────────────────

/**
 * Create an Express middleware that enforces a sliding-window rate limit.
 *
 * @param {object} options
 * @param {number}   [options.windowMs=60000]    Sliding window size in ms
 * @param {number}   options.max                 Max requests per window
 * @param {number}   [options.burstMax]          Max requests in burstWindowMs (spike guard)
 * @param {number}   [options.burstWindowMs=1000] Burst window size in ms
 * @param {boolean}  [options.adaptive=false]    Reduce limits when server is under load
 * @param {string}   [options.prefix='sliding']  Key namespace
 * @param {string}   [options.message]           Rejection message
 * @param {function} [options.keyGenerator]      (req) => string  — custom key extractor
 * @returns {import('express').RequestHandler}
 */
export function createSlidingWindowRateLimiter({
  windowMs = RATE_LIMIT_WINDOW_MS,
  max,
  burstMax,
  burstWindowMs = BURST_WINDOW_MS,
  adaptive = false,
  prefix = 'sliding',
  message = 'Too many requests, please try again later.',
  keyGenerator,
} = {}) {
  const defaultKeyGen = (req) => {
    if (req.user?.id) return `${prefix}:user:${req.user.id}`;
    if (req.headers['x-user-id']) return `${prefix}:user:${req.headers['x-user-id']}`;
    return `${prefix}:ip:${req.ip || 'unknown'}`;
  };
  const getKey = keyGenerator || defaultKeyGen;

  return (req, res, next) => {
    const now = Date.now();
    const key = getKey(req);
    const effectiveMax = adaptive ? Math.floor(max * _getAdaptiveFactor()) : max;

    // ── Burst check: short-window spike protection ──────────────────────────
    if (burstMax !== undefined) {
      const burstKey = `${key}:burst`;
      const burstCount = slidingStore.count(burstKey, burstWindowMs, now);
      if (burstCount >= burstMax) {
        res.set('Retry-After', String(Math.ceil(burstWindowMs / 1000)));
        res.set('X-RateLimit-Limit', String(effectiveMax));
        res.set('X-RateLimit-Remaining', '0');
        return res.status(429).json({ error: message, code: 'RATE_LIMIT_EXCEEDED', reason: 'burst' });
      }
      slidingStore.record(burstKey, burstWindowMs, now);
    }

    // ── Sliding window check ────────────────────────────────────────────────
    const count = slidingStore.count(key, windowMs, now);

    res.set('X-RateLimit-Limit', String(effectiveMax));
    res.set('X-RateLimit-Remaining', String(Math.max(0, effectiveMax - count - 1)));
    res.set('X-RateLimit-Reset', String(Math.ceil((now + windowMs) / 1000)));

    if (count >= effectiveMax) {
      const oldest = slidingStore.oldest(key);
      const retryAfterMs = oldest ? oldest + windowMs - now : windowMs;
      res.set('Retry-After', String(Math.max(1, Math.ceil(retryAfterMs / 1000))));
      res.set('X-RateLimit-Remaining', '0');
      return res.status(429).json({ error: message, code: 'RATE_LIMIT_EXCEEDED' });
    }

    slidingStore.record(key, windowMs, now);
    next();
  };
}

// ── Per-user tier-aware factory ───────────────────────────────────────────────

/**
 * Create a tier-aware per-user sliding-window rate limiter.
 * When a fixed `max` override is provided it behaves like a static limiter
 * (useful for tests); otherwise the limit is derived from `req.user.tier`.
 *
 * @param {object}  [options]
 * @param {string}  [options.prefix='api']
 * @param {string}  [options.message]
 * @param {number}  [options.max]       Fixed max override (bypasses tier lookup)
 * @param {boolean} [options.adaptive]  Reduce limits under load
 * @returns {import('express').RequestHandler}
 */
export function createPerUserRateLimiter({
  prefix = 'api',
  message = 'Too many requests, please try again later.',
  max: maxOverride,
  adaptive = false,
} = {}) {
  const keyGenerator = (req) => {
    if (req.user?.id) return `${prefix}:user:${req.user.id}`;
    if (req.headers['x-user-id']) return `${prefix}:user:${req.headers['x-user-id']}`;
    return `${prefix}:ip:${req.ip || 'unknown'}`;
  };

  // Static limiter (fixed max, no burst) — used mainly for testing
  if (maxOverride !== undefined) {
    return createSlidingWindowRateLimiter({
      windowMs: RATE_LIMIT_WINDOW_MS,
      max: maxOverride,
      prefix,
      message,
      keyGenerator,
      adaptive,
    });
  }

  // Dynamic — resolve tier limits on each request
  return (req, res, next) => {
    const tier = req.user?.tier ?? DEFAULT_TIER;
    const max = getLimitForTier(tier);
    const burstMax = getBurstLimitForTier(tier);

    createSlidingWindowRateLimiter({
      windowMs: RATE_LIMIT_WINDOW_MS,
      max,
      burstMax,
      prefix,
      message,
      keyGenerator,
      adaptive,
    })(req, res, next);
  };
}

export const perUserRateLimit = createPerUserRateLimiter();
