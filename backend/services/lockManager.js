/**
 * Distributed Lock Manager — Redis-backed (ioredis)
 *
 * Provides mutual exclusion across multiple indexer processes using
 * the SET NX PX pattern. Supports auto-renewal to extend locks when
 * work runs longer than the initial TTL.
 *
 * Usage:
 *   const lock = await LockManager.acquire('escrow_verifying_lock', 300_000);
 *   if (!lock) { log.info('lock held by another process'); return; }
 *   try { await doWork(); } finally { await lock.release(); }
 */

import Redis from 'ioredis';
import { createModuleLogger } from '../config/logger.js';

const log = createModuleLogger('lockManager');

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const RENEWAL_INTERVAL = 0.5; // renew at 50% of TTL remaining

let _redis = null;

function getRedis() {
  if (!_redis) {
    _redis = new Redis(REDIS_URL, { lazyConnect: true, enableReadyCheck: false });
    _redis.on('error', (err) => log.warn({ message: 'redis_error', error: err.message }));
  }
  return _redis;
}

// Lua script: release only if we own the lock (atomic compare-and-delete)
const RELEASE_SCRIPT = `
  if redis.call("get", KEYS[1]) == ARGV[1] then
    return redis.call("del", KEYS[1])
  else
    return 0
  end
`;

// Lua script: extend TTL only if we still own the lock
const RENEW_SCRIPT = `
  if redis.call("get", KEYS[1]) == ARGV[1] then
    return redis.call("pexpire", KEYS[1], ARGV[2])
  else
    return 0
  end
`;

class Lock {
  #key;
  #token;
  #ttlMs;
  #renewTimer = null;

  constructor(key, token, ttlMs) {
    this.#key = key;
    this.#token = token;
    this.#ttlMs = ttlMs;
  }

  /** Start auto-renewal at 50% of TTL. */
  startRenewal() {
    const interval = Math.floor(this.#ttlMs * RENEWAL_INTERVAL);
    this.#renewTimer = setInterval(() => this.#renew(), interval);
    // Don't block process exit
    if (this.#renewTimer.unref) this.#renewTimer.unref();
    return this;
  }

  async #renew() {
    try {
      const result = await getRedis().eval(
        RENEW_SCRIPT,
        1,
        this.#key,
        this.#token,
        String(this.#ttlMs),
      );
      if (result === 0) {
        log.warn({ message: 'lock_renewal_failed_not_owner', key: this.#key });
        this.#stopRenewal();
      } else {
        log.debug({ message: 'lock_renewed', key: this.#key, ttlMs: this.#ttlMs });
      }
    } catch (err) {
      log.warn({ message: 'lock_renewal_error', key: this.#key, error: err.message });
    }
  }

  #stopRenewal() {
    if (this.#renewTimer) {
      clearInterval(this.#renewTimer);
      this.#renewTimer = null;
    }
  }

  /** Release the lock. Safe to call multiple times. */
  async release() {
    this.#stopRenewal();
    try {
      const result = await getRedis().eval(RELEASE_SCRIPT, 1, this.#key, this.#token);
      log.debug({
        message: result ? 'lock_released' : 'lock_release_skipped_not_owner',
        key: this.#key,
      });
    } catch (err) {
      log.warn({ message: 'lock_release_error', key: this.#key, error: err.message });
    }
  }
}

const LockManager = {
  /**
   * Try to acquire a distributed lock.
   *
   * @param {string} key     — lock name, e.g. 'escrow_verifying_lock'
   * @param {number} ttlMs   — lock TTL in milliseconds (default 5 min)
   * @param {object} [opts]
   * @param {boolean} [opts.autoRenew=true] — extend lock while held
   * @returns {Promise<Lock|null>} Lock instance on success, null if already held
   */
  async acquire(key, ttlMs = 300_000, { autoRenew = true } = {}) {
    const token = `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    try {
      const result = await getRedis().set(key, token, 'PX', ttlMs, 'NX');
      if (result !== 'OK') {
        log.info({ message: 'lock_not_acquired', key });
        return null;
      }
      log.info({ message: 'lock_acquired', key, ttlMs });
      const lock = new Lock(key, token, ttlMs);
      return autoRenew ? lock.startRenewal() : lock;
    } catch (err) {
      log.warn({ message: 'lock_acquire_error', key, error: err.message });
      return null;
    }
  },

  /** Disconnect the shared Redis client (call on graceful shutdown). */
  async disconnect() {
    if (_redis) {
      await _redis.quit().catch(() => null);
      _redis = null;
    }
  },
};

export default LockManager;
export { Lock };
