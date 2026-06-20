/**
 * Tests for backend/api/services/auditLogger.js
 *
 * Covers:
 *  - Log entry creation with correct hash linkage
 *  - Chain validation (valid chain, tampered hash, tampered prevHash)
 *  - Query / pagination
 */

import { jest } from '@jest/globals';

// ── Prisma mock ───────────────────────────────────────────────────────────────

const mockStore = [];
let nextId = 1;

const mockTx = {
  arbitratorAuditLog: {
    findFirst: jest.fn(async ({ orderBy } = {}) => {
      if (!mockStore.length) return null;
      // Return last by id desc
      return [...mockStore].sort((a, b) => b.id - a.id)[0];
    }),
    create: jest.fn(async ({ data }) => {
      const record = { id: nextId++, ...data };
      mockStore.push(record);
      return record;
    }),
    update: jest.fn(async ({ where, data }) => {
      const idx = mockStore.findIndex((r) => r.id === where.id);
      if (idx !== -1) Object.assign(mockStore[idx], data);
      return mockStore[idx];
    }),
  },
};

jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn(() => ({
    $transaction: jest.fn(async (fn) => {
      if (typeof fn === 'function') return fn(mockTx);
      // Array form used by queryLogs
      return Promise.all(fn.map((p) => p));
    }),
    arbitratorAuditLog: {
      findMany: jest.fn(async ({ orderBy, skip = 0, take = 50, where = {} } = {}) => {
        let rows = [...mockStore];
        if (orderBy?.id === 'asc') rows.sort((a, b) => a.id - b.id);
        else rows.sort((a, b) => b.id - a.id);
        return rows.slice(skip, skip + take);
      }),
      count: jest.fn(async () => mockStore.length),
    },
  })),
}));

jest.mock('../../config/logger.js', () => ({
  createModuleLogger: () => ({ error: jest.fn() }),
}));

// ── Import after mocks ────────────────────────────────────────────────────────

const { logArbitratorAction, validateChain, queryLogs, ArbitratorAction } =
  await import('../../api/services/auditLogger.js');

// ── Helpers ───────────────────────────────────────────────────────────────────

function clearStore() {
  mockStore.length = 0;
  nextId = 1;
  jest.clearAllMocks();
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ArbitratorAction constants', () => {
  it('exports all expected action keys', () => {
    expect(ArbitratorAction.DISPUTE_ASSIGNED).toBe('DISPUTE_ASSIGNED');
    expect(ArbitratorAction.EVIDENCE_VIEWED).toBe('EVIDENCE_VIEWED');
    expect(ArbitratorAction.VOTE_CAST).toBe('VOTE_CAST');
    expect(ArbitratorAction.COMMUNICATION_LOGGED).toBe('COMMUNICATION_LOGGED');
    expect(ArbitratorAction.RESOLUTION_ISSUED).toBe('RESOLUTION_ISSUED');
  });
});

describe('logArbitratorAction', () => {
  beforeEach(clearStore);

  it('creates a log entry and returns it', async () => {
    const entry = {
      action: ArbitratorAction.DISPUTE_ASSIGNED,
      actor: 'GARBITRATOR1',
      resourceId: 'dispute-42',
      metadata: { reason: 'auto-assigned' },
    };
    const record = await logArbitratorAction(entry);
    expect(record).not.toBeNull();
    expect(record.action).toBe(ArbitratorAction.DISPUTE_ASSIGNED);
    expect(record.actor).toBe('GARBITRATOR1');
    expect(record.hash).toBeDefined();
    expect(record.hash).not.toBe('pending');
    expect(record.hash).toHaveLength(64); // SHA-256 hex
  });

  it('sets prevHash to genesis hash for the first entry', async () => {
    await logArbitratorAction({ action: ArbitratorAction.VOTE_CAST, actor: 'GARB1' });
    expect(mockStore[0].prevHash).toBe('0'.repeat(64));
  });

  it('links subsequent entries via prevHash', async () => {
    await logArbitratorAction({ action: ArbitratorAction.DISPUTE_ASSIGNED, actor: 'GARB1' });
    await logArbitratorAction({ action: ArbitratorAction.EVIDENCE_VIEWED, actor: 'GARB1' });

    const [first, second] = mockStore;
    expect(second.prevHash).toBe(first.hash);
  });

  it('produces different hashes for different entries', async () => {
    await logArbitratorAction({
      action: ArbitratorAction.DISPUTE_ASSIGNED,
      actor: 'GARB1',
      resourceId: 'd1',
    });
    await logArbitratorAction({
      action: ArbitratorAction.RESOLUTION_ISSUED,
      actor: 'GARB1',
      resourceId: 'd1',
    });

    expect(mockStore[0].hash).not.toBe(mockStore[1].hash);
  });
});

describe('validateChain', () => {
  beforeEach(clearStore);

  it('returns valid=true and checkedCount=0 for an empty log', async () => {
    const result = await validateChain();
    expect(result.valid).toBe(true);
    expect(result.checkedCount).toBe(0);
    expect(result.firstViolation).toBeNull();
  });

  it('returns valid=true for a correctly chained log', async () => {
    await logArbitratorAction({ action: ArbitratorAction.DISPUTE_ASSIGNED, actor: 'GARB1' });
    await logArbitratorAction({ action: ArbitratorAction.EVIDENCE_VIEWED, actor: 'GARB1' });
    await logArbitratorAction({ action: ArbitratorAction.RESOLUTION_ISSUED, actor: 'GARB1' });

    const result = await validateChain();
    expect(result.valid).toBe(true);
    expect(result.checkedCount).toBe(3);
  });

  it('detects a tampered hash', async () => {
    await logArbitratorAction({ action: ArbitratorAction.VOTE_CAST, actor: 'GARB1' });
    await logArbitratorAction({ action: ArbitratorAction.VOTE_CAST, actor: 'GARB1' });

    // Tamper with the first entry's hash
    mockStore[0].hash = 'deadbeef'.repeat(8);

    const result = await validateChain();
    expect(result.valid).toBe(false);
    expect(result.firstViolation).not.toBeNull();
    expect(result.firstViolation.id).toBe(mockStore[0].id);
  });

  it('detects a tampered prevHash linkage', async () => {
    await logArbitratorAction({ action: ArbitratorAction.DISPUTE_ASSIGNED, actor: 'GARB1' });
    await logArbitratorAction({ action: ArbitratorAction.EVIDENCE_VIEWED, actor: 'GARB1' });

    // Break the chain link on the second entry
    mockStore[1].prevHash = 'badhash'.padEnd(64, '0');

    const result = await validateChain();
    expect(result.valid).toBe(false);
    expect(result.firstViolation.reason).toBe('prevHash_mismatch');
  });
});

describe('queryLogs', () => {
  beforeEach(async () => {
    clearStore();
    await logArbitratorAction({
      action: ArbitratorAction.DISPUTE_ASSIGNED,
      actor: 'GARB1',
      resourceId: 'd1',
    });
    await logArbitratorAction({
      action: ArbitratorAction.EVIDENCE_VIEWED,
      actor: 'GARB2',
      resourceId: 'd1',
    });
    await logArbitratorAction({
      action: ArbitratorAction.RESOLUTION_ISSUED,
      actor: 'GARB1',
      resourceId: 'd2',
    });
  });

  it('returns paginated results', async () => {
    const result = await queryLogs({ page: 1, limit: 2 });
    expect(result.data.length).toBeLessThanOrEqual(2);
    expect(result.total).toBe(3);
    expect(result.pages).toBe(2);
  });

  it('returns all entries when limit is large', async () => {
    const result = await queryLogs({ limit: 100 });
    expect(result.total).toBe(3);
  });
});
