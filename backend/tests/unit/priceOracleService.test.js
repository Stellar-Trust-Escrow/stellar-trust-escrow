/**
 * Tests for services/priceOracleService.js
 *
 * Verifies:
 *  - source failover: 1→2→3 in priority order
 *  - cache is written on refresh and read on getCachedPrice (no external
 *    call on the hot path)
 *  - staleness: cached data older than 5 min is not served as fresh
 */

import { jest } from '@jest/globals';

const loggerMock = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
jest.unstable_mockModule('../../config/logger.js', () => ({
  createModuleLogger: () => loggerMock,
}));

const cacheStore = new Map();
const cacheServiceMock = {
  get: jest.fn(async (key) => cacheStore.get(key) ?? null),
  set: jest.fn(async (key, value) => {
    cacheStore.set(key, value);
    return value;
  }),
};
jest.unstable_mockModule('../../services/cacheService.js', () => ({
  default: cacheServiceMock,
}));

let priceOracle;

beforeAll(async () => {
  priceOracle = await import('../../services/priceOracleService.js');
});

beforeEach(() => {
  cacheStore.clear();
  jest.clearAllMocks();
  global.fetch = jest.fn();
});

function jsonResponse(body, ok = true, status = 200) {
  return { ok, status, json: async () => body };
}

describe('fetchLivePrice failover', () => {
  it('uses source 1 (SEP-38) when configured and healthy', async () => {
    process.env.SEP38_QUOTE_SERVER_URL = 'https://anchor.example.com';
    global.fetch.mockResolvedValueOnce(jsonResponse({ buy_amount: '0.42' }));

    const result = await priceOracle.fetchLivePrice();

    expect(result.source).toBe('sep38');
    expect(result.price_usd).toBeCloseTo(0.42);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    delete process.env.SEP38_QUOTE_SERVER_URL;
  });

  it('falls back to Coingecko when SEP-38 is unavailable', async () => {
    delete process.env.SEP38_QUOTE_SERVER_URL;
    global.fetch.mockResolvedValueOnce(jsonResponse({ stellar: { usd: 0.39 } }));

    const result = await priceOracle.fetchLivePrice();

    expect(result.source).toBe('coingecko');
    expect(result.price_usd).toBeCloseTo(0.39);
  });

  it('falls back to Binance when Coingecko also fails', async () => {
    delete process.env.SEP38_QUOTE_SERVER_URL;
    global.fetch
      .mockResolvedValueOnce(jsonResponse({}, false, 500))
      .mockResolvedValueOnce(jsonResponse({ price: '0.4101' }));

    const result = await priceOracle.fetchLivePrice();

    expect(result.source).toBe('binance');
    expect(result.price_usd).toBeCloseTo(0.4101);
  });

  it('throws when every source fails', async () => {
    delete process.env.SEP38_QUOTE_SERVER_URL;
    global.fetch.mockResolvedValue(jsonResponse({}, false, 500));

    await expect(priceOracle.fetchLivePrice()).rejects.toThrow('All price oracle sources failed');
  });
});

describe('cache hot path', () => {
  it('getCachedPrice never calls fetch when a fresh cache entry exists', async () => {
    await cacheServiceMock.set('market:xlm_usd', {
      price_usd: 0.4,
      source: 'coingecko',
      timestamp: new Date().toISOString(),
      stale: false,
    });

    const result = await priceOracle.getCachedPrice();

    expect(result.stale).toBe(false);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('serves last-known price as stale when primary cache has expired but is within 5 min', async () => {
    const eightySecondsAgo = new Date(Date.now() - 80_000).toISOString();
    await cacheServiceMock.set('market:xlm_usd:last_known', {
      price_usd: 0.41,
      source: 'binance',
      timestamp: eightySecondsAgo,
      stale: false,
    });

    const result = await priceOracle.getCachedPrice();

    expect(result.stale).toBe(true);
    expect(result.price_usd).toBeCloseTo(0.41);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('attempts a live fetch only when there is no usable cache at all (cold start)', async () => {
    delete process.env.SEP38_QUOTE_SERVER_URL;
    global.fetch.mockResolvedValueOnce(jsonResponse({ stellar: { usd: 0.37 } }));

    const result = await priceOracle.getCachedPrice();

    expect(result.price_usd).toBeCloseTo(0.37);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});
