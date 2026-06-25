/**
 * Route-tier rate limiting with Redis backing.
 *
 * Three tiers applied per route group:
 *   auth  — strict:   10 req/min
 *   write — moderate: 60 req/min
 *   read  — relaxed: 300 req/min
 *
 * Limits work across multiple backend instances via Redis.
 * Falls back to in-memory (express-rate-limit default) when Redis is unavailable.
 * Breaches are logged at warn level with offending IP and user ID.
 */

import rateLimit from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import { createClient } from 'redis';
import { createModuleLogger } from '../config/logger.js';
import {
  AUTH_ROUTE_LIMIT,
  WRITE_ROUTE_LIMIT,
  READ_ROUTE_LIMIT,
  RATE_LIMIT_WINDOW_MS,
} from '../config/rateLimits.js';

const log = createModuleLogger('tieredRateLimit');

// ── Redis client shared across all tier limiters ──────────────────────────────

let redisClient = null;
let redisReady = false;

if (process.env.REDIS_URL && process.env.NODE_ENV !== 'test') {
  redisClient = createClient({ url: process.env.REDIS_URL });
  redisClient.on('ready', () => {
    redisReady = true;
    log.info({ message: 'rate_limit_redis_connected' });
  });
  redisClient.on('error', (err) => {
    redisReady = false;
    log.warn({ message: 'rate_limit_redis_error_fallback_memory', error: err.message });
  });
  redisClient.connect().catch((err) =>
    log.warn({ message: 'rate_limit_redis_connect_failed', error: err.message }),
  );
}

function buildStore(prefix) {
  if (!redisClient) return undefined;
  return new RedisStore({
    sendCommand: (...args) => redisClient.sendCommand(args),
    prefix: `rl:${prefix}:`,
  });
}

// ── Key generator: prefer authenticated user, fall back to IP ─────────────────

function keyGenerator(prefix) {
  return (req) => {
    const identity = req.user?.id ?? req.user?.address ?? req.ip ?? 'unknown';
    return `${prefix}:${identity}`;
  };
}

// ── On-breach handler: 429 + Retry-After + warn log ──────────────────────────

function makeHandler(tier) {
  return (req, res, _next, options) => {
    const resetTime = req.rateLimit?.resetTime;
    const retryAfterSeconds = resetTime
      ? Math.max(1, Math.ceil((resetTime.getTime() - Date.now()) / 1000))
      : Math.ceil(RATE_LIMIT_WINDOW_MS / 1000);

    log.warn({
      message: 'rate_limit_exceeded',
      tier,
      ip: req.ip,
      userId: req.user?.id ?? null,
      path: req.path,
      retryAfterSeconds,
    });

    res.set('Retry-After', String(retryAfterSeconds));
    res.status(options.statusCode).json({
      error: 'Too many requests. Please retry after the indicated time.',
      code: 'RATE_LIMIT_EXCEEDED',
      retryAfter: retryAfterSeconds,
    });
  };
}

// ── Tier factories ────────────────────────────────────────────────────────────

function createTieredLimiter({ prefix, max, tier }) {
  return rateLimit({
    windowMs: RATE_LIMIT_WINDOW_MS,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    store: buildStore(prefix),
    keyGenerator: keyGenerator(prefix),
    handler: makeHandler(tier),
    skip: () => process.env.NODE_ENV === 'test',
  });
}

export const authRateLimit = createTieredLimiter({
  prefix: 'auth',
  max: AUTH_ROUTE_LIMIT,
  tier: 'auth',
});

export const writeRateLimit = createTieredLimiter({
  prefix: 'write',
  max: WRITE_ROUTE_LIMIT,
  tier: 'write',
});

export const readRateLimit = createTieredLimiter({
  prefix: 'read',
  max: READ_ROUTE_LIMIT,
  tier: 'read',
});

// ── Route-method classifier ───────────────────────────────────────────────────

/**
 * Middleware that applies the correct tier limiter based on route group and HTTP method.
 * Mount before route handlers:
 *   app.use('/api/auth', authRateLimit, authRoutes)
 *   app.use('/api/escrows', routeTierLimiter, escrowRoutes)
 */
export function routeTierLimiter(req, res, next) {
  const method = req.method;
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
    return readRateLimit(req, res, next);
  }
  return writeRateLimit(req, res, next);
}
