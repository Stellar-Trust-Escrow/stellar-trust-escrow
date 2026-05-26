/**
 * Public-route rate limiting: IP-based (100 req/min) + wallet-based (50 req/min).
 *
 * Counters are stored in Redis (INCR + EXPIRE) so they persist across restarts
 * and work correctly in multi-process deployments. Falls back to in-memory
 * Map when Redis is unavailable.
 *
 * Whitelisted IPs (localhost + internal services) bypass all limits.
 */

import Redis from 'ioredis';

// ── Config ────────────────────────────────────────────────────────────────────

const WINDOW_MS = parseInt(process.env.PUBLIC_RATE_LIMIT_WINDOW_MS || '60000', 10);
const WINDOW_SECS = Math.ceil(WINDOW_MS / 1000);

// Read limits lazily so tests can override via process.env per-case
function getIpMax() { return parseInt(process.env.PUBLIC_RATE_LIMIT_IP_MAX || '100', 10); }
function getWalletMax() { return parseInt(process.env.PUBLIC_RATE_LIMIT_WALLET_MAX || '50', 10); }

// Whitelisted IPs — bypass all rate limiting
// Read lazily so tests can set RATE_LIMIT_WHITELIST_IPS before each case
const STATIC_WHITELIST = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

function isWhitelisted(ip) {
  if (STATIC_WHITELIST.has(ip)) return true;
  const extra = process.env.RATE_LIMIT_WHITELIST_IPS?.split(',').map((s) => s.trim()).filter(Boolean) ?? [];
  return extra.includes(ip);
}

// ── Redis client (shared, lazy-connected) ─────────────────────────────────────

let redis = null;

function getRedis() {
  if (redis) return redis;
  const url = process.env.REDIS_URL;
  if (!url) return null;
  redis = new Redis(url, { lazyConnect: true, enableOfflineQueue: false });
  redis.on('error', (err) => {
    // Log but don't crash — fallback to in-memory
    console.warn('[publicRateLimit] Redis error, falling back to in-memory:', err.message);
    redis = null;
  });
  return redis;
}

// ── In-memory fallback store ──────────────────────────────────────────────────

const memStore = new Map(); // key → { count, resetAt }

/** Reset all in-memory counters — for use in tests only. */
export function _resetMemStore() { memStore.clear(); }

function memIncr(key) {
  const now = Date.now();
  let entry = memStore.get(key);
  if (!entry || now >= entry.resetAt) {
    entry = { count: 0, resetAt: now + WINDOW_MS };
    memStore.set(key, entry);
  }
  entry.count += 1;
  return { count: entry.count, resetAt: entry.resetAt };
}

// ── Redis counter ─────────────────────────────────────────────────────────────

async function redisIncr(key) {
  const client = getRedis();
  if (!client) return null;
  try {
    const count = await client.incr(key);
    if (count === 1) await client.expire(key, WINDOW_SECS);
    const ttl = await client.ttl(key);
    const resetAt = Date.now() + ttl * 1000;
    return { count, resetAt };
  } catch {
    return null; // fall through to in-memory
  }
}

async function increment(key) {
  const result = await redisIncr(key);
  return result ?? memIncr(key);
}

// ── Stellar address detector ──────────────────────────────────────────────────

// Stellar addresses are 56-char base32 strings starting with G
const STELLAR_ADDR_RE = /^G[A-Z2-7]{55}$/;

function extractWalletAddress(req) {
  const candidates = [
    req.headers['x-wallet-address'],
    req.headers['x-user-address'],
    req.query?.address,
    req.body?.address,
    // Extract from URL path segments (params not yet populated in middleware)
    ...req.path.split('/').filter((s) => STELLAR_ADDR_RE.test(s)),
  ];
  for (const c of candidates) {
    if (typeof c === 'string' && STELLAR_ADDR_RE.test(c)) return c;
  }
  return null;
}

// ── 429 response helper ───────────────────────────────────────────────────────

function tooManyRequests(res, max, resetAt) {
  const retryAfter = Math.max(1, Math.ceil((resetAt - Date.now()) / 1000));
  res
    .set('Retry-After', String(retryAfter))
    .set('X-RateLimit-Limit', String(max))
    .set('X-RateLimit-Remaining', '0')
    .set('X-RateLimit-Reset', String(Math.ceil(resetAt / 1000)))
    .status(429)
    .json({ error: 'Too many requests, please try again later.', code: 'RATE_LIMIT_EXCEEDED' });
}

// ── Middleware ────────────────────────────────────────────────────────────────

export async function publicRateLimit(req, res, next) {
  // In test environments, allow IP injection via header to work around Express 5's read-only req.ip
  const ip = (process.env.NODE_ENV === 'test' && req.headers['x-test-ip']) || req.ip || 'unknown';

  // Whitelisted IPs bypass all limits
  if (isWhitelisted(ip)) return next();

  // ── IP limit ──────────────────────────────────────────────────────────────
  const IP_MAX = getIpMax();
  const ipResult = await increment(`rl:ip:${ip}`);
  res.set('X-RateLimit-Limit', String(IP_MAX));
  res.set('X-RateLimit-Remaining', String(Math.max(0, IP_MAX - ipResult.count)));
  res.set('X-RateLimit-Reset', String(Math.ceil(ipResult.resetAt / 1000)));

  if (ipResult.count > IP_MAX) {
    return tooManyRequests(res, IP_MAX, ipResult.resetAt);
  }

  // ── Wallet limit — only when a Stellar address is present ─────────────────
  const wallet = extractWalletAddress(req);
  if (wallet) {
    const WALLET_MAX = getWalletMax();
    const walletResult = await increment(`rl:wallet:${wallet}`);
    res.set('X-RateLimit-Limit', String(WALLET_MAX));
    res.set('X-RateLimit-Remaining', String(Math.max(0, WALLET_MAX - walletResult.count)));
    res.set('X-RateLimit-Reset', String(Math.ceil(walletResult.resetAt / 1000)));

    if (walletResult.count > WALLET_MAX) {
      return tooManyRequests(res, WALLET_MAX, walletResult.resetAt);
    }
  }

  next();
}
