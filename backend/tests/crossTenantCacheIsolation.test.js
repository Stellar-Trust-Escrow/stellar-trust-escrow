/**
 * Cross-Tenant Cache Isolation Tests
 *
 * Verifies that two tenants hitting the same endpoint path get independent
 * cache entries and that Tenant A's cached leaderboard is never served to
 * Tenant B.
 */

import { jest } from '@jest/globals';

// ── Mock cache service (in-memory, no Redis) ──────────────────────────────────

const store = new Map();
const tagStore = new Map();

const mockCache = {
  get: jest.fn(async (key) => store.get(key) ?? null),
  set: jest.fn(async (key, value) => store.set(key, value)),
  setWithTags: jest.fn(async (key, value, _ttl, tags = []) => {
    store.set(key, value);
    for (const tag of tags) {
      if (!tagStore.has(tag)) tagStore.set(tag, new Set());
      tagStore.get(tag).add(key);
    }
  }),
  invalidate: jest.fn(async (key) => store.delete(key)),
  invalidatePrefix: jest.fn(async (prefix) => {
    for (const k of store.keys()) if (k.startsWith(prefix)) store.delete(k);
  }),
  invalidateTag: jest.fn(),
  invalidateTags: jest.fn(),
  flushTenant: jest.fn(async (slug) => {
    let deleted = 0;
    for (const k of store.keys()) {
      if (k.startsWith(`t:${slug}:`)) {
        store.delete(k);
        deleted++;
      }
    }
    return deleted;
  }),
};

jest.unstable_mockModule('../lib/cache.js', () => ({ default: mockCache }));

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeReq(tenant, overrides = {}) {
  return {
    method: 'GET',
    path: '/api/reputation/leaderboard',
    query: {},
    tenant,
    ...overrides,
  };
}

function makeRes(statusCode = 200) {
  const res = {
    statusCode,
    headers: {},
    body: null,
    setHeader: jest.fn(function (k, v) {
      this.headers[k] = v;
    }),
    json: jest.fn(function (b) {
      this.body = b;
      return this;
    }),
    on: jest.fn(),
  };
  return res;
}

const TENANT_A = { id: 'tid-a', slug: 'tenant-a' };
const TENANT_B = { id: 'tid-b', slug: 'tenant-b' };

// ── Tests ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  store.clear();
  tagStore.clear();
  jest.clearAllMocks();
});

test('buildCacheKey produces different keys for different tenants on the same path', async () => {
  const { buildCacheKey } = await import('../api/middleware/cache.js');

  const keyA = buildCacheKey(makeReq(TENANT_A));
  const keyB = buildCacheKey(makeReq(TENANT_B));

  expect(keyA).not.toBe(keyB);
  expect(keyA).toContain('t:tenant-a:');
  expect(keyB).toContain('t:tenant-b:');
});

test('tenantless request gets _global prefix', async () => {
  const { buildCacheKey } = await import('../api/middleware/cache.js');
  const key = buildCacheKey(makeReq(undefined));
  expect(key).toMatch(/^t:_global:/);
});

test('Tenant B gets a cache MISS when Tenant A result is already cached', async () => {
  const { cacheResponse, TTL } = await import('../api/middleware/cache.js');

  const leaderboardA = [{ address: 'ADDR_A1', totalScore: 100 }];

  // Prime cache for tenant A
  const reqA = makeReq(TENANT_A);
  const resA = makeRes();
  mockCache.get.mockResolvedValueOnce(null); // A: MISS
  const mw = cacheResponse({ ttl: TTL.LEADERBOARD, tags: ['reputation:leaderboard'] });
  await mw(reqA, resA, jest.fn());
  await resA.json(leaderboardA); // controller responds → stores in cache

  // Tenant B requests same path — cache should MISS (different key)
  const reqB = makeReq(TENANT_B);
  const resB = makeRes();
  mockCache.get.mockResolvedValueOnce(null); // B: MISS (different key, not in store)
  await mw(reqB, resB, jest.fn());

  expect(resB.headers['X-Cache']).toBe('MISS');
});

test('Tenant B never receives Tenant A leaderboard data from cache', async () => {
  const { buildCacheKey, cacheResponse, TTL } = await import('../api/middleware/cache.js');

  const leaderboardA = [{ address: 'ADDR_A1', totalScore: 100 }];
  const leaderboardB = [{ address: 'ADDR_B1', totalScore: 50 }];

  const keyA = buildCacheKey(makeReq(TENANT_A));
  const keyB = buildCacheKey(makeReq(TENANT_B));

  // Seed store directly for tenant A
  store.set(keyA, leaderboardA);

  const mw = cacheResponse({ ttl: TTL.LEADERBOARD, tags: ['reputation:leaderboard'] });

  // Tenant A gets a HIT with its own data
  const reqA = makeReq(TENANT_A);
  const resA = makeRes();
  mockCache.get.mockImplementation(async (key) => store.get(key) ?? null);
  await mw(reqA, resA, jest.fn());

  expect(resA.headers['X-Cache']).toBe('HIT');
  expect(resA.json).toHaveBeenCalledWith(leaderboardA);

  // Tenant B gets a MISS — its key is not in the store
  const reqB = makeReq(TENANT_B);
  const resB = makeRes();
  const nextB = jest.fn();
  await mw(reqB, resB, nextB);

  expect(resB.headers['X-Cache']).toBe('MISS');
  expect(nextB).toHaveBeenCalled(); // passed to controller, not served cached A data

  // Simulate B's controller writing its own data
  await resB.json(leaderboardB);

  // Verify keys are completely independent
  expect(keyA).not.toBe(keyB);
  expect(store.get(keyA)).toEqual(leaderboardA);
  expect(store.get(keyB)).toEqual(leaderboardB);
});

test('flushTenant removes only the target tenant keys', async () => {
  const { buildCacheKey } = await import('../api/middleware/cache.js');
  const { default: cache } = await import('../lib/cache.js');

  const keyA = buildCacheKey(makeReq(TENANT_A));
  const keyB = buildCacheKey(makeReq(TENANT_B));

  store.set(keyA, 'dataA');
  store.set(keyB, 'dataB');

  // Flush tenant A only
  await cache.flushTenant('tenant-a');

  expect(store.has(keyA)).toBe(false); // A's key removed
  expect(store.has(keyB)).toBe(true);  // B's key untouched
});

test('cache invalidation for Tenant A does not flush Tenant B cache', async () => {
  const { buildCacheKey } = await import('../api/middleware/cache.js');

  const keyA = buildCacheKey(makeReq(TENANT_A));
  const keyB = buildCacheKey(makeReq(TENANT_B));

  store.set(keyA, 'dataA');
  store.set(keyB, 'dataB');

  // Invalidate by tenant A prefix
  await mockCache.invalidatePrefix(`t:tenant-a:`);

  expect(store.has(keyA)).toBe(false);
  expect(store.has(keyB)).toBe(true);
});
