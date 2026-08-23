import { jest } from '@jest/globals';

const loggerMock = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };

jest.unstable_mockModule('../config/logger.js', () => ({
  createModuleLogger: () => loggerMock,
}));

const mockEscrow = { id: 1n, tenantId: 'tenant1' };
const mockDispute = {
  id: 42,
  tenantId: 'tenant1',
  escrowId: 1n,
  raisedByAddress: 'GRAISER',
  raisedAt: new Date('2026-01-01'),
  resolvedAt: null,
  resolvedBy: null,
  resolution: null,
  resolutionType: null,
  autoResolved: false,
  escalationCount: 0,
  evidence: [],
};

const prismaMock = {
  escrow: { findUnique: jest.fn() },
  dispute: {
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  disputeEvidence: { create: jest.fn() },
};

jest.unstable_mockModule('../lib/prisma.js', () => ({ default: prismaMock }));

jest.unstable_mockModule('../services/auditService.js', () => ({
  log: jest.fn().mockResolvedValue(undefined),
  AuditCategory: { DISPUTE: 'DISPUTE' },
  AuditAction: { DISPUTE_RAISED: 'DISPUTE_RAISED', DISPUTE_RESOLVED: 'DISPUTE_RESOLVED' },
}));

const { raiseDispute, resolveDispute, getDisputeStatus } = await import('../services/disputeArbitrationService.js');

beforeEach(() => jest.clearAllMocks());

describe('disputeArbitrationService', () => {
  describe('raiseDispute', () => {
    test('creates a new dispute and returns RAISED status', async () => {
      prismaMock.escrow.findUnique.mockResolvedValue(mockEscrow);
      prismaMock.dispute.findUnique.mockResolvedValue(null);
      prismaMock.dispute.create.mockResolvedValue(mockDispute);

      const result = await raiseDispute('1', 'GRAISER', 'Payment not received', null);

      expect(result.status).toBe('RAISED');
      expect(result.escrowId).toBe('1');
      expect(result.raisedByAddress).toBe('GRAISER');
      expect(prismaMock.dispute.create).toHaveBeenCalledTimes(1);
    });

    test('stores evidence when evidenceHash provided', async () => {
      prismaMock.escrow.findUnique.mockResolvedValue(mockEscrow);
      prismaMock.dispute.findUnique.mockResolvedValue(null);
      prismaMock.dispute.create.mockResolvedValue(mockDispute);
      prismaMock.disputeEvidence.create.mockResolvedValue({});

      await raiseDispute('1', 'GRAISER', 'Reason', 'abc123hash');

      expect(prismaMock.disputeEvidence.create).toHaveBeenCalledTimes(1);
    });

    test('throws 404 when escrow not found', async () => {
      prismaMock.escrow.findUnique.mockResolvedValue(null);

      await expect(raiseDispute('99', 'GRAISER', 'reason', null)).rejects.toMatchObject({
        code: 'ESCROW_NOT_FOUND',
        status: 404,
      });
    });

    test('throws 409 when dispute already exists', async () => {
      prismaMock.escrow.findUnique.mockResolvedValue(mockEscrow);
      prismaMock.dispute.findUnique.mockResolvedValue(mockDispute);

      await expect(raiseDispute('1', 'GRAISER', 'reason', null)).rejects.toMatchObject({
        code: 'DISPUTE_EXISTS',
        status: 409,
      });
    });
  });

  describe('resolveDispute', () => {
    test('updates dispute and returns RESOLVED status', async () => {
      prismaMock.dispute.findUnique.mockResolvedValue(mockDispute);
      prismaMock.escrow.findUnique.mockResolvedValue(mockEscrow);
      const resolvedDispute = { ...mockDispute, resolvedAt: new Date(), resolvedBy: 'GARB', resolution: 'BUYER_WINS', resolutionType: 'MANUAL' };
      prismaMock.dispute.update.mockResolvedValue(resolvedDispute);

      const result = await resolveDispute('1', 'BUYER_WINS', 'GARB', 'BUYER_WINS');

      expect(result.status).toBe('RESOLVED');
      expect(result.arbitratorAddress).toBe('GARB');
      expect(prismaMock.dispute.update).toHaveBeenCalledTimes(1);
    });

    test('throws 404 when no dispute exists', async () => {
      prismaMock.dispute.findUnique.mockResolvedValue(null);

      await expect(resolveDispute('1', 'resolution', 'GARB')).rejects.toMatchObject({
        code: 'DISPUTE_NOT_FOUND',
        status: 404,
      });
    });

    test('throws 409 when dispute already resolved', async () => {
      prismaMock.dispute.findUnique.mockResolvedValue({ ...mockDispute, resolvedAt: new Date() });

      await expect(resolveDispute('1', 'resolution', 'GARB')).rejects.toMatchObject({
        code: 'DISPUTE_RESOLVED',
        status: 409,
      });
    });
  });

  describe('getDisputeStatus', () => {
    test('returns NONE when no dispute exists', async () => {
      prismaMock.dispute.findUnique.mockResolvedValue(null);

      const result = await getDisputeStatus('1');

      expect(result.status).toBe('NONE');
      expect(result.escrowId).toBe('1');
    });

    test('returns RAISED for an unresolved dispute', async () => {
      prismaMock.dispute.findUnique.mockResolvedValue({ ...mockDispute, evidence: [] });

      const result = await getDisputeStatus('1');

      expect(result.status).toBe('RAISED');
      expect(result.disputeId).toBe(42);
    });

    test('returns RESOLVED for a resolved dispute', async () => {
      prismaMock.dispute.findUnique.mockResolvedValue({
        ...mockDispute,
        resolvedAt: new Date(),
        resolvedBy: 'GARB',
        evidence: [],
      });

      const result = await getDisputeStatus('1');

      expect(result.status).toBe('RESOLVED');
      expect(result.resolvedBy).toBe('GARB');
    });
  });
});
