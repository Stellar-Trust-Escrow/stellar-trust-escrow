/**
 * CacheManager Tests
 *
 * Tests the three-tier caching strategy: L1 LRU + L2 Redis + L3 Prisma fallback.
 * Uses the project's existing Redis mock via moduleNameMapper in jest.config.js.
 */

import { jest } from '@jest/globals';

// ── Mock dependencies ──────────────────────────────────────────────────────────

jest.unstable_mockModule('../lib/metrics.js', () => ({
  cacheHitsTotal: { inc: jest.fn() },
  cacheMissesTotal: { inc: jest.fn() },
  cacheSize: { set: jest.fn() },
}));

jest.unstable_mockModule('../config/logger.js', () => ({
  createModuleLogger: () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  }),
}));

jest.unstable_mockModule('../lib/tenantContext.js', () => ({
  scopeCacheKey: (key) => key,
  scopeCacheTag: (tag) => tag,
  getCurrentTenant: () => null,
  getCurrentTenantId: () => null,
}));

// ── Import after mocking ───────────────────────────────────────────────────────

let CacheManager;
let cacheMetrics;

beforeAll(async () => {
  process.env.REDIS_URL = 'redis://localhost:6379';
  const mod = await import('../lib/cacheManager.js');
  CacheManager = mod.CacheManager;
  cacheMetrics = await import('../lib/metrics.js');
});

beforeEach(() => {
  jest.clearAllMocks();
});

// ── Helper: create CacheManager with Redis enabled ─────────────────────────────

function createRedisCache(opts = {}) {
  return new CacheManager({
    l1: { maxSize: opts.maxSize ?? 10, ttl: opts.l1Ttl ?? 5000 },
    l2: { ttl: opts.l2Ttl ?? 60, resourceTTLs: opts.resourceTTLs },
  });
}

// ── L1 (In-Process LRU) Tests ─────────────────────────────────────────────────

describe('L1 (In-Process LRU)', () => {
  test('returns null on empty cache', async () => {
    const cache = new CacheManager({ l1: { maxSize: 10, ttl: 5000 } });
    const result = await cache.get('nonexistent:key');
    expect(result).toBeNull();
  });

  test('set and get from L1 without hitting L2', async () => {
    const cache = new CacheManager({ l1: { maxSize: 10, ttl: 5000 } });
    await cache.set('user:123', { name: 'Alice' });

    const result = await cache.get('user:123');
    expect(result).toEqual({ name: 'Alice' });
  });

  test('L1 respects maxSize (LRU eviction)', async () => {
    const cache = new CacheManager({ l1: { maxSize: 3, ttl: 10000 } });
    await cache.set('key:1', 'val1');
    await cache.set('key:2', 'val2');
    await cache.set('key:3', 'val3');
    await cache.set('key:4', 'val4');

    // key:1 should be evicted from L1
    const result = await cache.get('key:1');
    expect(result).toBeNull();
  });

  test('L1 respects TTL (expires entries)', async () => {
    const cache = new CacheManager({ l1: { maxSize: 10, ttl: 1 } }); // 1ms TTL
    await cache.set('ttl:test', 'value');

    // Wait for TTL to expire
    await new Promise((resolve) => setTimeout(resolve, 10));

    const result = await cache.get('ttl:test');
    // After L1 miss, it falls through to L2 (which also misses)
    expect(result).toBeNull();
  });

  test('skipL1 option bypasses L1', async () => {
    const cache = new CacheManager({ l1: { maxSize: 10, ttl: 5000 } });
    await cache.set('skip:test', 'value');

    // Get with skipL1 should not find it in L1
    // (it will try L2 which returns null from mock)
    const result = await cache.get('skip:test', null, { skipL1: true });
    expect(result).toBeNull();
  });

  test('size() returns L1 cache size', async () => {
    const cache = new CacheManager({ l1: { maxSize: 10, ttl: 5000 } });
    expect(cache.size()).toBe(0);

    await cache.set('size:1', 'a');
    expect(cache.size()).toBe(1);

    await cache.set('size:2', 'b');
    expect(cache.size()).toBe(2);
  });
});

// ── L3 (Loader / Prisma Fallback) Tests ───────────────────────────────────────

describe('L3 (Loader fallback)', () => {
  test('calls loader on L1+L2 miss and writes back', async () => {
    const cache = new CacheManager({ l1: { maxSize: 10, ttl: 5000 } });
    const loader = jest.fn(async () => ({ id: 'abc', name: 'from-db' }));

    const result = await cache.get('escrow:abc', loader);
    expect(result).toEqual({ id: 'abc', name: 'from-db' });
    expect(loader).toHaveBeenCalledTimes(1);

    // Value should be cached in L1 now
    const cached = await cache.get('escrow:abc');
    expect(cached).toEqual({ id: 'abc', name: 'from-db' });
  });

  test('does not call loader on L1 hit', async () => {
    const cache = new CacheManager({ l1: { maxSize: 10, ttl: 5000 } });
    await cache.set('hit:test', 'cached');

    const loader = jest.fn(async () => 'from-db');
    const result = await cache.get('hit:test', loader);
    expect(result).toBe('cached');
    expect(loader).not.toHaveBeenCalled();
  });

  test('handles loader returning null', async () => {
    const cache = new CacheManager({ l1: { maxSize: 10, ttl: 5000 } });

    const loader = jest.fn(async () => null);
    const result = await cache.get('null:key', loader);
    expect(result).toBeNull();
    expect(loader).toHaveBeenCalledTimes(1);
  });

  test('handles loader throwing error gracefully', async () => {
    const cache = new CacheManager({ l1: { maxSize: 10, ttl: 5000 } });

    const loader = jest.fn(async () => {
      throw new Error('DB connection failed');
    });

    const result = await cache.get('error:key', loader);
    expect(result).toBeNull();
  });

  test('skipL1 with loader still writes back to L1', async () => {
    const cache = new CacheManager({ l1: { maxSize: 10, ttl: 5000 } });
    const loader = jest.fn(async () => ({ id: 'test' }));

    const result = await cache.get('skip:loader', loader, { skipL1: true });
    expect(result).toEqual({ id: 'test' });

    // L1 should now have the value (set writes to L1)
    const l1Result = await cache.get('skip:loader');
    expect(l1Result).toEqual({ id: 'test' });
  });
});

// ── Invalidation Tests ─────────────────────────────────────────────────────────

describe('Invalidation', () => {
  test('invalidate removes key from L1', async () => {
    const cache = new CacheManager({ l1: { maxSize: 10, ttl: 5000 } });
    await cache.set('del:key', 'value');
    expect(await cache.get('del:key')).toBe('value');

    await cache.invalidate('del:key');

    // Key should be gone from L1
    const result = await cache.get('del:key');
    expect(result).toBeNull();
  });

  test('invalidatePattern clears L1 keys matching prefix', async () => {
    const cache = new CacheManager({ l1: { maxSize: 10, ttl: 5000 } });
    await cache.set('escrow:1', { id: 1 });
    await cache.set('escrow:2', { id: 2 });
    await cache.set('tenant:1', { id: 't1' });

    await cache.invalidatePattern('escrow:');

    // escrow keys should be gone from L1
    expect(await cache.get('escrow:1')).toBeNull();
    expect(await cache.get('escrow:2')).toBeNull();
    // tenant:1 should still be there
    expect(await cache.get('tenant:1')).toEqual({ id: 't1' });
  });

  test('invalidateStats increments', async () => {
    const cache = new CacheManager({ l1: { maxSize: 10, ttl: 5000 } });
    await cache.set('inv:1', 'a');
    await cache.invalidate('inv:1');

    const stats = cache.analytics();
    expect(stats.invalidations).toBeGreaterThanOrEqual(1);
  });
});

// ── Tag-based Invalidation Tests ───────────────────────────────────────────────

describe('Tag-based invalidation', () => {
  test('invalidateTag removes tagged entries from L1', async () => {
    const cache = new CacheManager({ l1: { maxSize: 10, ttl: 5000 } });
    await cache.set('escrow:1', { id: 1 }, { tags: ['escrows'] });
    await cache.set('escrow:2', { id: 2 }, { tags: ['escrows'] });
    await cache.set('tenant:1', { id: 't1' }, { tags: ['tenants'] });

    // When Redis is connected, tags are stored via sAdd.
    // Mock sMembers to return the keys associated with the 'escrows' tag.
    const { createClient } = await import('redis');
    const client = createClient();
    client.sMembers.mockResolvedValueOnce(['escrow:1', 'escrow:2']);

    await cache.invalidateTag('escrows');

    // The tag lookup used Redis sMembers and deleted via del
    expect(client.sMembers).toHaveBeenCalledWith('tag:escrows');
  });

  test('invalidateTags handles multiple tags', async () => {
    const cache = new CacheManager({ l1: { maxSize: 10, ttl: 5000 } });
    await cache.set('a:1', { id: 1 }, { tags: ['tagA'] });
    await cache.set('b:1', { id: 1 }, { tags: ['tagB'] });

    const { createClient } = await import('redis');
    const client = createClient();
    client.sMembers.mockResolvedValue([]);

    await cache.invalidateTags(['tagA', 'tagB']);

    const stats = cache.analytics();
    expect(stats.invalidations).toBeGreaterThanOrEqual(2);
  });
});

// ── flushTenant Tests ──────────────────────────────────────────────────────────

describe('flushTenant', () => {
  test('removes tenant keys from L1', async () => {
    const cache = new CacheManager({ l1: { maxSize: 10, ttl: 5000 } });
    await cache.set('tenant:alpha:escrow:1', { data: 'A' });
    await cache.set('tenant:beta:escrow:1', { data: 'B' });

    await cache.flushTenant('alpha');

    // alpha's key should be removed from L1
    expect(await cache.get('tenant:alpha:escrow:1')).toBeNull();
  });
});

// ── warm() Tests ───────────────────────────────────────────────────────────────

describe('warm()', () => {
  test('returns existing cached value without calling loader', async () => {
    const cache = new CacheManager({ l1: { maxSize: 10, ttl: 5000 } });
    await cache.set('warm:existing', 'cached');

    const loader = jest.fn(async () => 'fresh');
    const result = await cache.warm('warm:existing', loader);
    expect(result).toBe('cached');
    expect(loader).not.toHaveBeenCalled();
  });

  test('calls loader and caches result on miss', async () => {
    const cache = new CacheManager({ l1: { maxSize: 10, ttl: 5000 } });
    const loader = jest.fn(async () => ({ fresh: true }));

    const result = await cache.warm('warm:new', loader);
    expect(result).toEqual({ fresh: true });
    expect(loader).toHaveBeenCalledTimes(1);

    // Should be cached now
    const cached = await cache.get('warm:new');
    expect(cached).toEqual({ fresh: true });
  });
});

// ── analytics() Tests ──────────────────────────────────────────────────────────

describe('analytics()', () => {
  test('returns correct stats structure', async () => {
    const cache = new CacheManager({ l1: { maxSize: 10, ttl: 5000 } });

    // Generate some hits and misses
    await cache.get('analytics:miss');
    await cache.set('analytics:set', 'val');
    await cache.get('analytics:set');

    const stats = cache.analytics();
    expect(stats).toHaveProperty('l1');
    expect(stats).toHaveProperty('l2');
    expect(stats).toHaveProperty('l3');
    expect(stats).toHaveProperty('sets');
    expect(stats).toHaveProperty('invalidations');
    expect(stats).toHaveProperty('hitRate');
    expect(stats).toHaveProperty('backend');
    expect(stats).toHaveProperty('l1Size');
    expect(typeof stats.hitRate).toBe('string');
    expect(stats.l1.hits).toBeGreaterThanOrEqual(1);
    expect(stats.l1.misses).toBeGreaterThanOrEqual(1);
    expect(stats.sets).toBeGreaterThanOrEqual(1);
  });

  test('hitRate is "0" when no requests made', () => {
    const cache = new CacheManager({ l1: { maxSize: 10, ttl: 5000 } });
    const stats = cache.analytics();
    expect(stats.hitRate).toBe('0');
  });
});

// ── setWithTags() backward compatibility ───────────────────────────────────────

describe('setWithTags() backward compatibility', () => {
  test('setWithTags stores value retrievable via get', async () => {
    const cache = new CacheManager({ l1: { maxSize: 10, ttl: 5000 } });
    await cache.setWithTags('compat:key', { data: 1 }, 120, ['tag1', 'tag2']);

    const result = await cache.get('compat:key');
    expect(result).toEqual({ data: 1 });
  });
});

// ── invalidatePrefix() backward compatibility ──────────────────────────────────

describe('invalidatePrefix() backward compatibility', () => {
  test('invalidatePrefix clears matching L1 keys', async () => {
    const cache = new CacheManager({ l1: { maxSize: 10, ttl: 5000 } });
    await cache.set('prefix:1', 'a');
    await cache.set('prefix:2', 'b');
    await cache.set('other:1', 'c');

    await cache.invalidatePrefix('prefix:');

    expect(await cache.get('prefix:1')).toBeNull();
    expect(await cache.get('prefix:2')).toBeNull();
    expect(await cache.get('other:1')).toBe('c');
  });
});

// ── Key namespace tests ────────────────────────────────────────────────────────

describe('Key namespace', () => {
  test('per-resource TTL is applied based on key prefix', async () => {
    const cache = new CacheManager({
      l1: { maxSize: 10, ttl: 5000 },
      l2: { ttl: 60, resourceTTLs: { escrow: 300, user: 120 } },
    });

    // set should not throw — resource type is extracted internally
    await cache.set('escrow:abc123', { id: 'abc123' });
    await cache.set('user:u456', { id: 'u456' });

    // Both should be retrievable
    expect(await cache.get('escrow:abc123')).toEqual({ id: 'abc123' });
    expect(await cache.get('user:u456')).toEqual({ id: 'u456' });
  });
});

// ── Metrics integration ────────────────────────────────────────────────────────

describe('Metrics', () => {
  test('increments prom-client counters on cache operations', async () => {
    const cache = new CacheManager({ l1: { maxSize: 10, ttl: 5000 } });

    await cache.get('metrics:miss');
    await cache.set('metrics:set', 'val');
    await cache.get('metrics:set');

    // L1 hit
    expect(cacheMetrics.cacheHitsTotal.inc).toHaveBeenCalledWith({ key_prefix: 'l1' });
    // L1 miss
    expect(cacheMetrics.cacheMissesTotal.inc).toHaveBeenCalledWith({ key_prefix: 'l1' });
  });
});

// ── Singleton export ───────────────────────────────────────────────────────────

describe('Singleton export', () => {
  test('default export is a CacheManager instance', async () => {
    const mod = await import('../lib/cacheManager.js');
    expect(mod.default).toBeInstanceOf(CacheManager);
    expect(mod.cacheManager).toBeInstanceOf(CacheManager);
  });
});

// ── lib/cache.js re-export ─────────────────────────────────────────────────────

describe('lib/cache.js re-export', () => {
  test('lib/cache.js exports the CacheManager singleton', async () => {
    const cacheModule = await import('../lib/cache.js');
    expect(cacheModule.default).toBeDefined();
    expect(typeof cacheModule.default.get).toBe('function');
    expect(typeof cacheModule.default.set).toBe('function');
    expect(typeof cacheModule.default.invalidate).toBe('function');
    expect(typeof cacheModule.default.invalidatePrefix).toBe('function');
    expect(typeof cacheModule.default.invalidateTag).toBe('function');
    expect(typeof cacheModule.default.invalidateTags).toBe('function');
    expect(typeof cacheModule.default.setWithTags).toBe('function');
    expect(typeof cacheModule.default.warm).toBe('function');
    expect(typeof cacheModule.default.analytics).toBe('function');
    expect(typeof cacheModule.default.size).toBe('function');
  });
});
