import { describe, it, expect, beforeEach } from '@jest/globals';
import supertest from 'supertest';
import express from 'express';

// ── Minimal Express app for testing ──────────────────────────────────────────
// We build a self-contained app so tests don't need a DB or Sentry.

function buildTestApp() {
  const app = express();
  app.use(express.json());

  // Public route — always succeeds
  app.get('/api/health', (_req, res) => res.status(200).json({ status: 'ok' }));

  // Public route — always 404
  app.get('/api/not-found', (_req, res) => res.status(404).json({ error: 'Not found' }));

  // Protected route — requires Authorization header
  app.get('/api/escrows/abc123', (req, res) => {
    if (!req.headers['authorization']) {
      return res.status(401).json({ error: 'Access denied. No token provided.' });
    }
    return res.status(200).json({ id: 'abc123', status: 'active' });
  });

  // Batch route (must come after the routes it will dispatch to)
  app.post('/api/batch', async (req, res) => {
    const { handleBatch } = await import('../api/controllers/batchController.js');
    return handleBatch(req, res);
  });

  return app;
}

describe('POST /api/batch', () => {
  let app;
  let request;

  beforeEach(() => {
    app = buildTestApp();
    request = supertest(app);
  });

  it('Test 1 (Mixed Results): returns correct status codes for each sub-request', async () => {
    const res = await request.post('/api/batch').send([
      { method: 'GET', url: '/api/health' },
      { method: 'GET', url: '/api/health' },
      { method: 'GET', url: '/api/not-found' },
    ]);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(3);
    expect(res.body[0].status).toBe(200);
    expect(res.body[1].status).toBe(200);
    expect(res.body[2].status).toBe(404);
  });

  it('Test 2 (Auth Propagation): propagates parent Authorization header to protected sub-requests', async () => {
    const token = 'Bearer test-token-xyz';

    const res = await request
      .post('/api/batch')
      .set('Authorization', token)
      .send([{ method: 'GET', url: '/api/escrows/abc123' }]);

    expect(res.status).toBe(200);
    expect(res.body[0].status).toBe(200);
    expect(res.body[0].data).toMatchObject({ id: 'abc123' });
  });

  it('Test 2b (Auth Propagation): returns 401 when no auth header is present on protected sub-request', async () => {
    const res = await request
      .post('/api/batch')
      .send([{ method: 'GET', url: '/api/escrows/abc123' }]);

    expect(res.status).toBe(200);
    expect(res.body[0].status).toBe(401);
  });

  it('Test 3 (Limit Enforcement): returns 413 when batch exceeds MAX_BATCH_SIZE', async () => {
    const oversizedBatch = Array.from({ length: 21 }, () => ({
      method: 'GET',
      url: '/api/health',
    }));

    const res = await request.post('/api/batch').send(oversizedBatch);

    expect(res.status).toBe(413);
    expect(res.body.error).toMatch(/exceeds maximum/i);
  });

  it('returns 400 when body is not an array', async () => {
    const res = await request.post('/api/batch').send({ method: 'GET', url: '/api/health' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/array/i);
  });
});
