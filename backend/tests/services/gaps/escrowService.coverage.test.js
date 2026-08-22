/**
 * escrowService — coverage gaps
 *
 * Targets branches, error paths, and state transitions not covered by the
 * existing escrowStateMachine tests.
 */

import { jest } from '@jest/globals';

// ── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('../../../lib/prisma.js', () => ({ default: {} }));
jest.mock('../../../lib/transaction.js', () => ({
  withTransaction: jest.fn(async (fn) => fn({})),
}));
jest.mock('../../../lib/escrowStateMachine.js', () => ({
  TRANSITIONS: {},
  allowedTransitions: jest.fn(() => []),
  transition: jest.fn((state) => state),
}));
jest.mock('../../../services/escrowRealtime.js', () => ({
  emitEscrowEvent: jest.fn(),
}));
jest.mock('../../../config/logger.js', () => ({
  createModuleLogger: () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeEscrow(overrides = {}) {
  return {
    id: 'esc-001',
    status: 'Funded',
    amount: 100,
    platformFeePct: 2,
    clientAddress: 'CLIENT',
    freelancerAddress: 'FREELANCER',
    tenantId: 'default',
    milestones: [],
    ...overrides,
  };
}

// ── SM_TO_DB / DB_TO_SM mapping ───────────────────────────────────────────────

describe('escrowService — status mappings', () => {
  let SM_TO_DB, DB_TO_SM;

  beforeAll(async () => {
    const svc = await import('../../../services/escrowService.js');
    SM_TO_DB = svc.SM_TO_DB;
    DB_TO_SM = svc.DB_TO_SM;
  });

  test('SM_TO_DB contains expected lifecycle keys', () => {
    expect(SM_TO_DB).toHaveProperty('draft', 'Draft');
    expect(SM_TO_DB).toHaveProperty('funded', 'Funded');
    expect(SM_TO_DB).toHaveProperty('released', 'Released');
    expect(SM_TO_DB).toHaveProperty('cancelled', 'Cancelled');
    expect(SM_TO_DB).toHaveProperty('disputed', 'Disputed');
  });

  test('DB_TO_SM maps legacy aliases correctly', () => {
    expect(DB_TO_SM['Active']).toBe('funded');
    expect(DB_TO_SM['Completed']).toBe('released');
  });

  test('SM_TO_DB and DB_TO_SM are reciprocal for core statuses', () => {
    const core = ['draft', 'funded', 'in_progress', 'released', 'cancelled'];
    for (const sm of core) {
      const db = SM_TO_DB[sm];
      expect(DB_TO_SM[db]).toBe(sm);
    }
  });
});

// ── fundEscrow validation ─────────────────────────────────────────────────────

describe('escrowService — fundEscrow', () => {
  let fundEscrow;
  const { withTransaction } = await import('../../../lib/transaction.js').catch(() => ({ withTransaction: jest.fn() }));

  beforeAll(async () => {
    const svc = await import('../../../services/escrowService.js');
    fundEscrow = svc.fundEscrow;
  });

  test('throws if escrowId is missing', async () => {
    await expect(fundEscrow({ amount: 10 })).rejects.toThrow();
  });

  test('throws if amount is not positive', async () => {
    await expect(fundEscrow({ escrowId: 'e1', amount: 0 })).rejects.toThrow();
  });
});

// ── raiseDispute validation ───────────────────────────────────────────────────

describe('escrowService — raiseDispute', () => {
  let raiseDispute;

  beforeAll(async () => {
    const svc = await import('../../../services/escrowService.js');
    raiseDispute = svc.raiseDispute;
  });

  test('throws if escrowId is missing', async () => {
    await expect(raiseDispute({ raisedByAddress: 'A' })).rejects.toThrow();
  });
});

// ── cancelEscrow validation ───────────────────────────────────────────────────

describe('escrowService — cancelEscrow', () => {
  let cancelEscrow;

  beforeAll(async () => {
    const svc = await import('../../../services/escrowService.js');
    cancelEscrow = svc.cancelEscrow;
  });

  test('throws if escrowId is missing', async () => {
    await expect(cancelEscrow({ cancelledBy: 'X' })).rejects.toThrow();
  });
});

// ── expireEscrow validation ───────────────────────────────────────────────────

describe('escrowService — expireEscrow', () => {
  let expireEscrow;

  beforeAll(async () => {
    const svc = await import('../../../services/escrowService.js');
    expireEscrow = svc.expireEscrow;
  });

  test('throws if escrowId is missing', async () => {
    await expect(expireEscrow({ expiredLedger: 100 })).rejects.toThrow();
  });
});
