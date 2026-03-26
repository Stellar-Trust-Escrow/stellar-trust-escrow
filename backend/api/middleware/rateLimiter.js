/**
 * Per-user rate limiter middleware.
 * Uses user tier from req.user to apply dynamic limits.
 */
import rateLimit from 'express-rate-limit';
import { RATE_LIMIT_WINDOW_MS, getLimitForTier, DEFAULT_TIER } from '../../config/rateLimits.js';

// In-memory usage tracking: { key -> { count, resetAt } }
const usageStore = new Map();

export function getUsageStore() {
  return usageStore;
}

export function trackUsage(key, windowMs) {
  const now = Date.now();
  const entry = usageStore.get(key);
  if (!entry || now >= entry.resetAt) {
    usageStore.set(key, { count: 1, resetAt: now + windowMs });
    return 1;
  }
  entry.count += 1;
  return entry.count;
}

export function getUserUsage(userId) {
  const key = `user:${userId}`;
  const entry = usageStore.get(key);
  if (!entry || Date.now() >= entry.resetAt) return { count: 0, resetAt: null };
  return { count: entry.count, resetAt: new Date(entry.resetAt) };
}

/**
 * Creates a per-user tier-aware rate limit middleware.
 * @param {object} [options]
 * @param {string} [options.prefix]
 * @param {string} [options.message]
 * @param {number} [options.max] - Fixed max override (bypasses tier lookup; useful for testing)
 */
export function createPerUserRateLimiter({
  prefix = 'api',
  message = 'Too many requests, please try again later.',
  max: maxOverride,
} = {}) {
  const keyGenerator = (req) => {
    if (req.user?.id) return `${prefix}:user:${req.user.id}`;
    if (req.headers['x-user-id']) return `${prefix}:user:${req.headers['x-user-id']}`;
    return `${prefix}:ip:${req.ip || 'unknown'}`;
  };

  const handler = (_req, res, _next, options) => {
    res.status(options.statusCode).json({ error: message, code: 'RATE_LIMIT_EXCEEDED' });
  };

  // Fixed max — return a single static limiter
  if (maxOverride !== undefined) {
    return rateLimit({ windowMs: RATE_LIMIT_WINDOW_MS, max: maxOverride, standardHeaders: true, legacyHeaders: false, keyGenerator, handler });
  }

  // Dynamic — resolve max from user tier on each request
  return (req, res, next) => {
    const tier = req.user?.tier ?? DEFAULT_TIER;
    const max = getLimitForTier(tier);

    const limiter = rateLimit({ windowMs: RATE_LIMIT_WINDOW_MS, max, standardHeaders: true, legacyHeaders: false, keyGenerator, handler });

    const userId = req.user?.id ?? req.headers['x-user-id'];
    if (userId) trackUsage(`user:${userId}`, RATE_LIMIT_WINDOW_MS);

    limiter(req, res, next);
  };
}

export const perUserRateLimit = createPerUserRateLimiter();
