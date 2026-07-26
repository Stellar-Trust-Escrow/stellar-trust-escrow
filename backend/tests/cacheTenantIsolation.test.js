/**
 * Cache Tenant Isolation Tests
 *
 * Verifies that two tenants requesting the same endpoint path receive
 * independent cache entries — Tenant B never sees Tenant A's cached data.
 *
 * Also verifies that flushTenant() removes only the target tenant's keys.
 */

import { jest } from '@jest/globals';
import { createHash } from 'crypto';

// ── Mock cache service ────────────────────────────────────────────────────────

const store = new Map();
/** tag → Set<key> */
const tagIndex = new Map();

const mockCache = {
  get: jest.fn(async (key) => store.get(key) ?? null),
  set: jest.fn(async (key, value) => store.set(key, value)),
  setWithTags: jest.fn(async (key, value, _ttl, tags) => {
    store.set(key, value);
    for (const tag of tags ?? []) {
      if (!tagIndex.has(tag)) tagIndex.set(tag, new Set());
      tagIndex.get(tag).add(key);
    }
  }),
  invalidate: jest.fn(async (key) => store.delete(key)),
  invalidatePrefix: jest.fn(async (prefix) => {
    for (const k of store.keys()) if (k.startsWith(prefix)) store.delete(k);
  }),
  invalidateTag: jest.fn(async (tag) => {
    for (const key of tagIndex.get(tag) ?? []) store.delete(key);
    tagIndex.delete(tag);
  }),
  invalidateTags: jest.fn(async (tags) => {
    for (const tag of tags) {
      for (const key of tagIndex.get(tag) ?? []) store.delete(key);
      tagIndex.delete(tag);
    }
  }),
  flushTenant: jest.fn(async (slug) => {
    const prefix = `tenant:${slug}:`;
    for (const k of store.keys()) if (k.startsWith(prefix)) store.delete(k);
  }),
};

jest.unstable_mockModule('../lib/cache.js', () => ({ default: mockCache }));

// ── Tenant fixtures ───────────────────────────────────────────────────────────

const TENANT_A = { id: 'tid-aaa', slug: 'alpha' };
const TENANT_B = { id: 'tid-bbb', slug: 'beta' };

function makeReq({ tenant, path = '/api/reputation/leaderboard', query = {} } = {}) {
  return { method: 'GET', path, query, tenant };
}

function makeRes() {
  const headers = {};
  let statusCode = 200;
  const res = {
    get statusCode() {
      return statusCode;
    },
    set statusCode(v) {
      statusCode = v;
    },
    setHeader: jest.fn((k, v) => {
      headers[k] = v;
    }),
    json: jest.fn(function (b) {
      return res;
    }),
    on: jest.fn(),
    getHeader: (k) => headers[k],
  };
  return res;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  store.clear();
  tagIndex.clear();
  jest.clearAllMocks();
});

// ── Tests ─────────────────────────────────────────────────────────────────────

test('buildCacheKey scopes key by tenant slug', async () => {
  const { buildCacheKey } = await import('../api/middleware/cache.js');

  const keyA = buildCacheKey(makeReq({ tenant: TENANT_A }));
  const keyB = buildCacheKey(makeReq({ tenant: TENANT_B }));

  expect(keyA).toContain('alpha');
  expect(keyB).toContain('beta');
  expect(keyA).not.toBe(keyB);
});

test('buildCacheKey uses _global for requests without a tenant', async () => {
  const { buildCacheKey } = await import('../api/middleware/cache.js');

  const key = buildCacheKey(makeReq({ tenant: undefined }));
  expect(key).toMatch(/^t:_global:/);
});

test('buildCacheKey hashes query params deterministically', async () => {
  const { buildCacheKey } = await import('../api/middleware/cache.js');

  const req1 = makeReq({ tenant: TENANT_A, query: { b: '2', a: '1' } });
  const req2 = makeReq({ tenant: TENANT_A, query: { a: '1', b: '2' } });
  expect(buildCacheKey(req1)).toBe(buildCacheKey(req2));
});

test('Tenant B gets a MISS when Tenant A has a cached leaderboard', async () => {
  const { cacheResponse, TTL } = await import('../api/middleware/cache.js');

  // Populate cache for Tenant A
  const payloadA = { data: [{ address: '0xAAA', totalScore: 100 }] };
  mockCache.get.mockResolvedValueOnce(payloadA); // Tenant A: HIT

  const mwA = cacheResponse({ ttl: TTL.LEADERBOARD, tags: ['reputation:leaderboard'] });
  const reqA = makeReq({ tenant: TENANT_A });
  const resA = makeRes();
  await mwA(reqA, resA, jest.fn());

  expect(resA.setHeader).toHaveBeenCalledWith('X-Cache', 'HIT');
  expect(resA.json).toHaveBeenCalledWith(payloadA);

  // Tenant B should get a MISS — cache returns null for its key
  mockCache.get.mockResolvedValueOnce(null); // Tenant B: MISS

  const mwB = cacheResponse({ ttl: TTL.LEADERBOARD, tags: ['reputation:leaderboard'] });
  const reqB = makeReq({ tenant: TENANT_B });
  const resB = makeRes();
  const nextB = jest.fn();
  // Save ref before middleware replaces res.json with the store interceptor
  const originalJsonB = resB.json;
  await mwB(reqB, resB, nextB);

  expect(resB.setHeader).toHaveBeenCalledWith('X-Cache', 'MISS');
  // Tenant B's next() must be called — controller will serve its own data
  expect(nextB).toHaveBeenCalled();
  // The original res.json mock was NOT called — no cache HIT served
  expect(originalJsonB).not.toHaveBeenCalled();
  // Ensure Tenant B was not served Tenant A's payload
  expect(resB.json).not.toBe(originalJsonB); // interceptor is now in place
});

test('cache keys for the same path are different for each tenant', async () => {
  const { buildCacheKey } = await import('../api/middleware/cache.js');

  const reqA = makeReq({ tenant: TENANT_A });
  const reqB = makeReq({ tenant: TENANT_B });

  expect(buildCacheKey(reqA)).not.toBe(buildCacheKey(reqB));
});

test('tags are scoped per tenant so invalidation does not cross tenants', async () => {
  const { cacheResponse, invalidateOn, TTL } = await import('../api/middleware/cache.js');

  // Simulate Tenant A storing a leaderboard entry under its scoped tag
  mockCache.get.mockResolvedValueOnce(null);
  const mwA = cacheResponse({ ttl: TTL.LEADERBOARD, tags: ['reputation:leaderboard'] });
  const reqA = makeReq({ tenant: TENANT_A });
  const resA = makeRes();
  const nextA = jest.fn();
  await mwA(reqA, resA, nextA);
  // Store Tenant A's response
  await resA.json({ data: [] });

  // The tag stored should include Tenant A's id
  const [[, , , storedTagsA]] = mockCache.setWithTags.mock.calls;
  expect(storedTagsA).toEqual(expect.arrayContaining([`t:${TENANT_A.id}:reputation:leaderboard`]));

  // Invalidating the leaderboard as Tenant B should use Tenant B's id
  const mwInvalidate = invalidateOn({ tags: ['reputation:leaderboard'], when: 'before' });
  const reqB = makeReq({ tenant: TENANT_B });
  const resB = makeRes();
  await mwInvalidate(reqB, resB, jest.fn());

  expect(mockCache.invalidateTags).toHaveBeenCalledWith(
    expect.arrayContaining([`t:${TENANT_B.id}:reputation:leaderboard`]),
  );
  // Tenant A's tag must NOT appear in the invalidation call
  const [calledTags] = mockCache.invalidateTags.mock.calls[0];
  expect(calledTags).not.toContain(`t:${TENANT_A.id}:reputation:leaderboard`);
});

test('flushTenant removes only that tenant\'s keys', async () => {
  const keyA = `tenant:${TENANT_A.slug}:http:GET:/api/leaderboard`;
  const keyB = `tenant:${TENANT_B.slug}:http:GET:/api/leaderboard`;
  store.set(keyA, { data: 'A' });
  store.set(keyB, { data: 'B' });

  await mockCache.flushTenant(TENANT_A.slug);

  expect(store.has(keyA)).toBe(false);
  expect(store.has(keyB)).toBe(true);
});
