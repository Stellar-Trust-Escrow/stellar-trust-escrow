import { describe, expect, it, beforeEach } from '@jest/globals';
import express from 'express';
import request from 'supertest';

import { createPerUserRateLimiter, getUsageStore } from '../api/middleware/rateLimiter.js';
import { TIER_LIMITS, getLimitForTier, DEFAULT_TIER } from '../config/rateLimits.js';

function buildApp({ userId, tier, max } = {}) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    if (userId || tier) req.user = { id: userId, tier };
    next();
  });
  app.use(createPerUserRateLimiter({ prefix: 'test', ...(max !== undefined && { max }) }));
  app.get('/test', (_req, res) => res.json({ ok: true }));
  return app;
}

beforeEach(() => {
  getUsageStore().clear();
});

describe('config/rateLimits', () => {
  it('returns correct limit for each tier', () => {
    expect(getLimitForTier('free')).toBe(TIER_LIMITS.free);
    expect(getLimitForTier('premium')).toBe(TIER_LIMITS.premium);
    expect(getLimitForTier('admin')).toBe(TIER_LIMITS.admin);
  });

  it('falls back to free tier for unknown tier', () => {
    expect(getLimitForTier('unknown')).toBe(TIER_LIMITS[DEFAULT_TIER]);
  });

  it('premium limit is higher than free limit', () => {
    expect(getLimitForTier('premium')).toBeGreaterThan(getLimitForTier('free'));
  });
});

describe('per-user rate limiter', () => {
  it('allows requests within the limit', async () => {
    const app = buildApp({ userId: 'user-1', tier: 'free' });
    const res = await request(app).get('/test').set('x-user-id', 'user-1');
    expect(res.status).toBe(200);
  });

  it('tracks usage per user in the store', async () => {
    const app = buildApp({ userId: 'user-track', tier: 'free' });
    await request(app).get('/test').set('x-user-id', 'user-track');
    await request(app).get('/test').set('x-user-id', 'user-track');
    const entry = getUsageStore().get('user:user-track');
    expect(entry).toBeDefined();
    expect(entry.count).toBeGreaterThanOrEqual(2);
  });

  it('blocks requests exceeding the limit', async () => {
    const app = buildApp({ userId: 'user-block', max: 2 });
    await request(app).get('/test').set('x-user-id', 'user-block');
    await request(app).get('/test').set('x-user-id', 'user-block');
    const res = await request(app).get('/test').set('x-user-id', 'user-block');
    expect(res.status).toBe(429);
    expect(res.body.code).toBe('RATE_LIMIT_EXCEEDED');
  });

  it('tracks different users independently', async () => {
    const app = buildApp({ max: 2 });
    await request(app).get('/test').set('x-user-id', 'user-a');
    await request(app).get('/test').set('x-user-id', 'user-a');
    // user-b should still be allowed
    const res = await request(app).get('/test').set('x-user-id', 'user-b');
    expect(res.status).toBe(200);
  });
});
