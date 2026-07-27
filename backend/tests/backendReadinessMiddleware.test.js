import express from 'express';
import request from 'supertest';
import { describe, expect, it } from '@jest/globals';

import idempotencyMiddleware from '../api/middleware/idempotency.js';
import zodValidationMiddleware from '../api/middleware/zodValidation.js';
import { buildPaginatedResponse, parsePagination } from '../lib/pagination.js';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(zodValidationMiddleware);
  app.use(idempotencyMiddleware);
  app.post('/api/escrows/broadcast', (req, res) => {
    res.status(201).json({ accepted: true, signedXdr: req.body.signedXdr });
  });
  return app;
}

describe('backend production readiness middleware', () => {
  it('rejects mutating API requests without an idempotency key', async () => {
    const res = await request(buildApp()).post('/api/escrows/broadcast').send({ signedXdr: 'xdr' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('IDEMPOTENCY_KEY_REQUIRED');
  });

  it('replays matching requests with the same idempotency key', async () => {
    const app = buildApp();
    const first = await request(app)
      .post('/api/escrows/broadcast')
      .set('Idempotency-Key', 'idem-key-123')
      .send({ signedXdr: 'xdr' });
    const second = await request(app)
      .post('/api/escrows/broadcast')
      .set('Idempotency-Key', 'idem-key-123')
      .send({ signedXdr: 'xdr' });

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.headers['idempotency-replayed']).toBe('true');
    expect(second.body).toEqual(first.body);
  });

  it('rejects invalid Zod-validated request bodies', async () => {
    const res = await request(buildApp())
      .post('/api/escrows/broadcast')
      .set('Idempotency-Key', 'idem-key-456')
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('cursor pagination compatibility', () => {
  it('emits a cursor that can request the next page', () => {
    const first = parsePagination({ limit: '2' });
    const response = buildPaginatedResponse(['a', 'b'], {
      total: 5,
      page: first.page,
      limit: first.limit,
    });
    const second = parsePagination({ limit: '2', cursor: response.nextCursor });

    expect(response.nextCursor).toBeTruthy();
    expect(second.skip).toBe(2);
    expect(second.page).toBe(2);
  });
});
