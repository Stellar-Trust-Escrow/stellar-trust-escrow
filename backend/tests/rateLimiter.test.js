import { describe, expect, it, beforeEach } from '@jest/globals';
import express from 'express';
import request from 'supertest';

import {
  createPerUserRateLimiter,
  createSlidingWindowRateLimiter,
  getUsageStore,
  getUserUsage,
  trackUsage,
  updateAdaptiveLoad,
} from '../api/middleware/rateLimiter.js';
import {
  TIER_LIMITS,
  RATE_LIMIT_WINDOW_MS,
  getLimitForTier,
  getBurstLimitForTier,
  DEFAULT_TIER,
} from '../config/rateLimits.js';

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
  updateAdaptiveLoad(0);
});

// ── Config tests ──────────────────────────────────────────────────────────────

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

  it('returns burst limit for each tier', () => {
    expect(getBurstLimitForTier('free')).toBeGreaterThan(0);
    expect(getBurstLimitForTier('premium')).toBeGreaterThan(getBurstLimitForTier('free'));
  });
});

// ── Sliding window store ──────────────────────────────────────────────────────

describe('SlidingWindowStore', () => {
  it('records and counts requests within the window', () => {
    const store = getUsageStore();
    store.record('test-key', 1000);
    store.record('test-key', 1000);
    expect(store.count('test-key', 1000)).toBe(2);
  });

  it('prunes requests outside the window', () => {
    const store = getUsageStore();
    const past = Date.now() - 2000;
    // Manually insert an old timestamp
    store._store.set('old-key', [past]);
    expect(store.count('old-key', 1000)).toBe(0);
  });

  it('getEntry returns count and resetAt', () => {
    const store = getUsageStore();
    store.record('entry-key', RATE_LIMIT_WINDOW_MS);
    const entry = store.getEntry('entry-key', RATE_LIMIT_WINDOW_MS);
    expect(entry.count).toBe(1);
    expect(entry.resetAt).toBeInstanceOf(Date);
  });

  it('returns zero count and null resetAt for missing key', () => {
    const entry = getUsageStore().getEntry('nonexistent', RATE_LIMIT_WINDOW_MS);
    expect(entry.count).toBe(0);
    expect(entry.resetAt).toBeNull();
  });
});

// ── trackUsage / getUserUsage ─────────────────────────────────────────────────

describe('trackUsage / getUserUsage', () => {
  it('trackUsage increments count', () => {
    trackUsage('user:u1', RATE_LIMIT_WINDOW_MS);
    trackUsage('user:u1', RATE_LIMIT_WINDOW_MS);
    const { count } = getUserUsage('u1');
    expect(count).toBe(2);
  });
});

// ── Per-user rate limiter ─────────────────────────────────────────────────────

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
    const entry = getUsageStore().getEntry('test:user:user-track', RATE_LIMIT_WINDOW_MS);
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

  it('sets X-RateLimit-* headers on allowed requests', async () => {
    const app = buildApp({ max: 10 });
    const res = await request(app).get('/test').set('x-user-id', 'header-user');
    expect(res.headers['x-ratelimit-limit']).toBe('10');
    expect(res.headers['x-ratelimit-remaining']).toBeDefined();
    expect(res.headers['x-ratelimit-reset']).toBeDefined();
  });

  it('sets Retry-After on rejection', async () => {
    const app = buildApp({ max: 1 });
    await request(app).get('/test').set('x-user-id', 'retry-user');
    const res = await request(app).get('/test').set('x-user-id', 'retry-user');
    expect(res.status).toBe(429);
    expect(res.headers['retry-after']).toBeDefined();
    expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
  });
});

// ── Sliding-window correctness ────────────────────────────────────────────────

describe('createSlidingWindowRateLimiter', () => {
  it('allows exactly max requests then blocks', async () => {
    const app = express();
    app.use(createSlidingWindowRateLimiter({ max: 3, prefix: 'sw-test' }));
    app.get('/', (_req, res) => res.json({ ok: true }));

    for (let i = 0; i < 3; i++) {
      await request(app).get('/').expect(200);
    }
    await request(app).get('/').expect(429);
  });

  it('resets after the window expires', async () => {
    const windowMs = 50;
    const app = express();
    app.use(createSlidingWindowRateLimiter({ max: 1, windowMs, prefix: 'sw-reset' }));
    app.get('/', (_req, res) => res.json({ ok: true }));

    await request(app).get('/').expect(200);
    await request(app).get('/').expect(429);

    // Wait for the window to expire
    await new Promise((r) => setTimeout(r, windowMs + 10));

    await request(app).get('/').expect(200);
  });
});

// ── Burst limiting ────────────────────────────────────────────────────────────

describe('burst limiting', () => {
  it('blocks burst traffic exceeding burstMax', async () => {
    const app = express();
    app.use(
      createSlidingWindowRateLimiter({
        max: 100,
        burstMax: 2,
        burstWindowMs: 500,
        prefix: 'burst-test',
      }),
    );
    app.get('/', (_req, res) => res.json({ ok: true }));

    await request(app).get('/').expect(200);
    await request(app).get('/').expect(200);
    const res = await request(app).get('/').expect(429);
    expect(res.body.reason).toBe('burst');
  });
});

// ── Adaptive limits ───────────────────────────────────────────────────────────

describe('adaptive rate limiting', () => {
  it('reduces effective limit under high error rate', async () => {
    // Set a high error rate — adaptive factor = 0.5
    updateAdaptiveLoad(0.6);

    const app = express();
    // max=4, adaptive=true → effective max = Math.floor(4 * 0.5) = 2
    app.use(
      createSlidingWindowRateLimiter({
        max: 4,
        adaptive: true,
        prefix: 'adaptive-test',
      }),
    );
    app.get('/', (_req, res) => res.json({ ok: true }));

    await request(app).get('/').expect(200);
    await request(app).get('/').expect(200);
    // Third request exceeds the reduced effective limit of 2
    await request(app).get('/').expect(429);
  });

  it('does not reduce limit when error rate is low', async () => {
    updateAdaptiveLoad(0.1);

    const app = express();
    app.use(
      createSlidingWindowRateLimiter({
        max: 4,
        adaptive: true,
        prefix: 'adaptive-ok-test',
      }),
    );
    app.get('/', (_req, res) => res.json({ ok: true }));

    for (let i = 0; i < 4; i++) {
      await request(app).get('/').expect(200);
    }
    await request(app).get('/').expect(429);
  });
});
