/**
 * Integration tests for GET/PUT /api/escrows/:id/approvals endpoints.
 */

import { jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';

const logMock = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
jest.unstable_mockModule('../config/logger.js', () => ({
  createModuleLogger: () => logMock,
  getLogger: () => logMock,
}));

const prismaMock = {
  escrowApprovers: {
    findUnique: jest.fn(),
    upsert: jest.fn(),
  },
  milestone: { findMany: jest.fn() },
  milestoneApprovalRecord: {
    findMany: jest.fn(),
    upsert: jest.fn(),
  },
};
jest.unstable_mockModule('../lib/prisma.js', () => ({ default: prismaMock }));

jest.unstable_mockModule('../api/middleware/auth.js', () => ({
  default: (_req, _res, next) => next(),
}));

// Stub SorobanRpc so no network calls
jest.unstable_mockModule('@stellar/stellar-sdk', () => ({
  SorobanRpc: {
    Server: jest.fn().mockImplementation(() => ({
      getAccount: jest.fn().mockResolvedValue({ id: 'GABC', sequence: '0' }),
      simulateTransaction: jest.fn().mockResolvedValue({ error: 'sim_not_needed' }),
    })),
    Api: { isSimulationError: jest.fn().mockReturnValue(true) },
    assembleTransaction: jest.fn(),
  },
  TransactionBuilder: jest.fn().mockImplementation(() => ({
    addOperation: jest.fn().mockReturnThis(),
    setTimeout: jest.fn().mockReturnThis(),
    build: jest.fn().mockReturnValue({ toXDR: () => 'mock_xdr' }),
  })),
  Networks: {
    TESTNET: 'Test SDF Network ; September 2015',
    PUBLIC: 'Public Global Stellar Network ; September 2015',
  },
  Operation: { invokeContractFunction: jest.fn().mockReturnValue({}) },
  xdr: {
    ScVal: { scvAddress: jest.fn(), scvU64: jest.fn(), scvU32: jest.fn() },
    ScAddress: { scAddressTypeAccount: jest.fn(), scAddressTypeContract: jest.fn() },
    PublicKey: { publicKeyTypeEd25519: jest.fn() },
    Uint256: { fromXDR: jest.fn() },
    Uint64: { fromString: jest.fn().mockReturnValue({}) },
    Hash: { fromXDR: jest.fn() },
  },
  Address: jest.fn(),
  scValToNative: (v) => v,
}));

const thresholdRoutes = (await import('../api/routes/thresholdRoutes.js')).default;

const app = express();
app.use(express.json());
app.use('/api/escrows/:id/approvals', thresholdRoutes);

beforeEach(() => jest.clearAllMocks());

// ── GET /api/escrows/:id/approvals ────────────────────────────────────────────

describe('GET /api/escrows/:id/approvals', () => {
  it('returns config and pending milestones', async () => {
    prismaMock.escrowApprovers.findUnique.mockResolvedValue({
      escrowId: 'esc1',
      approvers: ['GABC', 'GDEF'],
      threshold: 2,
    });
    prismaMock.milestone.findMany.mockResolvedValue([{ id: 0, status: 'Submitted' }]);
    prismaMock.milestoneApprovalRecord.findMany.mockResolvedValue([
      { approver: 'GABC', approvedAt: new Date(), txHash: null },
    ]);

    const res = await request(app).get('/api/escrows/esc1/approvals');
    expect(res.status).toBe(200);
    expect(res.body.threshold).toBe(2);
    expect(res.body.approvers).toHaveLength(2);
    expect(res.body.pendingMilestones).toHaveLength(1);
  });

  it('defaults to threshold 1 when no config exists', async () => {
    prismaMock.escrowApprovers.findUnique.mockResolvedValue(null);
    prismaMock.milestone.findMany.mockResolvedValue([]);
    prismaMock.milestoneApprovalRecord.findMany.mockResolvedValue([]);

    const res = await request(app).get('/api/escrows/esc2/approvals');
    expect(res.status).toBe(200);
    expect(res.body.threshold).toBe(1);
  });
});

// ── GET /api/escrows/:id/approvals/:milestoneId ───────────────────────────────

describe('GET /api/escrows/:id/approvals/:milestoneId', () => {
  it('returns milestone vote status', async () => {
    prismaMock.escrowApprovers.findUnique.mockResolvedValue({
      escrowId: 'esc1',
      approvers: ['GABC', 'GDEF'],
      threshold: 2,
    });
    prismaMock.milestoneApprovalRecord.findMany.mockResolvedValue([
      { approver: 'GABC', approvedAt: new Date(), txHash: null },
    ]);

    const res = await request(app).get('/api/escrows/esc1/approvals/0');
    expect(res.status).toBe(200);
    expect(res.body.votesCount).toBe(1);
    expect(res.body.thresholdMet).toBe(false);
    expect(res.body.votes[0].approver).toBe('GABC');
  });
});

// ── PUT /api/escrows/:id/approvals/config ─────────────────────────────────────

describe('PUT /api/escrows/:id/approvals/config', () => {
  it('returns 400 when approvers is empty', async () => {
    const res = await request(app)
      .put('/api/escrows/esc1/approvals/config')
      .send({ approvers: [], threshold: 1, callerAddress: 'GABC' });
    expect(res.status).toBe(400);
  });

  it('returns 400 when threshold exceeds approvers count', async () => {
    const res = await request(app)
      .put('/api/escrows/esc1/approvals/config')
      .send({ approvers: ['GABC'], threshold: 3, callerAddress: 'GABC' });
    expect(res.status).toBe(400);
  });

  it('returns 400 from sim error (mocked)', async () => {
    prismaMock.escrowApprovers.upsert.mockResolvedValue({});
    const res = await request(app)
      .put('/api/escrows/esc1/approvals/config')
      .send({ approvers: ['GABC', 'GDEF'], threshold: 2, callerAddress: 'GABC' });
    // Our mock returns isSimulationError=true, so 400
    expect(res.status).toBe(400);
  });
});
