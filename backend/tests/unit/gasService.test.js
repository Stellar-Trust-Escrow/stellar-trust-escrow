import { describe, expect, test, jest } from '@jest/globals';
import { createGasService, DEFAULT_FEE_PERCENTILES } from '../../services/gasService.js';

function createRedisStore(initialEntries = {}) {
  const store = new Map(Object.entries(initialEntries));
  const expirations = new Map();

  return {
    async get(key) {
      return store.has(key) ? store.get(key) : null;
    },
    async set(key, value, mode, ttl) {
      store.set(key, value);
      if (mode === 'EX') {
        expirations.set(key, ttl);
      }
      return 'OK';
    },
    async expire(key, ttl) {
      expirations.set(key, ttl);
      return 1;
    },
    async ttl(key) {
      return expirations.has(key) ? expirations.get(key) : -2;
    },
    __store() {
      return store;
    },
  };
}

describe('createGasService', () => {
  test('returns hardcoded defaults when no cached stats are available', async () => {
    const service = createGasService({ redisClient: createRedisStore() });
    const percentiles = await service.getFeePercentiles();

    expect(percentiles).toEqual(DEFAULT_FEE_PERCENTILES);
  });

  test('uses a surge premium for critical urgency recommendations', () => {
    const service = createGasService({
      redisClient: createRedisStore({
        'stellar:fee_stats': JSON.stringify({ p10: 100, p50: 200, p90: 300, p99: 400 }),
      }),
    });

    expect(service.recommendFee('critical')).toBe(500);
  });

  test('serves stale fee stats when the poll fails and extends the TTL', async () => {
    const redis = createRedisStore({
      'stellar:fee_stats': JSON.stringify({ p10: 100, p50: 200, p90: 300, p99: 400 }),
    });
    const fetchImpl = jest.fn(async () => {
      throw new Error('horizon unavailable');
    });

    const service = createGasService({ redisClient: redis, fetchImpl });
    const result = await service.pollFeeStats();

    expect(result.source).toBe('cache');
    expect(result.percentiles.p50).toBe(200);
    expect(await redis.ttl('stellar:fee_stats')).toBeGreaterThan(90);
  });
});
