/**
 * Cache Service — Redis with in-memory fallback
 *
 * Exposes the same interface as the original lib/cache.js so all existing
 * controllers work without modification. Adds analytics and cache warming.
 *
 * Redis is optional: if REDIS_URL is unset or the connection fails the service
 * transparently falls back to the in-memory store.
 */

import { createClient } from 'redis';

// ── Analytics counters ────────────────────────────────────────────────────────

const stats = { hits: 0, misses: 0, sets: 0, invalidations: 0 };

// ── In-memory fallback ────────────────────────────────────────────────────────

const memStore = new Map();

const mem = {
  get(key) {
    const entry = memStore.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) { memStore.delete(key); return null; }
    return entry.value;
  },
  set(key, value, ttlSeconds) {
    memStore.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
  },
  del(key) { memStore.delete(key); },
  keys() { return [...memStore.keys()]; },
  size() { return memStore.size; },
};

// ── Redis client ──────────────────────────────────────────────────────────────

let redis = null;
let redisReady = false;

if (process.env.REDIS_URL) {
  redis = createClient({ url: process.env.REDIS_URL });
  redis.on('ready', () => { redisReady = true; console.log('[Cache] Redis connected'); });
  redis.on('error', (err) => { redisReady = false; console.warn('[Cache] Redis error — using memory fallback:', err.message); });
  redis.connect().catch((err) => console.warn('[Cache] Redis connect failed:', err.message));
}

// ── Public API ────────────────────────────────────────────────────────────────

async function get(key) {
  if (redisReady) {
    const raw = await redis.get(key).catch(() => null);
    if (raw !== null) { stats.hits++; return JSON.parse(raw); }
  } else {
    const val = mem.get(key);
    if (val !== null) { stats.hits++; return val; }
  }
  stats.misses++;
  return null;
}

async function set(key, value, ttlSeconds = 60) {
  stats.sets++;
  if (redisReady) {
    await redis.set(key, JSON.stringify(value), { EX: ttlSeconds }).catch(() => {
      mem.set(key, value, ttlSeconds); // write-through to memory on Redis failure
    });
  } else {
    mem.set(key, value, ttlSeconds);
  }
}

async function invalidate(key) {
  stats.invalidations++;
  if (redisReady) await redis.del(key).catch(() => null);
  mem.del(key);
}

async function invalidatePrefix(prefix) {
  stats.invalidations++;
  if (redisReady) {
    const keys = await redis.keys(`${prefix}*`).catch(() => []);
    if (keys.length) await redis.del(keys).catch(() => null);
  }
  for (const key of mem.keys()) {
    if (key.startsWith(prefix)) mem.del(key);
  }
}

/** Warm the cache by calling a loader function if the key is cold. */
async function warm(key, loader, ttlSeconds = 60) {
  const existing = await get(key);
  if (existing !== null) return existing;
  const value = await loader();
  await set(key, value, ttlSeconds);
  return value;
}

/** Returns hit rate and counters for the /health endpoint. */
function analytics() {
  const total = stats.hits + stats.misses;
  return {
    ...stats,
    hitRate: total > 0 ? (stats.hits / total).toFixed(4) : '0',
    backend: redisReady ? 'redis' : 'memory',
    memSize: mem.size(),
  };
}

function size() {
  return redisReady ? null : mem.size(); // Redis size not cheaply available
}

export default { get, set, invalidate, invalidatePrefix, warm, analytics, size };
