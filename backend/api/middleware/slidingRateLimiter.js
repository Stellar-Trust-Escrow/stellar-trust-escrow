/**
 * Redis-backed sliding window rate limiter using sorted sets.
 * Stores timestamps in a ZSET per key: ZADD, ZREMRANGEBYSCORE, ZCARD.
 */
import IORedis from 'ioredis';

const redis = new IORedis(
  process.env.REDIS_URL ?? {
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
    maxRetriesPerRequest: null,
  },
);

const makeMember = (now) => `${now}-${Math.random().toString(36).slice(2, 8)}`;

async function record(redisClient, key, windowMs, now = Date.now()) {
  const member = makeMember(now);
  const cutoff = now - windowMs;

  // Use a transaction for ZADD + ZREMRANGEBYSCORE + ZCARD to keep counts accurate
  const pipeline = redisClient.multi();
  pipeline.zadd(key, now, member);
  pipeline.zremrangebyscore(key, 0, cutoff);
  pipeline.zcard(key);
  const results = await pipeline.exec();
  // results is an array of [err, reply] tuples
  const cardReply = results && results[2] ? results[2][1] : null;
  return typeof cardReply === 'string' || typeof cardReply === 'number'
    ? parseInt(cardReply, 10)
    : null;
}

async function count(redisClient, key, windowMs, now = Date.now()) {
  const cutoff = now - windowMs;
  await redisClient.zremrangebyscore(key, 0, cutoff);
  const c = await redisClient.zcard(key);
  return c;
}

async function oldest(redisClient, key) {
  const rows = await redisClient.zrange(key, 0, 0, 'WITHSCORES');
  if (!rows || rows.length < 2) return null;
  const score = parseInt(rows[1], 10);
  return Number.isNaN(score) ? null : score;
}

/**
 * Create an Express middleware that enforces a sliding-window rate limit using Redis.
 */
export function createRedisSlidingWindowRateLimiter({
  windowMs = 60_000,
  max,
  burstMax,
  burstWindowMs = 1_000,
  prefix = 'sliding',
  message = 'Too many requests, please try again later.',
  keyGenerator,
  redisClient = redis,
} = {}) {
  if (typeof max !== 'number') throw new Error('max is required for rate limiter');

  const defaultKeyGen = (req) => {
    if (req.user?.id) return `${prefix}:user:${req.user.id}`;
    if (req.headers['x-user-id']) return `${prefix}:user:${req.headers['x-user-id']}`;
    return `${prefix}:ip:${req.ip || 'unknown'}`;
  };

  const getKey = keyGenerator || defaultKeyGen;

  return async (req, res, next) => {
    try {
      const now = Date.now();
      const key = getKey(req);

      // Burst protection
      if (burstMax !== undefined) {
        const burstKey = `${key}:burst`;
        const burstCount = await count(redisClient, burstKey, burstWindowMs, now);
        if (burstCount >= burstMax) {
          res.set('Retry-After', String(Math.ceil(burstWindowMs / 1000)));
          res.set('X-RateLimit-Limit', String(max));
          res.set('X-RateLimit-Remaining', '0');
          return res
            .status(429)
            .json({ error: message, code: 'RATE_LIMIT_EXCEEDED', reason: 'burst' });
        }
        await record(redisClient, `${key}:burst`, burstWindowMs, now);
      }

      const c = await count(redisClient, key, windowMs, now);

      res.set('X-RateLimit-Limit', String(max));
      res.set('X-RateLimit-Remaining', String(Math.max(0, max - c - 1)));
      res.set('X-RateLimit-Reset', String(Math.ceil((now + windowMs) / 1000)));

      if (c >= max) {
        const oldestTs = await oldest(redisClient, key);
        const retryAfterMs = oldestTs ? oldestTs + windowMs - now : windowMs;
        res.set('Retry-After', String(Math.max(1, Math.ceil(retryAfterMs / 1000))));
        res.set('X-RateLimit-Remaining', '0');
        return res.status(429).json({ error: message, code: 'RATE_LIMIT_EXCEEDED' });
      }

      await record(redisClient, key, windowMs, now);
      return next();
    } catch (err) {
      // On Redis errors, fail open: log and continue to avoid blocking traffic
      console.error('[rateLimiter] Redis error, failing open:', err?.message || err);
      return next();
    }
  };
}

/**
 * Brute-force guard built on the same Redis client and sliding-window machinery.
 * Failed attempts are tracked in a per-identifier sliding window; once the
 * threshold is exceeded the identifier is locked out for a fixed cool-down,
 * independent of the window. Intended for credential endpoints (e.g. the admin
 * API key) where only *failures* should count toward the limit.
 *
 * All Redis operations fail open on error so an outage can't lock out admins.
 */
export function createBruteForceGuard({
  prefix = 'bruteforce',
  maxAttempts = 5,
  windowMs = 15 * 60_000,
  lockMs = 30 * 60_000,
  redisClient = redis,
} = {}) {
  const failKey = (id) => `${prefix}:fail:${id}`;
  const lockKey = (id) => `${prefix}:lock:${id}`;

  return {
    /** Remaining lock time in ms, or 0 if the identifier is not locked. */
    async lockTtl(id) {
      try {
        const ttl = await redisClient.pttl(lockKey(id));
        return ttl > 0 ? ttl : 0;
      } catch {
        return 0;
      }
    },

    /**
     * Records a failed attempt. Once `maxAttempts` failures accumulate inside
     * the window, the identifier is locked for `lockMs` and the failure counter
     * is reset.
     *
     * @returns {Promise<{ failures: number, locked: boolean, lockMs?: number }>}
     */
    async recordFailure(id, now = Date.now()) {
      try {
        const key = failKey(id);
        const count = await record(redisClient, key, windowMs, now);
        if (count !== null && count >= maxAttempts) {
          await redisClient.set(lockKey(id), '1', 'PX', lockMs);
          await redisClient.del(key);
          return { failures: count, locked: true, lockMs };
        }
        return { failures: count ?? 0, locked: false };
      } catch {
        return { failures: 0, locked: false };
      }
    },

    /** Clears failures and any active lock after a successful authentication. */
    async reset(id) {
      try {
        await redisClient.del(failKey(id), lockKey(id));
      } catch {
        // best-effort
      }
    },
  };
}

export default createRedisSlidingWindowRateLimiter;
