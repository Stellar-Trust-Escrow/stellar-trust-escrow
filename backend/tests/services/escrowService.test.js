import { jest, describe, expect, it } from '@jest/globals';

jest.unstable_mockModule('../../services/stellarService.js', () => ({
  submitTransaction: jest.fn().mockResolvedValue({ hash: 'txhash', status: 'SUCCESS' }),
  simulateTransaction: jest.fn().mockResolvedValue({ success: true, cost: { cpuInsns: '100', memBytes: '1024' } }),
  getLatestLedger: jest.fn().mockResolvedValue(1000),
  default: {},
}));

jest.unstable_mockModule('../../config/logger.js', () => ({
  createModuleLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
}));

jest.unstable_mockModule('../../services/escrowRealtime.js', () => ({
  emitEscrowEvent: jest.fn(),
}));

jest.unstable_mockModule('../../lib/prisma.js', () => ({
  default: {
    escrow: { findUnique: jest.fn().mockResolvedValue(null), update: jest.fn(), create: jest.fn() },
    milestone: { findUnique: jest.fn().mockResolvedValue(null), update: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
    auditLog: { create: jest.fn().mockResolvedValue({ id: 1n }) },
    $transaction: jest.fn(async (fn) => (typeof fn === 'function' ? fn({
      escrow: { findUnique: jest.fn().mockResolvedValue(null), update: jest.fn(), create: jest.fn() },
      milestone: { findUnique: jest.fn().mockResolvedValue(null), update: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
      auditLog: { create: jest.fn().mockResolvedValue({ id: 1n }) },
    }) : Promise.all(fn))),
  },
}));

jest.unstable_mockModule('../../lib/transaction.js', () => ({
  withTransaction: jest.fn(async (fn) => fn({
    escrow: { findUnique: jest.fn().mockResolvedValue(null), update: jest.fn(), create: jest.fn() },
    milestone: { findUnique: jest.fn().mockResolvedValue(null), update: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
    auditLog: { create: jest.fn().mockResolvedValue({ id: 1n }) },
  })),
}));

const svc = await import('../../services/escrowService.js');

describe('escrowService exports', () => {
  it('exports fundEscrow as a function', () => {
    expect(typeof svc.fundEscrow).toBe('function');
  });

  it('exports releaseMilestone as a function', () => {
    expect(typeof svc.releaseMilestone).toBe('function');
  });

  it('exports raiseDispute as a function', () => {
    expect(typeof svc.raiseDispute).toBe('function');
  });

  it('exports cancelEscrow as a function', () => {
    expect(typeof svc.cancelEscrow).toBe('function');
  });

  it('exports expireEscrow as a function', () => {
    expect(typeof svc.expireEscrow).toBe('function');
  });

  it('releaseMilestone rejects when escrow not found', async () => {
    await expect(
      svc.releaseMilestone({ escrowId: 999n, milestoneIndex: 0, amount: 100n, callerAddress: 'G' })
    ).rejects.toThrow();
  });

  it('raiseDispute rejects when escrow not found', async () => {
    await expect(
      svc.raiseDispute({ escrowId: 999n, raisedByAddress: 'G', milestoneIndex: 0 })
    ).rejects.toThrow();
  });

  it('cancelEscrow rejects when escrow not found', async () => {
    await expect(
      svc.cancelEscrow({ escrowId: 999n, cancelledBy: 'G', reason: 'test' })
    ).rejects.toThrow();
  });

  it('expireEscrow rejects when escrow not found', async () => {
    await expect(
      svc.expireEscrow({ escrowId: 999n, expiredLedger: 1001n })
    ).rejects.toThrow();
  });
});
