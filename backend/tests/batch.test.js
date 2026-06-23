import { describe, it, expect, beforeEach } from '@jest/globals';
import supertest from 'supertest';
import express from 'express';

// ── Minimal Express app for testing ──────────────────────────────────────────
// Self-contained so tests don't need a DB, Redis, or Sentry.

function buildTestApp() {
  const app = express();
  app.use(express.json());

  // Public route — always 200
  app.get('/api/health', (_req, res) => res.status(200).json({ status: 'ok' }));

  // Protected route — requires Authorization header
  app.get('/api/escrows/abc123', (req, res) => {
    if (!req.headers['authorization']) {
      return res.status(401).json({ error: 'Access denied. No token provided.' });
    }
    return res.status(200).json({ id: 'abc123', status: 'active' });
  });

  // POST route used for per-item body size tests
  app.post('/api/escrows', (_req, res) => res.status(201).json({ created: true }));

  // Simulated admin route — must be blocked by the batch RBAC layer
  app.get('/api/admin/users', (_req, res) => res.status(200).json({ users: [] }));

  // Batch route — guards against recursive sub-requests via x-batch-request header
  app.post('/api/batch', async (req, res) => {
    if (req.headers['x-batch-request']) {
      return res.status(400).json({ error: 'Recursive batch requests are not permitted.' });
    }
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
      // /api/escrows/not-found returns 404 because no route matches it in the test app
      { method: 'GET', url: '/api/escrows/not-found' },
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
    expect(res.body[0].body).toMatchObject({ id: 'abc123' });
  });

  it('Test 2b (Auth Propagation): returns 401 when no auth header is present on protected sub-request', async () => {
    const res = await request
      .post('/api/batch')
      .send([{ method: 'GET', url: '/api/escrows/abc123' }]);

    expect(res.status).toBe(200);
    expect(res.body[0].status).toBe(401);
  });

  it('Test 3 (Limit Enforcement): returns 400 when batch exceeds MAX_BATCH_SIZE', async () => {
    const oversizedBatch = Array.from({ length: 21 }, () => ({
      method: 'GET',
      url: '/api/health',
    }));

    const res = await request.post('/api/batch').send(oversizedBatch);

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/exceeds maximum/i);
  });

  it('returns 400 when body is not an array', async () => {
    const res = await request.post('/api/batch').send({ method: 'GET', url: '/api/health' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/array/i);
  });

  it('blocks sub-requests to /api/admin/* with a per-item 403, leaving other items unaffected', async () => {
    const res = await request
      .post('/api/batch')
      .set('Authorization', 'Bearer some-token')
      .send([
        { method: 'GET', url: '/api/health' },
        { method: 'GET', url: '/api/admin/users' },
      ]);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0].status).toBe(200);
    expect(res.body[1].status).toBe(403);
    expect(res.body[1].body.error).toMatch(/admin routes/i);
  });

  it('rejects the whole batch with 400 when any sub-request targets /api/batch (recursive)', async () => {
    const res = await request.post('/api/batch').send([
      { method: 'GET', url: '/api/health' },
      { method: 'POST', url: '/api/batch', body: [] },
    ]);

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/recursive/i);
  });

  it('returns per-item 413 for an oversized sub-request body while other items succeed', async () => {
    // JSON.stringify of this object is well over 64 KB
    const oversizedBody = { data: 'x'.repeat(65 * 1024) };

    const res = await request
      .post('/api/batch')
      .send([
        { method: 'GET', url: '/api/health' },
        { method: 'POST', url: '/api/escrows', body: oversizedBody },
      ]);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0].status).toBe(200);
    expect(res.body[1].status).toBe(413);
    expect(res.body[1].body.error).toMatch(/64 KB/i);
  });

  it('each result item includes { status: number, body: object } fields', async () => {
    const res = await request.post('/api/batch').send([{ method: 'GET', url: '/api/health' }]);

    expect(res.status).toBe(200);
    const item = res.body[0];
    expect(item).toHaveProperty('status');
    expect(item).toHaveProperty('body');
    expect(typeof item.status).toBe('number');
    expect(typeof item.body).toBe('object');
  });
});
