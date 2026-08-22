import { jest, describe, expect, it, beforeEach } from '@jest/globals';

jest.unstable_mockModule('../../services/stellarService.js', () => ({
  submitTransaction: jest.fn().mockResolvedValue({ hash: 'txhash', status: 'SUCCESS' }),
  simulateTransaction: jest.fn().mockResolvedValue({ success: true, cost: { cpuInsns: '100', memBytes: '1024' } }),
  getLatestLedger: jest.fn().mockResolvedValue(1000),
  default: {},
}));

jest.unstable_mockModule('../../config/logger.js', () => ({
  createModuleLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
}));

const { fundEscrow, releaseMilestone, raiseDispute, expireEscrow, cancelEscrow } =
  await import('../../services/escrowService.js');

const makeEscrow = (overrides = {}) => ({
  id: 1n,
  tenantId: 'default',
  status: 'Active',
  amount: 1000n,
  clientAddress: 'GCLIENT',
  freelancerAddress: 'GFREELANCER',
  arbiterAddress: 'GARBITER',
  milestoneCount: 1,
  approvedCount: 0,
  submittedCount: 0,
  platformFeeBps: 100n,
  ...overrides,
});

const makePrisma = () => ({
  escrow: {
    findUnique: jest.fn(),
    update: jest.fn(),
    create: jest.fn(),
  },
  milestone: {
    findUnique: jest.fn(),
    update: jest.fn(),
    findMany: jest.fn().mockResolvedValue([]),
  },
  auditLog: {
    create: jest.fn().mockResolvedValue({ id: 1n }),
  },
  $transaction: jest.fn(async (fn) => (typeof fn === 'function' ? fn(makePrisma()) : Promise.all(fn))),
});

describe('escrowService', () => {
  describe('fundEscrow', () => {
    it('throws if escrow not found', async () => {
      const prisma = makePrisma();
      prisma.escrow.findUnique.mockResolvedValue(null);
      await expect(fundEscrow({ escrowId: 999n, signedXdr: 'xdr', prisma })).rejects.toThrow();
    });

    it('throws if escrow is not in Pending state', async () => {
      const prisma = makePrisma();
      prisma.escrow.findUnique.mockResolvedValue(makeEscrow({ status: 'Active' }));
      await expect(fundEscrow({ escrowId: 1n, signedXdr: 'xdr', prisma })).rejects.toThrow();
    });
  });

  describe('releaseMilestone', () => {
    it('throws if escrow not found', async () => {
      const prisma = makePrisma();
      prisma.escrow.findUnique.mockResolvedValue(null);
      await expect(
        releaseMilestone({ escrowId: 999n, milestoneIndex: 0, amount: 100n, callerAddress: 'G', prisma })
      ).rejects.toThrow();
    });

    it('throws if milestone not found', async () => {
      const prisma = makePrisma();
      prisma.escrow.findUnique.mockResolvedValue(makeEscrow());
      prisma.milestone.findUnique.mockResolvedValue(null);
      await expect(
        releaseMilestone({ escrowId: 1n, milestoneIndex: 0, amount: 100n, callerAddress: 'GCLIENT', prisma })
      ).rejects.toThrow();
    });
  });

  describe('raiseDispute', () => {
    it('throws if escrow not found', async () => {
      const prisma = makePrisma();
      prisma.escrow.findUnique.mockResolvedValue(null);
      await expect(
        raiseDispute({ escrowId: 999n, raisedByAddress: 'G', milestoneIndex: 0, prisma })
      ).rejects.toThrow();
    });

    it('throws if caller is not a party to the escrow', async () => {
      const prisma = makePrisma();
      prisma.escrow.findUnique.mockResolvedValue(makeEscrow({ status: 'Active' }));
      prisma.milestone.findUnique.mockResolvedValue({ id: 1n, status: 'Submitted' });
      await expect(
        raiseDispute({ escrowId: 1n, raisedByAddress: 'GSTRANGER', milestoneIndex: 0, prisma })
      ).rejects.toThrow();
    });
  });

  describe('cancelEscrow', () => {
    it('throws if escrow not found', async () => {
      const prisma = makePrisma();
      prisma.escrow.findUnique.mockResolvedValue(null);
      await expect(
        cancelEscrow({ escrowId: 999n, cancelledBy: 'G', reason: 'test', prisma })
      ).rejects.toThrow();
    });
  });

  describe('expireEscrow', () => {
    it('throws if escrow not found', async () => {
      const prisma = makePrisma();
      prisma.escrow.findUnique.mockResolvedValue(null);
      await expect(
        expireEscrow({ escrowId: 999n, expiredLedger: 1001n, prisma })
      ).rejects.toThrow();
    });
  });
});
