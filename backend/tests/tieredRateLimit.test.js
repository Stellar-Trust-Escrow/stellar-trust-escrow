import { describe, it, expect, beforeEach } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import rateLimit from 'express-rate-limit';

// Build a test app with an explicit in-memory rate limiter (no Redis in tests)
function buildApp({ max, windowMs = 60_000 } = {}) {
  const app = express();
  app.set('trust proxy', true);

  const limiter = rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res, _next, options) => {
      const resetTime = req.rateLimit?.resetTime;
      const retryAfter = resetTime
        ? Math.max(1, Math.ceil((resetTime.getTime() - Date.now()) / 1000))
        : Math.ceil(windowMs / 1000);
      res.set('Retry-After', String(retryAfter));
      res.status(options.statusCode).json({
        error: 'Too many requests. Please retry after the indicated time.',
        code: 'RATE_LIMIT_EXCEEDED',
        retryAfter,
      });
    },
  });

  app.use(limiter);
  app.get('/resource', (_req, res) => res.json({ ok: true }));
  app.post('/resource', (_req, res) => res.json({ ok: true }));
  return app;
}

describe('tiered rate limiting', () => {
  describe('auth tier (max 10 req/min)', () => {
    const AUTH_MAX = 10;

    it('allows requests under the limit', async () => {
      const app = buildApp({ max: AUTH_MAX });
      for (let i = 0; i < AUTH_MAX; i++) {
        await request(app).get('/resource').expect(200);
      }
    });

    it('blocks the (max+1)th request with 429', async () => {
      const app = buildApp({ max: AUTH_MAX });
      for (let i = 0; i < AUTH_MAX; i++) {
        await request(app).get('/resource');
      }
      const res = await request(app).get('/resource').expect(429);
      expect(res.body.code).toBe('RATE_LIMIT_EXCEEDED');
    });

    it('includes Retry-After header on 429', async () => {
      const app = buildApp({ max: 1 });
      await request(app).get('/resource');
      const res = await request(app).get('/resource').expect(429);
      expect(res.headers['retry-after']).toBeDefined();
      expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
    });

    it('returns structured error body', async () => {
      const app = buildApp({ max: 1 });
      await request(app).get('/resource');
      const res = await request(app).get('/resource').expect(429);
      expect(res.body).toMatchObject({
        error: expect.any(String),
        code: 'RATE_LIMIT_EXCEEDED',
        retryAfter: expect.any(Number),
      });
    });
  });

  describe('write tier (max 60 req/min)', () => {
    const WRITE_MAX = 60;

    it('allows requests under the write limit', async () => {
      const app = buildApp({ max: WRITE_MAX });
      for (let i = 0; i < 5; i++) {
        await request(app).post('/resource').expect(200);
      }
    });

    it('blocks when write limit is exceeded', async () => {
      const app = buildApp({ max: 3 });
      for (let i = 0; i < 3; i++) {
        await request(app).post('/resource');
      }
      await request(app).post('/resource').expect(429);
    });
  });

  describe('read tier (max 300 req/min)', () => {
    it('allows many read requests within limit', async () => {
      const app = buildApp({ max: 300 });
      for (let i = 0; i < 10; i++) {
        await request(app).get('/resource').expect(200);
      }
    });
  });

  describe('recovery after window reset', () => {
    it('allows requests again after the window resets', async () => {
      const windowMs = 100; // 100ms for test
      const app = buildApp({ max: 1, windowMs });

      await request(app).get('/resource').expect(200);
      await request(app).get('/resource').expect(429);

      // Wait for window to expire
      await new Promise((r) => setTimeout(r, windowMs + 50));

      await request(app).get('/resource').expect(200);
    });
  });
});
