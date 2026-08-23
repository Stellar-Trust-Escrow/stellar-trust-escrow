/**
 * Three-Tier CacheManager
 *
 * Unified caching interface with:
 *  - L1: In-process LRU cache (fastest, no network RTT)
 *  - L2: Redis cache (shared across instances, configurable TTL)
 *  - L3: Prisma database fallback (loader function called on full miss)
 *
 * Key namespace: {resource_type}:{id} — e.g. escrow:abc123, tenant:t1
 * Metrics: cache_hits_total{tier=l1|l2|l3}, cache_misses_total{tier=l1|l2|l3}
 * Per-resource invalidation via invalidate() and invalidatePattern().
 */

import { LRUCache } from 'lru-cache';
import { createClient } from 'redis';
import { createModuleLogger } from '../config/logger.js';
import { scopeCacheKey, scopeCacheTag } from './tenantContext.js';
import {
  cacheHitsTotal,
  cacheMissesTotal,
  cacheSize,
} from './metrics.js';

const log = createModuleLogger('cacheManager');

// ── Default configuration ──────────────────────────────────────────────────────

const DEFAULT_CONFIG = {
  l1: {
    maxSize: parseInt(process.env.CACHE_L1_MAX_SIZE || '1000', 10),
    ttl: parseInt(process.env.CACHE_L1_TTL_MS || '5000', 10), // 5s default
  },
  l2: {
    ttl: parseInt(process.env.CACHE_L2_TTL_SECONDS || '60', 10), // 60s default
    resourceTTLs: {
      escrow: parseInt(process.env.CACHE_TTL_ESCROW || '120', 10),
      tenant: parseInt(process.env.CACHE_TTL_TENANT || '300', 10),
      user: parseInt(process.env.CACHE_TTL_USER || '60', 10),
      reputation: parseInt(process.env.CACHE_TTL_REPUTATION || '60', 10),
      leaderboard: parseInt(process.env.CACHE_TTL_LEADERBOARD || '300', 10),
      event: parseInt(process.env.CACHE_TTL_EVENT || '15', 10),
      milestone: parseInt(process.env.CACHE_TTL_MILESTONE || '120', 10),
      dispute: parseInt(process.env.CACHE_TTL_DISPUTE || '120', 10),
      payment: parseInt(process.env.CACHE_TTL_PAYMENT || '60', 10),
    },
  },
};

// ── CacheManager Class ─────────────────────────────────────────────────────────

export class CacheManager {
  #l1;
  #redis = null;
  #redisReady = false;
  #config;
  #stats;
  #memTags;

  constructor(config = {}) {
    this.#config = {
      l1: { ...DEFAULT_CONFIG.l1, ...config.l1 },
      l2: { ...DEFAULT_CONFIG.l2, ...config.l2 },
    };

    // ── L1: In-process LRU ────────────────────────────────────────────────────
    this.#l1 = new LRUCache({
      max: this.#config.l1.maxSize,
      ttl: this.#config.l1.ttl,
    });

    // ── L2: Redis ─────────────────────────────────────────────────────────────
    if (process.env.REDIS_URL) {
      this.#redis = createClient({ url: process.env.REDIS_URL });
      this.#redis.on('ready', () => {
        this.#redisReady = true;
        log.info({ message: 'l2_redis_connected' });
      });
      this.#redis.on('error', (err) => {
        this.#redisReady = false;
        log.warn({ message: 'l2_redis_error_fallback', error: err.message });
      });
      this.#redis.connect().catch((err) =>
        log.warn({ message: 'l2_redis_connect_failed', error: err.message }),
      );
    }

    // ── Metrics ───────────────────────────────────────────────────────────────
    this.#stats = {
      l1: { hits: 0, misses: 0 },
      l2: { hits: 0, misses: 0 },
      l3: { hits: 0, misses: 0 },
      sets: 0,
      invalidations: 0,
    };

    // ── Tag index (fallback when Redis unavailable) ───────────────────────────
    this.#memTags = new Map();
  }

  // ── L2 Redis tag helpers ─────────────────────────────────────────────────────

  #redisTagKey(tag) {
    return `tag:${tag}`;
  }

  async #redisTagAdd(tag, key, ttlSeconds) {
    if (!this.#redisReady) return;
    const tKey = this.#redisTagKey(tag);
    await this.#redis.sAdd(tKey, key).catch(() => null);
    await this.#redis.expire(tKey, ttlSeconds + 60).catch(() => null);
  }

  async #redisTagKeys(tag) {
    if (!this.#redisReady) return [];
    return this.#redis.sMembers(this.#redisTagKey(tag)).catch(() => []);
  }

  async #redisTagDel(tag) {
    if (!this.#redisReady) return;
    return this.#redis.del(this.#redisTagKey(tag)).catch(() => null);
  }

  // ── Internal tag helpers (memory fallback) ──────────────────────────────────

  #memTagAdd(tag, key) {
    if (!this.#memTags.has(tag)) this.#memTags.set(tag, new Set());
    this.#memTags.get(tag).add(key);
  }

  #memTagKeys(tag) {
    return [...(this.#memTags.get(tag) ?? [])];
  }

  #memTagDel(tag) {
    this.#memTags.delete(tag);
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  #getResourceType(key) {
    const parts = key.split(':');
    return parts.length >= 2 ? parts[0] : 'default';
  }

  #getL2TTL(ttlOption, resourceType) {
    if (ttlOption !== undefined) return ttlOption;
    return this.#config.l2.resourceTTLs[resourceType] ?? this.#config.l2.ttl;
  }

  async #publishMetrics(tier, isHit) {
    const keyPrefix = tier;
    try {
      if (isHit) {
        cacheHitsTotal.inc({ key_prefix: keyPrefix });
      } else {
        cacheMissesTotal.inc({ key_prefix: keyPrefix });
      }
    } catch {
      // Metrics registry may not be available in tests
    }
  }

  // ── Core API ────────────────────────────────────────────────────────────────

  /**
   * Get a value from the three-tier cache with automatic fallback.
   *
   * @template T
   * @param {string} key - Cache key (e.g. "escrow:abc123")
   * @param {() => Promise<T>} [loader] - L3 loader: called only on L1+L2 miss
   * @param {Object} [options]
   * @param {number} [options.ttl] - Override TTL for L2 (seconds)
   * @param {boolean} [options.skipL1] - Skip L1 (read-through only)
   * @param {string[]} [options.tags] - Tags for this entry
   * @returns {Promise<T|null>}
   */
  async get(key, loader, options = {}) {
    const scopedKey = scopeCacheKey(key);
    const resourceType = this.#getResourceType(key);

    // ── L1 check ──────────────────────────────────────────────────────────────
    if (!options.skipL1) {
      const l1Value = this.#l1.get(scopedKey);
      if (l1Value !== undefined) {
        this.#stats.l1.hits++;
        await this.#publishMetrics('l1', true);
        return l1Value;
      }
      this.#stats.l1.misses++;
      await this.#publishMetrics('l1', false);
    }

    // ── L2 check (Redis) ─────────────────────────────────────────────────────
    if (this.#redisReady) {
      try {
        const raw = await this.#redis.get(scopedKey);
        if (raw !== null) {
          const value = JSON.parse(raw);
          this.#stats.l2.hits++;
          await this.#publishMetrics('l2', true);

          // Promote to L1
          if (!options.skipL1) {
            this.#l1.set(scopedKey, value);
          }
          return value;
        }
      } catch (err) {
        log.warn({ message: 'l2_get_error', key: scopedKey, error: err.message });
      }
    }
    this.#stats.l2.misses++;
    await this.#publishMetrics('l2', false);

    // ── L3: Loader (Prisma fallback) ──────────────────────────────────────────
    if (typeof loader === 'function') {
      try {
        const value = await loader();
        if (value !== undefined && value !== null) {
          this.#stats.l3.hits++;
          await this.#publishMetrics('l3', true);

          // Write back to L2 and L1 (always populate L1 on read-through)
          await this.set(scopedKey, value, { ttl: options.ttl, tags: options.tags });
          return value;
        }
      } catch (err) {
        log.warn({ message: 'l3_loader_error', key: scopedKey, error: err.message });
      }
    }

    this.#stats.l3.misses++;
    await this.#publishMetrics('l3', false);
    return null;
  }

  /**
   * Set a value in L1 and L2.
   *
   * @param {string} key
   * @param {*} value
   * @param {Object} [options]
   * @param {number} [options.ttl] - TTL in seconds for L2 (default: per-resource or 60s)
   * @param {string[]} [options.tags] - Invalidation tags
   * @param {boolean} [options.skipL1] - Don't write to L1
   */
  async set(key, value, options = {}) {
    const scopedKey = scopeCacheKey(key);
    const resourceType = this.#getResourceType(key);
    const ttlSeconds = this.#getL2TTL(options.ttl, resourceType);
    const tags = (options.tags ?? []).map((t) => scopeCacheTag(t));

    this.#stats.sets++;

    // ── L1 write ──────────────────────────────────────────────────────────────
    if (!options.skipL1) {
      this.#l1.set(scopedKey, value);
      try { cacheSize.set(this.#l1.size); } catch { /* metrics unavailable */ }
    }

    // ── L2 write (Redis) ──────────────────────────────────────────────────────
    if (this.#redisReady) {
      try {
        await this.#redis.set(scopedKey, JSON.stringify(value), { EX: ttlSeconds });
      } catch (err) {
        log.warn({ message: 'l2_set_error', key: scopedKey, error: err.message });
      }
    }

    // ── Tag association ───────────────────────────────────────────────────────
    for (const tag of tags) {
      if (this.#redisReady) {
        await this.#redisTagAdd(tag, scopedKey, ttlSeconds);
      } else {
        this.#memTagAdd(tag, scopedKey);
      }
    }
  }

  /**
   * Set with tags — backward-compatible with cacheService API.
   */
  async setWithTags(key, value, ttlSeconds = 60, tags = []) {
    return this.set(key, value, { ttl: ttlSeconds, tags });
  }

  /**
   * Invalidate a single cache key from L1 and L2.
   *
   * @param {string} key
   */
  async invalidate(key) {
    const scopedKey = scopeCacheKey(key);
    this.#stats.invalidations++;

    this.#l1.delete(scopedKey);

    if (this.#redisReady) {
      await this.#redis.del(scopedKey).catch(() => null);
    }
  }

  /**
   * Invalidate all keys matching a pattern.
   *
   * @param {string} prefix - Key prefix to match (e.g. "escrow:", "tenant:acme:")
   */
  async invalidatePattern(prefix) {
    const scopedPrefix = scopeCacheKey(prefix);
    this.#stats.invalidations++;

    // L2: cursor-based SCAN
    if (this.#redisReady) {
      let cursor = 0;
      do {
        const result = await this.#redis
          .scan(cursor, { MATCH: `${scopedPrefix}*`, COUNT: 100 })
          .catch(() => ({ cursor: 0, keys: [] }));
        cursor = result.cursor;
        if (result.keys.length) {
          await this.#redis.del(result.keys).catch(() => null);
        }
      } while (cursor !== 0);
    }

    // L1: iterate
    for (const key of this.#l1.keys()) {
      if (key.startsWith(scopedPrefix)) {
        this.#l1.delete(key);
      }
    }
  }

  /**
   * Invalidate all cache entries associated with a tag.
   *
   * @param {string} tag
   */
  async invalidateTag(tag) {
    const scopedTag = scopeCacheTag(tag);
    this.#stats.invalidations++;

    if (this.#redisReady) {
      const keys = await this.#redisTagKeys(scopedTag);
      if (keys.length) {
        await this.#redis.del(keys).catch(() => null);
      }
      await this.#redisTagDel(scopedTag);
    } else {
      for (const key of this.#memTagKeys(scopedTag)) {
        this.#l1.delete(key);
      }
      this.#memTagDel(scopedTag);
    }
  }

  /**
   * Invalidate all cache entries for multiple tags at once.
   *
   * @param {string[]} tags
   */
  async invalidateTags(tags) {
    await Promise.all(tags.map((t) => this.invalidateTag(t)));
  }

  /**
   * Invalidate using prefix (backward-compatible alias for invalidatePattern).
   *
   * @param {string} prefix
   */
  async invalidatePrefix(prefix) {
    return this.invalidatePattern(prefix);
  }

  /**
   * Flush all cached entries for a tenant.
   *
   * @param {string} slug - Tenant slug (e.g. "acme")
   */
  async flushTenant(slug) {
    const prefix = `tenant:${slug}:`;

    if (this.#redisReady) {
      let cursor = 0;
      do {
        const result = await this.#redis
          .scan(cursor, { MATCH: `${prefix}*`, COUNT: 100 })
          .catch(() => ({ cursor: 0, keys: [] }));
        cursor = result.cursor;
        if (result.keys.length) {
          await this.#redis.del(result.keys).catch(() => null);
        }
      } while (cursor !== 0);
    }

    for (const key of this.#l1.keys()) {
      if (key.startsWith(prefix)) {
        this.#l1.delete(key);
      }
    }
  }

  /**
   * Warm the cache by calling a loader if the key is cold.
   *
   * @template T
   * @param {string} key
   * @param {() => Promise<T>} loader
   * @param {number} [ttlSeconds]
   * @returns {Promise<T>}
   */
  async warm(key, loader, ttlSeconds = 60) {
    const existing = await this.get(key);
    if (existing !== null) return existing;
    const value = await loader();
    await this.set(key, value, { ttl: ttlSeconds });
    return value;
  }

  /**
   * Returns hit rate and counters for the /health endpoint.
   */
  analytics() {
    const l1Total = this.#stats.l1.hits + this.#stats.l1.misses;
    const l2Total = this.#stats.l2.hits + this.#stats.l2.misses;
    const l3Total = this.#stats.l3.hits + this.#stats.l3.misses;
    const total = l1Total + l2Total + l3Total;

    return {
      l1: { ...this.#stats.l1 },
      l2: { ...this.#stats.l2 },
      l3: { ...this.#stats.l3 },
      sets: this.#stats.sets,
      invalidations: this.#stats.invalidations,
      hitRate: total > 0
        ? ((this.#stats.l1.hits + this.#stats.l2.hits) / total).toFixed(4)
        : '0',
      backend: this.#redisReady ? 'redis' : 'memory',
      l1Size: this.#l1.size,
    };
  }

  /**
   * Returns L1 size (in-memory entries count).
   */
  size() {
    return this.#l1.size;
  }

  /**
   * Returns whether Redis (L2) is connected.
   */
  isRedisReady() {
    return this.#redisReady;
  }
}

// ── Singleton ──────────────────────────────────────────────────────────────────

export const cacheManager = new CacheManager();

export default cacheManager;
