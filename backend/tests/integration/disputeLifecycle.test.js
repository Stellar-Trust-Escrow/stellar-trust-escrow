/**
 * Integration tests for the dispute lifecycle HTTP endpoints.
 *
 * Uses the repo-level @prisma/client mock (see jest.config.mjs moduleNameMapper)
 * and stubs auth + timer queue so tests run without Redis or a live DB.
 */

import { jest } from '@jest/globals';
import express from 'express';
import supertest from 'supertest';

process.env.NODE_ENV = 'test';

// ── Silence logger ─────────────────────────────────────────────────────────────
jest.unstable_mockModule('../../config/logger.js', () => ({
  createModuleLogger: () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  }),
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    child: jest.fn(() => ({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    })),
  },
}));

// ── Mock auth middleware ───────────────────────────────────────────────────────
jest.unstable_mockModule('../../api/middleware/auth.js', () => ({
  default: (req, _res, next) => {
    req.user = { stellarAddress: 'GCLIENT', tenantId: 'test-tenant' };
    next();
  },
}));

// ── Mock adminAuth middleware ──────────────────────────────────────────────────
jest.unstable_mockModule('../../api/middleware/adminAuth.js', () => ({
  default: (req, _res, next) => {
    req.user = { stellarAddress: 'GADMIN', tenantId: 'test-tenant', isAdmin: true };
    next();
  },
}));

// ── Mock dispute timer queue ───────────────────────────────────────────────────
jest.unstable_mockModule('../../queues/disputeTimerQueue.js', () => ({
  scheduleEvidenceExpiry: jest.fn().mockResolvedValue({ id: 'timer-ev' }),
  scheduleAppealExpiry: jest.fn().mockResolvedValue({ id: 'timer-ap' }),
  disputeTimerQueue: { add: jest.fn().mockResolvedValue({ id: 'timer-1' }) },
  __resetForTests: jest.fn(),
}));

// ── Import after mocks ────────────────────────────────────────────────────────
const { default: disputeRoutes } = await import('../../api/routes/disputeRoutes.js');
const prisma = (await import('../../lib/prisma.js')).default;

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/disputes', disputeRoutes);
  return app;
}

const request = supertest(buildApp());

beforeEach(async () => {
  jest.clearAllMocks();
  // Clear dispute-related tables before each test
  await prisma.dispute.deleteMany({});
  await prisma.disputeEvidence.deleteMany({});
  await prisma.disputeAppeal.deleteMany({});
  await prisma.disputeRuling.deleteMany({});
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('POST /api/disputes/:escrowId/open', () => {
  it('creates a dispute and returns 201', async () => {
    const res = await request.post('/api/disputes/123/open').send({ reason: 'Work not delivered' });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ status: 'evidence_collection' });
  });
});

describe('POST /api/disputes/:disputeId/evidence', () => {
  let disputeId;

  beforeEach(async () => {
    // Seed a dispute in evidence_collection state with a known numeric ID
    const d = await prisma.dispute.create({
      data: {
        id: 100,
        tenantId: 'test-tenant',
        escrowId: BigInt(456),
        raisedByAddress: 'GCLIENT',
        raisedAt: new Date(),
        status: 'evidence_collection',
        evidenceDeadlineAt: new Date(Date.now() + 72 * 60 * 60 * 1000),
      },
    });
    disputeId = d.id;
  });

  it('attaches evidence and returns 200', async () => {
    const res = await request
      .post(`/api/disputes/${disputeId}/evidence`)
      .send({ description: 'Screenshot of chat', evidenceHash: 'abc123' });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ disputeId, submittedBy: 'GCLIENT' });
  });

  it('returns 422 EVIDENCE_LIMIT_REACHED after 5 items from same party', async () => {
    // Submit 5 evidence items
    for (let i = 0; i < 5; i++) {
      const r = await request
        .post(`/api/disputes/${disputeId}/evidence`)
        .send({ description: `Evidence ${i}`, evidenceHash: `hash${i}` });
      expect(r.status).toBe(200);
    }

    // 6th item from same party should be rejected
    const res = await request
      .post(`/api/disputes/${disputeId}/evidence`)
      .send({ description: 'Extra evidence', evidenceHash: 'extra' });

    expect(res.status).toBe(422);
    expect(res.body.code).toBe('EVIDENCE_LIMIT_REACHED');
  });
});

describe('POST /api/disputes/:disputeId/rule', () => {
  it('returns 422 INVALID_SPLIT when percentages do not add up to 100', async () => {
    // Seed a dispute in arbiter_review with the authenticated user as arbiter
    await prisma.dispute.create({
      data: {
        id: 200,
        tenantId: 'test-tenant',
        escrowId: BigInt(789),
        raisedByAddress: 'GCLIENT',
        raisedAt: new Date(),
        status: 'arbiter_review',
        arbiter: 'GCLIENT', // matches req.user.stellarAddress
      },
    });

    const res = await request
      .post('/api/disputes/200/rule')
      .send({ clientPct: 60, freelancerPct: 60, reasoning: 'Both at fault' });

    expect(res.status).toBe(422);
    expect(res.body.code).toBe('INVALID_SPLIT');
  });
});

describe('POST /api/disputes/:disputeId/appeal', () => {
  it('returns 409 NOT_IN_APPEAL_WINDOW when dispute is not in ruled/appeal_window status', async () => {
    // Seed a dispute that is still in evidence_collection (not yet ruled)
    await prisma.dispute.create({
      data: {
        id: 300,
        tenantId: 'test-tenant',
        escrowId: BigInt(999),
        raisedByAddress: 'GCLIENT',
        raisedAt: new Date(),
        status: 'evidence_collection',
      },
    });

    const res = await request
      .post('/api/disputes/300/appeal')
      .send({ groundsText: 'Unfair ruling' });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('NOT_IN_APPEAL_WINDOW');
  });
});
