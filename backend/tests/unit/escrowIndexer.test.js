/**
 * Tests for services/escrowIndexer.js
 *
 * Verifies the exactly-once acceptance criteria:
 *  - The same event processed twice yields a single contract_events row (upsert).
 *  - A malformed (unparseable) event is pushed to the Redis DLQ and the batch
 *    continues.
 *  - A handler that keeps failing is retried 3× then dead-lettered.
 *  - The ledger cursor is persisted after each batch and not advanced when there
 *    is no new ledger.
 *
 * The indexer's dependencies (stellarService, escrowService, redis, prisma) are
 * mocked; the in-memory `contractEvents` array is the source of truth for the
 * idempotency assertion.
 */

import { jest } from '@jest/globals';

// Set the contract id BEFORE the indexer module is imported — escrowIndexer
// captures ESCROW_CONTRACT_ID once at load time.
process.env.ESCROW_CONTRACT_ID = 'CC';

// ── logger (silent) ───────────────────────────────────────────────────────────
jest.unstable_mockModule('../../config/logger.js', () => ({
  createModuleLogger: () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  }),
}));

// ── redis (DLQ) ───────────────────────────────────────────────────────────────
const redisClient = {
  rpush: jest.fn().mockResolvedValue(1),
  lpush: jest.fn().mockResolvedValue(1),
  on: jest.fn(),
};
jest.unstable_mockModule('redis', () => ({
  createClient: jest.fn(() => redisClient),
}));

// ── prisma (in-memory store for contract_events + indexer_state) ───────────────
const contractEvents = [];
const prismaMock = {
  contractEvent: {
    upsert: jest.fn(async ({ where, create }) => {
      const existing = contractEvents.find((e) => e.eventId === where.eventId);
      if (existing) {
        Object.assign(existing, create);
        return existing;
      }
      const row = { id: contractEvents.length + 1, ...create };
      contractEvents.push(row);
      return row;
    }),
    findMany: jest.fn(async () => contractEvents),
  },
  indexerState: {
    upsert: jest.fn(async () => ({
      id: 1,
      lastProcessedLedger: BigInt(process.env.INDEXER_START_LEDGER || '0'),
    })),
    update: jest.fn(async () => ({})),
  },
  failedEvent: { create: jest.fn(async () => ({})) },
};
jest.unstable_mockModule('../../lib/prisma.js', () => ({
  default: prismaMock,
  __esModule: true,
}));

// ── escrowService handlers (resolved by default) ───────────────────────────────
const handlers = {
  fundEscrow: jest.fn().mockResolvedValue({}),
  releaseMilestone: jest.fn().mockResolvedValue({}),
  raiseDispute: jest.fn().mockResolvedValue({}),
  resolveDispute: jest.fn().mockResolvedValue({}),
  cancelEscrow: jest.fn().mockResolvedValue({}),
  expireEscrow: jest.fn().mockResolvedValue({}),
};
jest.unstable_mockModule('../../services/escrowService.js', () => ({
  ...handlers,
  __esModule: true,
}));

// ── stellarService (RPC) ───────────────────────────────────────────────────────
const stellarMocks = {
  getLatestLedger: jest.fn().mockResolvedValue(10),
  getContractEvents: jest.fn().mockResolvedValue([]),
};
jest.unstable_mockModule('../../services/stellarService.js', () => ({
  ...stellarMocks,
  __esModule: true,
}));

const idx = await import('../../services/escrowIndexer.js');
const { processEvent, processBatch, runOnce, DLQ_KEY, __setSleep, __resetCursor } = idx;

const mkEvent = (over) => ({
  id: 'evt-1',
  ledger: 5,
  ledgerClosedAt: '2024-01-01T00:00:00Z',
  contractId: 'CC',
  topic: ['EscrowCreated', '1'],
  value: ['GCLIENT', 'GFREELANCER', 'GTOKEN', '100', 'bh'],
  txHash: 'tx-1',
  ...over,
});

beforeEach(() => {
  jest.clearAllMocks();
  contractEvents.length = 0;
  __resetCursor(0);
  process.env.ESCROW_CONTRACT_ID = 'CC';
  process.env.INDEXER_START_LEDGER = '0';
  stellarMocks.getLatestLedger.mockResolvedValue(10);
  stellarMocks.getContractEvents.mockResolvedValue([]);
});

describe('exactly-once upsert', () => {
  it('records the same event only once when processed twice', async () => {
    const event = mkEvent();
    await processEvent(event);
    await processEvent(event);

    expect(prismaMock.contractEvent.upsert).toHaveBeenCalledTimes(2);
    expect(contractEvents).toHaveLength(1);
    expect(contractEvents[0].eventId).toBe('evt-1');
  });

  it('stores the parsed event type and escrow id', async () => {
    await processEvent(mkEvent());
    expect(contractEvents[0].eventType).toBe('EscrowCreated');
    expect(contractEvents[0].escrowId.toString()).toBe('1');
  });

  it('processes a batch of distinct events into distinct rows', async () => {
    await processBatch([
      mkEvent({ id: 'a', topic: ['EscrowCreated', '1'] }),
      mkEvent({ id: 'b', topic: ['MilestoneApproved', '1'], value: ['0', '50', 'GC'] }),
      mkEvent({ id: 'c', topic: ['DisputeRaised', '1'], value: ['GCLIENT'] }),
    ]);
    expect(contractEvents).toHaveLength(3);
    expect(handlers.fundEscrow).toHaveBeenCalledTimes(1);
    expect(handlers.releaseMilestone).toHaveBeenCalledTimes(1);
    expect(handlers.raiseDispute).toHaveBeenCalledTimes(1);
  });
});

describe('dead-letter queue', () => {
  it('pushes an unparseable event to the DLQ and continues', async () => {
    await processEvent({ ledger: 1 }); // no topic → parse failure

    expect(redisClient.rpush).toHaveBeenCalledTimes(1);
    expect(redisClient.rpush.mock.calls[0][0]).toBe(DLQ_KEY);
    const payload = JSON.parse(redisClient.rpush.mock.calls[0][1]);
    expect(payload.kind).toBe('parse');
    expect(payload.event).toBeDefined();
    // No contract event row for the poison event.
    expect(contractEvents).toHaveLength(0);
  });

  it('does not DLQ an unknown-but-parseable event type (just skips the handler)', async () => {
    await processEvent(mkEvent({ id: 'weird', topic: ['SomethingUnknown', '1'], value: [] }));

    expect(handlers.fundEscrow).not.toHaveBeenCalled();
    expect(redisClient.rpush).not.toHaveBeenCalled();
    expect(contractEvents).toHaveLength(1); // still recorded
  });

  it('retries a failing handler 3× then dead-letters with attempts:3', async () => {
    handlers.releaseMilestone.mockRejectedValue(new Error('handler boom'));
    const sleep = jest.fn().mockResolvedValue(undefined);
    __setSleep(sleep);

    await processEvent(
      mkEvent({ id: 'fail', topic: ['MilestoneApproved', '1'], value: ['0', '50', 'GC'] }),
    );

    expect(handlers.releaseMilestone).toHaveBeenCalledTimes(4); // initial + 3 retries
    expect(sleep).toHaveBeenCalledTimes(3);
    expect(redisClient.rpush).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(redisClient.rpush.mock.calls[0][1]);
    expect(payload.kind).toBe('handler');
    expect(payload.attempts).toBe(3);
  });
});

describe('cursor persistence', () => {
  it('fetches from cursor+1 and persists the cursor after a batch', async () => {
    __resetCursor(0);
    stellarMocks.getLatestLedger.mockResolvedValue(10);
    stellarMocks.getContractEvents.mockResolvedValue([
      mkEvent({ id: 'batched', topic: ['EscrowCreated', '1'] }),
    ]);

    await runOnce();

    expect(stellarMocks.getContractEvents).toHaveBeenCalledWith(1, 'CC');
    expect(prismaMock.indexerState.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { lastProcessedLedger: BigInt(10) },
    });
  });

  it('does not advance the cursor when the latest ledger is not ahead', async () => {
    __resetCursor(10);
    stellarMocks.getLatestLedger.mockResolvedValue(5);

    await runOnce();

    expect(stellarMocks.getContractEvents).not.toHaveBeenCalled();
    expect(prismaMock.indexerState.update).not.toHaveBeenCalled();
  });
});
