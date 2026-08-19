
/**
 * @fileoverview Rate-limit analytics service.
 *
 * Tracks per-consumer request volume using Redis sliding-window counters,
 * persists breach events to the database, and exposes aggregate stats for
 * dashboards and abuse-detection workflows.
 */

// ---------------------------------------------------------------------------
// Stub dependencies — replace with real singletons in production
// ---------------------------------------------------------------------------

/**
 * Redis client stub.  Swap for `createClient()` from `redis` or `ioredis`.
 * @type {{ incr: Function, expire: Function, get: Function, keys: Function, mget: Function, zadd: Function, zrangebyscore: Function, zcard: Function }}
 */
const redis = global.__redis || {
  /**
   * @param {string} key
   * @returns {Promise<number>}
   */
  incr: async (key) => { void key; return 1; },

  /**
   * @param {string} key
   * @param {number} seconds
   * @returns {Promise<void>}
   */
  expire: async (key, seconds) => { void key; void seconds; },

  /**
   * @param {string} key
   * @returns {Promise<string|null>}
   */
  get: async (key) => null,

  /**
   * @param {string} pattern
   * @returns {Promise<string[]>}
   */
  keys: async (pattern) => [],

  /**
   * @param {string[]} keys
   * @returns {Promise<(string|null)[]>}
   */
  mget: async (keys) => keys.map(() => null),

  /**
   * @param {string} key
   * @param {number} score
   * @param {string} member
   * @returns {Promise<number>}
   */
  zadd: async (key, score, member) => 1,

  /**
   * @param {string} key
   * @param {number} min
   * @param {number} max
   * @returns {Promise<string[]>}
   */
  zrangebyscore: async (key, min, max) => [],

  /**
   * @param {string} key
   * @returns {Promise<number>}
   */
  zcard: async (key) => 0,
};

/** @type {import('@prisma/client').PrismaClient} */
import prismaModule from '../config/prisma.js';
const prisma = global.__prisma || prismaModule;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default request quota per consumer per window. */
const DEFAULT_QUOTA = parseInt(process.env.RATE_LIMIT_QUOTA || '1000', 10);

/** Default rolling window duration in seconds (1 hour). */
const DEFAULT_WINDOW_S = parseInt(process.env.RATE_LIMIT_WINDOW_S || '3600', 10);

/** Breach-rate threshold above which abuse is flagged (breaches per hour). */
const ABUSE_BREACH_THRESHOLD = parseInt(process.env.RATE_LIMIT_ABUSE_THRESHOLD || '10', 10);

/** Prefix for all rate-limit Redis keys. */
const KEY_PREFIX = 'rl:';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Build the Redis key for a consumer's rolling-window counter.
 * Keys are bucketed by hour so they expire naturally.
 *
 * @param {string} consumerId
 * @param {Date}   [at]  Timestamp to bucket by (defaults to now).
 * @returns {string}
 */
function counterKey(consumerId, at = new Date()) {
  const hour = Math.floor(at.getTime() / 1000 / DEFAULT_WINDOW_S);
  return `${KEY_PREFIX}cnt:${consumerId}:${hour}`;
}

/**
 * Build the Redis sorted-set key used for time-bucketed stats.
 *
 * @param {string} consumerId
 * @returns {string}
 */
function timeseriesKey(consumerId) {
  return `${KEY_PREFIX}ts:${consumerId}`;
}

/**
 * Stub alert dispatcher.  Replace with your actual alerting integration
 * (PagerDuty, Slack, SNS, etc.).
 *
 * @param {string} consumerId
 * @param {number} breachCount
 * @returns {void}
 */
function _dispatchAbuseAlert(consumerId, breachCount) {
  console.warn(`[rateLimitAnalytics] ABUSE ALERT — consumer "${consumerId}" has ${breachCount} breaches in the last hour.`);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} QuotaResult
 * @property {boolean} allowed    Whether this request is within quota.
 * @property {number}  remaining  Requests remaining in the current window.
 * @property {string}  resetAt    ISO-8601 timestamp when the window resets.
 */

/**
 * @typedef {Object} TimeBucket
 * @property {string} bucket       ISO-8601 timestamp for the bucket start.
 * @property {number} requestCount Number of requests in this bucket.
 */

/**
 * @typedef {Object} ConsumerStat
 * @property {string} consumerId
 * @property {number} requestCount
 */

/**
 * @typedef {Object} AbuseResult
 * @property {boolean} abusive     Whether the consumer is flagged.
 * @property {number}  breachCount Number of breaches in the last hour.
 */

/**
 * Increment the per-consumer request counter in Redis and record the
 * timestamp in the time-series sorted set for later aggregation.
 *
 * @param {string} consumerId  Unique identifier for the API consumer.
 * @param {string} endpoint    The endpoint path being requested.
 * @param {Date}   [timestamp] Request timestamp (defaults to now).
 * @returns {Promise<void>}
 */
async function recordRequest(consumerId, endpoint, timestamp = new Date()) {
  if (!consumerId) throw new Error('consumerId is required');
  if (!endpoint)   throw new Error('endpoint is required');

  const key = counterKey(consumerId, timestamp);
  const tsKey = timeseriesKey(consumerId);
  const ts = timestamp.getTime();

  try {
    // Increment the rolling-window counter and (re)set its TTL
    await redis.incr(key);
    await redis.expire(key, DEFAULT_WINDOW_S * 2); // keep one extra window for overlap reads

    // Record the individual event in the sorted set for fine-grained bucketing
    const member = `${ts}:${endpoint}:${Math.random().toString(36).slice(2)}`;
    await redis.zadd(tsKey, ts, member);
    // Prune events older than 24 h to bound memory
    const cutoff = ts - 24 * 60 * 60 * 1000;
    // Note: zremrangebyscore would be used here; stub skips actual removal
  } catch (err) {
    console.error(`[rateLimitAnalytics] Redis error in recordRequest(${consumerId}):`, err);
    // Non-fatal — allow the request to proceed even if analytics fails
  }
}

/**
 * Check whether a consumer is within their request quota for the current
 * rolling window.
 *
 * @param {string} consumerId
 * @returns {Promise<QuotaResult>}
 */
async function checkQuota(consumerId) {
  if (!consumerId) throw new Error('consumerId is required');

  const now = new Date();
  const key = counterKey(consumerId, now);

  let count = 0;
  try {
    const raw = await redis.get(key);
    count = raw ? parseInt(raw, 10) : 0;
  } catch (err) {
    console.error(`[rateLimitAnalytics] Redis error in checkQuota(${consumerId}):`, err);
    // Fail open — return full quota on Redis error
    count = 0;
  }

  const windowStart = Math.floor(now.getTime() / 1000 / DEFAULT_WINDOW_S) * DEFAULT_WINDOW_S;
  const resetAt = new Date((windowStart + DEFAULT_WINDOW_S) * 1000).toISOString();
  const remaining = Math.max(0, DEFAULT_QUOTA - count);

  return {
    allowed: count < DEFAULT_QUOTA,
    remaining,
    resetAt,
  };
}

/**
 * Persist a rate-limit breach event to the database.
 *
 * @param {string} consumerId
 * @param {string} endpoint
 * @returns {Promise<void>}
 */
async function recordBreach(consumerId, endpoint) {
  if (!consumerId) throw new Error('consumerId is required');
  if (!endpoint)   throw new Error('endpoint is required');

  try {
    await prisma.rateLimitBreach.create({
      data: {
        consumerId,
        endpoint,
        occurredAt: new Date(),
      },
    });
  } catch (err) {
    console.error(`[rateLimitAnalytics] DB error in recordBreach(${consumerId}, ${endpoint}):`, err);
    throw err;
  }
}

/**
 * Aggregate raw request events from Redis into time buckets for charting.
 *
 * @param {string} consumerId
 * @param {number} [bucketMinutes=60]  Width of each time bucket in minutes.
 * @returns {Promise<TimeBucket[]>}  Oldest bucket first.
 */
async function getTimeBucketedStats(consumerId, bucketMinutes = 60) {
  if (!consumerId)     throw new Error('consumerId is required');
  if (bucketMinutes < 1) throw new Error('bucketMinutes must be >= 1');

  const tsKey = timeseriesKey(consumerId);
  const bucketMs = bucketMinutes * 60 * 1000;
  const now = Date.now();
  const windowStart = now - 24 * 60 * 60 * 1000; // last 24 hours

  let members;
  try {
    members = await redis.zrangebyscore(tsKey, windowStart, now);
  } catch (err) {
    console.error(`[rateLimitAnalytics] Redis error in getTimeBucketedStats(${consumerId}):`, err);
    return [];
  }

  // Parse timestamps from the composite member strings and bucket them
  /** @type {Map<number, number>} */
  const buckets = new Map();

  for (const member of members) {
    const ts = parseInt(member.split(':')[0], 10);
    if (isNaN(ts)) continue;
    const bucketStart = Math.floor(ts / bucketMs) * bucketMs;
    buckets.set(bucketStart, (buckets.get(bucketStart) || 0) + 1);
  }

  return Array.from(buckets.entries())
    .sort(([a], [b]) => a - b)
    .map(([bucketStart, requestCount]) => ({
      bucket: new Date(bucketStart).toISOString(),
      requestCount,
    }));
}

/**
 * Return the top N consumers ranked by total request volume in the current window.
 *
 * @param {number} [limit=10]
 * @returns {Promise<ConsumerStat[]>}
 */
async function getTopConsumers(limit = 10) {
  if (limit < 1) throw new Error('limit must be >= 1');

  let keys;
  try {
    const now = new Date();
    const pattern = `${KEY_PREFIX}cnt:*:${Math.floor(now.getTime() / 1000 / DEFAULT_WINDOW_S)}`;
    keys = await redis.keys(pattern);
  } catch (err) {
    console.error('[rateLimitAnalytics] Redis error in getTopConsumers (keys):', err);
    return [];
  }

  if (!keys.length) return [];

  let values;
  try {
    values = await redis.mget(keys);
  } catch (err) {
    console.error('[rateLimitAnalytics] Redis error in getTopConsumers (mget):', err);
    return [];
  }

  /** @type {ConsumerStat[]} */
  const stats = keys
    .map((key, i) => {
      // key format: rl:cnt:<consumerId>:<hour>
      const parts = key.split(':');
      const consumerId = parts.slice(2, parts.length - 1).join(':');
      const requestCount = values[i] ? parseInt(values[i], 10) : 0;
      return { consumerId, requestCount };
    })
    .filter((s) => s.consumerId && s.requestCount > 0)
    .sort((a, b) => b.requestCount - a.requestCount)
    .slice(0, limit);

  return stats;
}

/**
 * Detect whether a consumer is exhibiting abusive request patterns by
 * checking if their breach count in the last hour exceeds the configured
 * threshold.  Triggers an alert stub when abuse is detected.
 *
 * @param {string} consumerId
 * @returns {Promise<AbuseResult>}
 */
async function detectAbuse(consumerId) {
  if (!consumerId) throw new Error('consumerId is required');

  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

  let breachCount = 0;
  try {
    breachCount = await prisma.rateLimitBreach.count({
      where: {
        consumerId,
        occurredAt: { gte: oneHourAgo },
      },
    });
  } catch (err) {
    console.error(`[rateLimitAnalytics] DB error in detectAbuse(${consumerId}):`, err);
    // Return non-abusive on error to avoid false positives
    return { abusive: false, breachCount: 0 };
  }

  const abusive = breachCount >= ABUSE_BREACH_THRESHOLD;
  if (abusive) {
    _dispatchAbuseAlert(consumerId, breachCount);
  }

  return { abusive, breachCount };
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export default {
  recordRequest,
  checkQuota,
  recordBreach,
  getTimeBucketedStats,
  getTopConsumers,
  detectAbuse,
};
