import { describe, expect, it, beforeEach, afterEach, jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';

import { rateLimiter, getUsageStore } from '../../api/middleware/rateLimiter.js';

const brokenRedis = {
  eval: async () => {
    throw new Error('Redis unavailable');
  },
};

function buildApp({ windowMs = 1000, limit = 10, keyPrefix = 'test', redisClient = brokenRedis } = {}) {
  const app = express();
  app.use(express.json());
  app.use(rateLimiter({ windowMs, limit, keyPrefix, redisClient }));
  app.post('/api/v1/auth/login', (_req, res) => res.json({ ok: true }));
  app.get('/', (_req, res) => res.json({ ok: true }));
  return app;
}

beforeEach(() => {
  getUsageStore().clear();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('rateLimiter middleware', () => {
  it('allows requests until the configured limit and rejects the next request', async () => {
    const app = buildApp({ windowMs: 1000, limit: 10 });

    for (let i = 0; i < 10; i += 1) {
      await request(app).get('/').expect(200);
    }

    const res = await request(app).get('/').expect(429);
    expect(res.body.error).toEqual(
      expect.objectContaining({
        code: 'RATE_LIMITED',
      }),
    );
    expect(res.headers['retry-after']).toBeDefined();
  });

  it('rejects a boundary burst at window edge after 10 requests in the previous window', async () => {
    const windowMs = 1000;
    const app = buildApp({ windowMs, limit: 10 });

    const originalNow = Date.now;
    let now = 0;
    // eslint-disable-next-line no-global-assign
    Date.now = () => now;

    try {
      for (let i = 0; i < 5; i += 1) {
        await request(app).get('/').expect(200);
      }

      now = windowMs - 1;
      for (let i = 0; i < 5; i += 1) {
        await request(app).get('/').expect(200);
      }

      now = windowMs;
      await request(app).get('/').expect(429);
    } finally {
      // eslint-disable-next-line no-global-assign
      Date.now = originalNow;
    }
  });

  it('activates in-memory fallback when Redis is unavailable and enforces the limit', async () => {
    const app = buildApp({ limit: 2 });

    await request(app).get('/').expect(200);
    await request(app).get('/').expect(200);

    const res = await request(app).get('/').expect(429);
    expect(res.body.error.code).toBe('RATE_LIMITED');
    expect(res.headers['retry-after']).toBeDefined();
  });

  it('returns 429 on POST /api/v1/auth/login after 5 requests in 15 minutes', async () => {
    const windowMs = 15 * 60 * 1000;
    const brokenRedis = { eval: async () => { throw new Error('Redis unavailable'); } };
    const app = express();
    app.use(express.json());
    app.post(
      '/api/v1/auth/login',
      rateLimiter({ windowMs, limit: 5, keyPrefix: `auth-login-${Math.random().toString(36).slice(2)}`, redisClient: brokenRedis }),
      (_req, res) => res.json({ ok: true }),
    );

    for (let i = 0; i < 5; i += 1) {
      await request(app).post('/api/v1/auth/login').expect(200);
    }

    const res = await request(app).post('/api/v1/auth/login').expect(429);
    expect(res.body.error).toEqual(
      expect.objectContaining({
        code: 'RATE_LIMITED',
      }),
    );
    expect(res.headers['retry-after']).toBeDefined();
  });
});
