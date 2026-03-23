/**
 * In-memory TTL cache
 *
 * Lightweight cache for hot read endpoints (leaderboard, reputation, escrow lists).
 * Falls back gracefully — a cache miss just hits the DB.
 *
 * Usage:
 *   cache.set('key', value, ttlSeconds)
 *   cache.get('key')          // returns value or null
 *   cache.invalidate('key')
 *   cache.invalidatePrefix('escrow:')
 */

const store = new Map();

/**
 * @param {string} key
 * @param {*} value
 * @param {number} ttlSeconds  default 60 s
 */
function set(key, value, ttlSeconds = 60) {
  store.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
}

/** @returns {*|null} */
function get(key) {
  const entry = store.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    store.delete(key);
    return null;
  }
  return entry.value;
}

function invalidate(key) {
  store.delete(key);
}

function invalidatePrefix(prefix) {
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) store.delete(key);
  }
}

/** Expose cache size for health/metrics endpoint */
function size() {
  return store.size;
}

export default { set, get, invalidate, invalidatePrefix, size };
