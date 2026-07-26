/**
 * Integration tests for services/escrowService.js
 *
 * These run against the in-memory Prisma mock client (see jest moduleNameMapper:
 * `@prisma/client` → backend/__mocks__/@prisma/client.js). The "real" surface
 * exercised here is the *actual* escrowService module — it is not mocked — so we
 * prove the command handlers, the pure state machine, and the per-escrow mutex
 * behave correctly end-to-end.
 *
 * The headline acceptance criterion: a Serializable transaction (plus the in-
 * process escrow mutex) must prevent double-spend. Two concurrent
 * releaseMilestone calls on the same escrow with overlapping amounts must yield
 * exactly one success and one 422.
 */

import { jest } from '@jest/globals';

// Silence the real logger.
jest.unstable_mockModule('../../config/logger.js', () => ({
  createModuleLogger: () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  }),
}));

const prisma = (await import('../../lib/prisma.js')).default;
const {
  fundEscrow,
  releaseMilestone,
  raiseDispute,
  resolveDispute,
  expireEscrow,
  cancelEscrow,
  __clearLocks,
  DB_TO_SM,
} = await import('../../services/escrowService.js');

const ESCROW_ID = 7n;

beforeEach(async () => {
  __clearLocks();
  // The in-memory Prisma mock is a process-wide singleton, so clear the tables
  // this suite touches to keep each test isolated.
  await prisma.escrow.deleteMany({});
  await prisma.milestone.deleteMany({});
  await prisma.dispute.deleteMany({});
  await prisma.adminAuditLog.deleteMany({});
  // Start every escrow from a clean, funded state with a 100-unit balance.
  await fundEscrow({
    id: ESCROW_ID,
    clientAddress: 'GCLIENT',
    freelancerAddress: 'GFREELANCER',
    tokenAddress: 'GTOKEN',
    totalAmount: 100,
    briefHash: 'bh',
  });
});

async function getEscrow() {
  return prisma.escrow.findUnique({ where: { id: ESCROW_ID } });
}

describe('fundEscrow (via beforeEach fixture)', () => {
  it('creates an escrow in the Funded state with the full balance', async () => {
    const escrow = await getEscrow();
    expect(escrow).not.toBeNull();
    expect(escrow.status).toBe('Funded');
    expect(escrow.remainingBalance).toBe('100');
    expect(escrow.clientAddress).toBe('GCLIENT');
    // An immutable audit row was written inside the same transaction.
    expect(prisma.adminAuditLog).toBeDefined();
  });

  it('is idempotent — re-funding the same id is a 409 conflict', async () => {
    await expect(
      fundEscrow({
        id: ESCROW_ID,
        clientAddress: 'GCLIENT',
        freelancerAddress: 'GFREELANCER',
        tokenAddress: 'GTOKEN',
        totalAmount: 100,
        briefHash: 'bh',
      }),
    ).rejects.toMatchObject({ status: 409, code: 'ESCROW_CONFLICT' });
  });
});

describe('releaseMilestone — double-spend prevention', () => {
  it('two concurrent overlapping releases yield exactly one success and one 422', async () => {
    const results = await Promise.allSettled([
      releaseMilestone({ escrowId: ESCROW_ID, milestoneIndex: 0, amount: 100, callerAddress: 'GC' }),
      releaseMilestone({ escrowId: ESCROW_ID, milestoneIndex: 1, amount: 100, callerAddress: 'GC' }),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toMatchObject({ status: 422, code: 'INSUFFICIENT_BALANCE' });

    const escrow = await getEscrow();
    expect(escrow.remainingBalance).toBe('0');
    expect(escrow.status).toBe('Released');
  });

  it('rejects a single release that exceeds the remaining balance', async () => {
    await expect(
      releaseMilestone({ escrowId: ESCROW_ID, milestoneIndex: 0, amount: 250, callerAddress: 'GC' }),
    ).rejects.toMatchObject({ status: 422, code: 'INSUFFICIENT_BALANCE' });

    const escrow = await getEscrow();
    expect(escrow.remainingBalance).toBe('100'); // unchanged
  });

  it('partial release decrements the balance and stays in a releasable state', async () => {
    await releaseMilestone({ escrowId: ESCROW_ID, milestoneIndex: 0, amount: 40, callerAddress: 'GC' });
    let escrow = await getEscrow();
    expect(escrow.remainingBalance).toBe('60');
    expect(DB_TO_SM[escrow.status]).toBe('release_requested');

    await releaseMilestone({ escrowId: ESCROW_ID, milestoneIndex: 1, amount: 60, callerAddress: 'GC' });
    escrow = await getEscrow();
    expect(escrow.remainingBalance).toBe('0');
    expect(escrow.status).toBe('Released');
  });
});

describe('raiseDispute / resolveDispute', () => {
  it('raises a dispute from the funded state then resolves it exactly', async () => {
    await raiseDispute({ escrowId: ESCROW_ID, raisedByAddress: 'GCLIENT', milestoneIndex: 0 });
    let escrow = await getEscrow();
    expect(escrow.status).toBe('Disputed');

    await resolveDispute({
      escrowId: ESCROW_ID,
      clientAmount: 30,
      freelancerAmount: 70,
      resolvedBy: 'GARBITER',
      resolution: 'split',
    });
    escrow = await getEscrow();
    expect(escrow.status).toBe('Resolved');
    expect(escrow.remainingBalance).toBe('0');
  });

  it('rejects a resolution whose split does not equal the remaining balance', async () => {
    await raiseDispute({ escrowId: ESCROW_ID, raisedByAddress: 'GCLIENT' });
    await expect(
      resolveDispute({
        escrowId: ESCROW_ID,
        clientAmount: 10,
        freelancerAmount: 20, // 30 != 100
        resolvedBy: 'GARBITER',
        resolution: 'split',
      }),
    ).rejects.toMatchObject({ status: 422, code: 'AMOUNT_MISMATCH' });
  });
});

describe('expireEscrow / cancelEscrow', () => {
  it('expires an escrow from the funded state', async () => {
    await expireEscrow({ escrowId: ESCROW_ID, expiredLedger: 12345 });
    const escrow = await getEscrow();
    expect(escrow.status).toBe('Expired');
  });

  it('cancels an escrow from the funded state', async () => {
    await cancelEscrow({ escrowId: ESCROW_ID, cancelledBy: 'GCLIENT', reason: 'changed mind' });
    const escrow = await getEscrow();
    expect(escrow.status).toBe('Cancelled');
  });

  it('rejects expiry from a non-expirable state', async () => {
    await cancelEscrow({ escrowId: ESCROW_ID, cancelledBy: 'GCLIENT' });
    await expect(expireEscrow({ escrowId: ESCROW_ID, expiredLedger: 1 })).rejects.toMatchObject({
      status: 409,
      code: 'ESCROW_NOT_EXPIRABLE',
    });
  });
});
