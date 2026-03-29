/**
 * Cache Middleware Tests
 *
 * Tests buildCacheKey, cacheResponse, and invalidateOn using a mock
 * cache service — no Redis or Express server required.
 */

import { jest } from '@jest/globals';

// ── Mock cache service ────────────────────────────────────────────────────────

const store = new Map();
const mockCache = {
  get: jest.fn(async (key) => store.get(key) ?? null),
  set: jest.fn(async (key, value) => store.set(key, value)),
  setWithTags: jest.fn(async (key, value, _ttl, _tags) => store.set(key, value)),
  invalidate: jest.fn(async (key) => store.delete(key)),
  invalidatePrefix: jest.fn(async (prefix) => {
    for (const k of store.keys()) if (k.startsWith(prefix)) store.delete(k);
  }),
  invalidateTag: jest.fn(async (tag) => store.delete(`tag:${tag}`)),
  invalidateTags: jest.fn(async (tags) => tags.forEach((t) => store.delete(`tag:${t}`))),
};

jest.unstable_mockModule('../lib/cache.js', () => ({ default: mockCache }));

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeReq(overrides = {}) {
  return {
    method: 'GET',
    path: '/api/escrows',
    query: {},
    ...overrides,
  };
}

function makeRes() {
  const headers = {};
  let statusCode = 200;
  let body = null;
  const res = {
    statusCode,
    setHeader: jest.fn((k, v) => { headers[k] = v; }),
    json: jest.fn((b) => { body = b; return res; }),
    on: jest.fn(),
    getHeaders: () => headers,
    getBody: () => body,
  };
  return res;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  store.clear();
  jest.clearAllMocks();
});

test('buildCacheKey sorts query params deterministically', async () => {
  const { buildCacheKey } = await import('../api/middleware/cache.js');
  const req1 = makeReq({ query: { b: '2', a: '1' } });
  const req2 = makeReq({ query: { a: '1', b: '2' } });
  expect(buildCacheKey(req1)).toBe(buildCacheKey(req2));
});

test('buildCacheKey includes path and method', async () => {
  const { buildCacheKey } = await import('../api/middleware/cache.js');
  const key = buildCacheKey(makeReq({ method: 'GET', path: '/api/escrows' }));
  expect(key).toContain('GET');
  expect(key).toContain('/api/escrows');
});

test('cacheResponse returns cached value on HIT', async () => {
  const { cacheResponse } = await import('../api/middleware/cache.js');
  const cached = { data: [{ id: 1 }] };
  mockCache.get.mockResolvedValueOnce(cached);

  const req = makeReq();
  const res = makeRes();
  const next = jest.fn();

  const mw = cacheResponse({ ttl: 30, tags: ['escrows'] });
  await mw(req, res, next);

  expect(res.setHeader).toHaveBeenCalledWith('X-Cache', 'HIT');
  expect(res.json).toHaveBeenCalledWith(cached);
  expect(next).not.toHaveBeenCalled();
});

test('cacheResponse calls next and stores response on MISS', async () => {
  const { cacheResponse } = await import('../api/middleware/cache.js');
  mockCache.get.mockResolvedValueOnce(null);

  const req = makeReq();
  const res = makeRes();
  const next = jest.fn();

  const mw = cacheResponse({ ttl: 30, tags: ['escrows'] });
  await mw(req, res, next);

  expect(res.setHeader).toHaveBeenCalledWith('X-Cache', 'MISS');
  expect(next).toHaveBeenCalled();

  // Simulate controller calling res.json
  const payload = { data: [] };
  await res.json(payload);
  expect(mockCache.setWithTags).toHaveBeenCalledWith(
    expect.any(String),
    payload,
    30,
    ['escrows'],
  );
});

test('cacheResponse skips non-GET methods', async () => {
  const { cacheResponse } = await import('../api/middleware/cache.js');
  const req = makeReq({ method: 'POST' });
  const res = makeRes();
  const next = jest.fn();

  const mw = cacheResponse({ ttl: 30 });
  await mw(req, res, next);

  expect(mockCache.get).not.toHaveBeenCalled();
  expect(next).toHaveBeenCalled();
});

test('cacheResponse respects skip function', async () => {
  const { cacheResponse } = await import('../api/middleware/cache.js');
  const req = makeReq();
  const res = makeRes();
  const next = jest.fn();

  const mw = cacheResponse({ ttl: 30, skip: () => true });
  await mw(req, res, next);

  expect(mockCache.get).not.toHaveBeenCalled();
  expect(next).toHaveBeenCalled();
});

test('cacheResponse resolves tag function with req', async () => {
  const { cacheResponse } = await import('../api/middleware/cache.js');
  mockCache.get.mockResolvedValueOnce(null);

  const req = makeReq({ params: { id: '42' } });
  const res = makeRes();
  const next = jest.fn();

  const mw = cacheResponse({ ttl: 30, tags: (r) => [`escrow:${r.params?.id}`] });
  await mw(req, res, next);
  await res.json({ id: 42 });

  expect(mockCache.setWithTags).toHaveBeenCalledWith(
    expect.any(String),
    { id: 42 },
    30,
    ['escrow:42'],
  );
});

test('invalidateOn after — calls invalidateTags after response finish', async () => {
  const { invalidateOn } = await import('../api/middleware/cache.js');
  const req = makeReq({ method: 'POST' });
  const res = makeRes();
  const next = jest.fn();

  // Capture the 'finish' listener
  let finishCb;
  res.on.mockImplementation((event, cb) => { if (event === 'finish') finishCb = cb; });

  const mw = invalidateOn({ tags: ['escrows'], when: 'after' });
  mw(req, res, next);

  expect(next).toHaveBeenCalled();
  expect(mockCache.invalidateTags).not.toHaveBeenCalled();

  // Simulate response finish
  res.statusCode = 200;
  await finishCb();
  expect(mockCache.invalidateTags).toHaveBeenCalledWith(['escrows']);
});

test('invalidateOn before — invalidates before calling next', async () => {
  const { invalidateOn } = await import('../api/middleware/cache.js');
  const req = makeReq({ method: 'DELETE' });
  const res = makeRes();
  const next = jest.fn();

  const mw = invalidateOn({ tags: ['escrows'], when: 'before' });
  await mw(req, res, next);

  expect(mockCache.invalidateTags).toHaveBeenCalledWith(['escrows']);
  expect(next).toHaveBeenCalled();
});

test('TTL exports are positive integers', async () => {
  const { TTL } = await import('../api/middleware/cache.js');
  for (const [k, v] of Object.entries(TTL)) {
    expect(typeof v).toBe('number');
    expect(v).toBeGreaterThan(0);
    expect(Number.isInteger(v)).toBe(true);
  }
});
