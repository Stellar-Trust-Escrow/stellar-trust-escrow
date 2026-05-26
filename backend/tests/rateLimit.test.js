import { describe, expect, it } from '@jest/globals';
import express from 'express';
import request from 'supertest';

import { createRateLimitMiddleware } from '../middleware/rateLimit.js';

function buildTestApp(options) {
  const app = express();
  app.set('trust proxy', true);
  app.use(createRateLimitMiddleware(options));
  app.get('/limited', (_req, res) => {
    res.status(200).json({ ok: true });
  });
  return app;
}

describe('rate limit middleware', () => {
  it('limits repeated requests from the same IP', async () => {
    const app = buildTestApp({
      max: 2,
      windowMs: 60 * 1000,
      prefix: 'test-ip',
      message: 'Too many requests',
    });

    await request(app).get('/limited').expect(200);
    await request(app).get('/limited').expect(200);

    const response = await request(app).get('/limited').expect(429);

    expect(response.body).toEqual({
      error: 'Too many requests',
      code: 'RATE_LIMIT_EXCEEDED',
    });
    expect(response.headers['retry-after']).toBeDefined();
  });

  it('tracks authenticated users separately even when the IP is shared', async () => {
    const app = buildTestApp({
      max: 2,
      windowMs: 60 * 1000,
      prefix: 'test-user',
      message: 'Too many requests',
    });

    await request(app).get('/limited').set('X-User-Id', 'user-a').expect(200);
    await request(app).get('/limited').set('X-User-Id', 'user-a').expect(200);
    await request(app).get('/limited').set('X-User-Id', 'user-b').expect(200);
    await request(app).get('/limited').set('X-User-Id', 'user-b').expect(200);

    await request(app).get('/limited').set('X-User-Id', 'user-a').expect(429);
  });
});
