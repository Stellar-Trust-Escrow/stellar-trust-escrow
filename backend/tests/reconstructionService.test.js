import { jest } from '@jest/globals';

// ── Mocks ─────────────────────────────────────────────────────────────────────

const loggerMock = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
jest.unstable_mockModule('../config/logger.js', () => ({
  createModuleLogger: () => loggerMock,
}));

const redisMock = { rpush: jest.fn().mockResolvedValue(1), on: jest.fn() };
jest.unstable_mockModule('ioredis', () => ({ default: jest.fn(() => redisMock) }));

const prismaMock = {
  escrow: {
    findMany: jest.fn(),
    update: jest.fn(),
  },
  reconHealingLog: {
    create: jest.fn(),
  },
};
jest.unstable_mockModule('../lib/prisma.js', () => ({ default: prismaMock }));

// Stub SorobanRpc — returns a fixed event set
const mockGetEvents = jest.fn();
jest.unstable_mockModule('@stellar/stellar-sdk', () => ({
  SorobanRpc: {
    Server: jest.fn(() => ({ getEvents: mockGetEvents })),
  },
  scValToNative: (v) => v,
}));

// ── Import SUT after mocks ────────────────────────────────────────────────────

const { replayEvents, compareToDb, healDb } = await import('../services/reconstructionService.js');

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeEvent(type, escrowId, values = []) {
  return {
    topic: [type, String(escrowId)],
    value: values,
    ledger: 150,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  process.env.REDIS_HOST = ''; // disable redis init in tests
});

// ── replayEvents ──────────────────────────────────────────────────────────────

describe('replayEvents', () => {
  test('builds escrow state from EscrowCreated event', async () => {
    mockGetEvents.mockResolvedValueOnce({
      events: [makeEvent('esc_crt', '42', ['GABC', 'GXYZ', '1000'])],
      cursor: undefined,
    });
    const { state } = await replayEvents('CONTRACT', 100, 200);
    expect(state.escrows.get('42')).toMatchObject({ status: 'Active', id: '42' });
  });

  test('applies MilestoneApproved and decrements remainingBalance', async () => {
    mockGetEvents.mockResolvedValueOnce({
      events: [
        makeEvent('esc_crt', '1', ['GABC', 'GXYZ', '1000']),
        makeEvent('mil_add', '1', [0, '400']),
        makeEvent('mil_apr', '1', [0, '400']),
      ],
    });
    const { state } = await replayEvents('CONTRACT', 100, 200);
    expect(state.escrows.get('1').remainingBalance).toBe('600');
    expect(state.milestones.get('1:0').status).toBe('Approved');
  });

  test('handles DisputeRaised → sets status Disputed', async () => {
    mockGetEvents.mockResolvedValueOnce({
      events: [
        makeEvent('esc_crt', '5', ['G1', 'G2', '500']),
        makeEvent('dis_rai', '5', ['G1', 'fee non-delivery']),
      ],
    });
    const { state } = await replayEvents('CONTRACT', 100, 200);
    expect(state.escrows.get('5').status).toBe('Disputed');
    expect(state.disputes.has('5')).toBe(true);
  });

  test('unknown event type is pushed to Redis and replay continues', async () => {
    mockGetEvents.mockResolvedValueOnce({
      events: [makeEvent('esc_crt', '7', ['G1', 'G2', '100']), makeEvent('unknown_ev', '7', [])],
    });
    const { state } = await replayEvents('CONTRACT', 100, 200);
    expect(state.escrows.has('7')).toBe(true); // replay continued
  });

  test('handles paginated events across multiple pages', async () => {
    mockGetEvents
      .mockResolvedValueOnce({
        events: Array.from({ length: 200 }, (_, i) =>
          makeEvent('esc_crt', String(i), ['G1', 'G2', '100']),
        ),
        cursor: 'page2',
      })
      .mockResolvedValueOnce({
        events: [makeEvent('esc_crt', '200', ['G1', 'G2', '100'])],
        cursor: undefined,
      });
    const { state, eventCount } = await replayEvents('CONTRACT', 100, 999);
    expect(state.escrows.size).toBe(201);
    expect(eventCount).toBe(201);
  });

  test('stops paginating when event ledger exceeds endLedger', async () => {
    mockGetEvents.mockResolvedValueOnce({
      events: [
        makeEvent('esc_crt', '1', ['G1', 'G2', '100']),
        { topic: ['esc_crt', '2'], value: ['G1', 'G2', '100'], ledger: 9999 }, // beyond endLedger
      ],
      cursor: 'more',
    });
    const { state } = await replayEvents('CONTRACT', 100, 500);
    expect(state.escrows.has('2')).toBe(false);
  });
});

// ── compareToDb ───────────────────────────────────────────────────────────────

describe('compareToDb', () => {
  test('reports zero divergences when DB matches on-chain state', async () => {
    const state = {
      escrows: new Map([['10', { id: '10', status: 'Active', remainingBalance: '500' }]]),
      milestones: new Map(),
      disputes: new Map(),
    };
    prismaMock.escrow.findMany
      .mockResolvedValueOnce([{ id: 10n, status: 'Active', remainingBalance: '500' }])
      .mockResolvedValueOnce([]); // extra in range query
    const report = await compareToDb({ state, ledgerRange: { from: 100, to: 200 } });
    expect(report.summary.matched).toBe(1);
    expect(report.summary.diverged).toBe(0);
  });

  test('detects status divergence when DB row differs from on-chain state', async () => {
    const state = {
      escrows: new Map([['11', { id: '11', status: 'Completed', remainingBalance: '0' }]]),
      milestones: new Map(),
      disputes: new Map(),
    };
    prismaMock.escrow.findMany
      .mockResolvedValueOnce([{ id: 11n, status: 'Active', remainingBalance: '0' }])
      .mockResolvedValueOnce([]);
    const report = await compareToDb({ state, ledgerRange: { from: 100, to: 200 } });
    expect(report.summary.diverged).toBe(1);
    expect(report.diverged[0]).toMatchObject({
      escrow_id: '11',
      field: 'status',
      on_chain: 'Completed',
      in_db: 'Active',
    });
  });

  test('reports missing_in_db when on-chain record has no DB row', async () => {
    const state = {
      escrows: new Map([['99', { id: '99', status: 'Active', remainingBalance: '0' }]]),
      milestones: new Map(),
      disputes: new Map(),
    };
    prismaMock.escrow.findMany
      .mockResolvedValueOnce([]) // no DB rows
      .mockResolvedValueOnce([]);
    const report = await compareToDb({ state, ledgerRange: { from: 0, to: 999 } });
    expect(report.summary.missing_in_db).toBe(1);
    expect(report.missing_in_db[0].escrow_id).toBe('99');
  });

  test('reports extra_in_db for DB rows with no on-chain counterpart', async () => {
    const state = { escrows: new Map(), milestones: new Map(), disputes: new Map() };
    prismaMock.escrow.findMany.mockResolvedValueOnce([{ id: 55n }]); // DB has a row in range (first findMany skipped when escrowIds empty)
    const report = await compareToDb({ state, ledgerRange: { from: 0, to: 999 } });
    expect(report.summary.extra_in_db).toBe(1);
  });
});

// ── healDb ────────────────────────────────────────────────────────────────────

describe('healDb', () => {
  test('dryRun=true returns changes without writing to DB', async () => {
    const report = {
      diverged: [{ escrow_id: '20', field: 'status', on_chain: 'Completed', in_db: 'Active' }],
      extra_in_db: [],
      missing_in_db: [],
    };
    const result = await healDb(report, { dryRun: true });
    expect(result.dryRun).toBe(true);
    expect(result.healed).toBe(1);
    expect(prismaMock.escrow.update).not.toHaveBeenCalled();
    expect(prismaMock.reconHealingLog.create).not.toHaveBeenCalled();
  });

  test('dryRun=false writes update and healing log', async () => {
    prismaMock.escrow.update.mockResolvedValue({});
    prismaMock.reconHealingLog.create.mockResolvedValue({});
    const report = {
      diverged: [{ escrow_id: '21', field: 'status', on_chain: 'Completed', in_db: 'Active' }],
      extra_in_db: [],
      missing_in_db: [],
    };
    const result = await healDb(report, { dryRun: false, triggeredBy: 'admin1' });
    expect(result.dryRun).toBe(false);
    expect(result.healed).toBe(1);
    expect(prismaMock.escrow.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 21n }, data: { status: 'Completed' } }),
    );
    expect(prismaMock.reconHealingLog.create).toHaveBeenCalled();
  });

  test('extra_in_db records are marked orphaned, not deleted', async () => {
    prismaMock.escrow.update.mockResolvedValue({});
    prismaMock.reconHealingLog.create.mockResolvedValue({});
    const report = {
      diverged: [],
      extra_in_db: [{ escrow_id: '77', reason: 'no on-chain record' }],
      missing_in_db: [],
    };
    const result = await healDb(report, { dryRun: false });
    expect(result.changes[0].action).toBe('orphaned');
  });
});
