import { jest, describe, expect, it, beforeEach } from '@jest/globals';
import express from 'express';
import request from 'supertest';

const prismaMock = {
  $transaction: jest.fn(async (operations) => Promise.all(operations)),
  dispute: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    count: jest.fn(),
  },
};

const cacheMock = {
  get: jest.fn(),
  set: jest.fn(),
};

jest.unstable_mockModule('../lib/prisma.js', () => ({ default: prismaMock }));
jest.unstable_mockModule('../lib/cache.js', () => ({ default: cacheMock }));

const { default: disputeRoutes } = await import('../api/routes/disputeRoutes.js');

function buildApp() {
  const app = express();
  app.use('/api/disputes', disputeRoutes);
  return app;
}

beforeEach(() => {
  jest.clearAllMocks();
  cacheMock.get.mockReturnValue(null);
  prismaMock.dispute.findMany.mockResolvedValue([]);
  prismaMock.dispute.count.mockResolvedValue(0);
  prismaMock.dispute.findUnique.mockResolvedValue(null);
});

describe('dispute route validation', () => {
  it('accepts GET / with valid pagination query', async () => {
    const app = buildApp();
    const res = await request(app).get('/api/disputes').query({ page: '2', limit: '10' });
    expect(res.status).toBe(200);
    expect(prismaMock.$transaction).toHaveBeenCalled();
  });

  it('accepts GET / with no query (defaults in controller)', async () => {
    const app = buildApp();
    const res = await request(app).get('/api/disputes');
    expect(res.status).toBe(200);
  });

  it('returns 400 for non-integer page', async () => {
    const app = buildApp();
    const res = await request(app).get('/api/disputes').query({ page: 'abc' });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      error: 'Validation failed',
      details: expect.arrayContaining([
        expect.objectContaining({
          field: 'page',
          location: 'query',
        }),
      ]),
    });
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('returns 400 when limit exceeds maximum (100)', async () => {
    const app = buildApp();
    const res = await request(app).get('/api/disputes').query({ limit: '500' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation failed');
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('returns 400 for page less than 1', async () => {
    const app = buildApp();
    const res = await request(app).get('/api/disputes').query({ page: '0' });
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid escrowId param', async () => {
    const app = buildApp();
    const res = await request(app).get('/api/disputes/not-a-number');
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      error: 'Validation failed',
      details: expect.arrayContaining([
        expect.objectContaining({
          field: 'escrowId',
          location: 'params',
        }),
      ]),
    });
    expect(prismaMock.dispute.findUnique).not.toHaveBeenCalled();
  });

  it('returns 400 for escrowId zero', async () => {
    const app = buildApp();
    const res = await request(app).get('/api/disputes/0');
    expect(res.status).toBe(400);
  });

  it('accepts numeric escrowId and reaches controller', async () => {
    const app = buildApp();
    // Use numeric escrowId in the mock so JSON.stringify (res.json) succeeds; Prisma
    // returns BigInt in production — serialization is handled separately if needed.
    prismaMock.dispute.findUnique.mockResolvedValue({
      escrowId: 42,
      raisedByAddress: 'GTEST',
      raisedAt: new Date(),
      resolvedAt: null,
      resolution: null,
      escrow: {},
    });
    const res = await request(app).get('/api/disputes/42');
    expect(res.status).toBe(200);
    expect(prismaMock.dispute.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { escrowId: 42n },
      }),
    );
  });
});
