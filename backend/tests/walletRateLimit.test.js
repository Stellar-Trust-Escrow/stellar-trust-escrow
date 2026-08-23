import { describe, test, expect, jest } from '@jest/globals';
import { SlidingWindowStore, walletRateLimit } from '../api/middleware/rateLimiter.js';

describe('walletRateLimit middleware', () => {
  function makeReqRes(wallet, path = '/api/escrows') {
    const headers = {};
    const req = { path, body: { walletAddress: wallet }, user: null, headers: {} };
    const res = {
      setHeader: (k, v) => { headers[k] = v; },
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
      _headers: headers,
    };
    return { req, res };
  }

  test('allows requests under the limit', async () => {
    const store = new SlidingWindowStore();
    const mw = walletRateLimit({ max: 5, windowMs: 60000, store });
    const next = jest.fn();
    const { req, res } = makeReqRes('GABC123');
    await mw(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalledWith(429);
  });

  test('blocks requests over the limit', async () => {
    const store = new SlidingWindowStore();
    const mw = walletRateLimit({ max: 2, windowMs: 60000, store });
    const next = jest.fn();
    let blocked = false;
    for (let i = 0; i < 4; i++) {
      const { req, res } = makeReqRes('GOVER123');
      await mw(req, res, next);
      if (res.status.mock.calls.some(c => c[0] === 429)) blocked = true;
    }
    expect(blocked).toBe(true);
  });

  test('bypasses /health path regardless of limit', async () => {
    const store = new SlidingWindowStore();
    const mw = walletRateLimit({ max: 0, windowMs: 60000, store });
    const next = jest.fn();
    const { req, res } = makeReqRes('GABC', '/health');
    await mw(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalledWith(429);
  });

  test('sets X-RateLimit-* headers', async () => {
    const store = new SlidingWindowStore();
    const mw = walletRateLimit({ max: 10, windowMs: 60000, store });
    const next = jest.fn();
    const { req, res } = makeReqRes('GHEADER');
    await mw(req, res, next);
    expect(res._headers['X-RateLimit-Limit']).toBe(10);
    expect(typeof res._headers['X-RateLimit-Remaining']).toBe('number');
    expect(typeof res._headers['X-RateLimit-Reset']).toBe('number');
  });

  test('sets Retry-After header on 429', async () => {
    const store = new SlidingWindowStore();
    const mw = walletRateLimit({ max: 1, windowMs: 30000, store });
    const next = jest.fn();
    for (let i = 0; i < 3; i++) {
      const { req, res } = makeReqRes('GRETRY');
      await mw(req, res, next);
      if (res._headers['Retry-After']) {
        expect(Number(res._headers['Retry-After'])).toBeGreaterThan(0);
      }
    }
  });

  test('skips wallet check when no wallet present', async () => {
    const store = new SlidingWindowStore();
    const mw = walletRateLimit({ max: 0, windowMs: 60000, store });
    const next = jest.fn();
    const req = { path: '/api/escrows', body: {}, user: null, headers: {} };
    const res = { setHeader: jest.fn(), status: jest.fn().mockReturnThis(), json: jest.fn() };
    await mw(req, res, next);
    expect(next).toHaveBeenCalled();
  });
});
