import { jest } from '@jest/globals';

// ── Mocks ─────────────────────────────────────────────────────────────────────

const loggerMock = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
jest.unstable_mockModule('../../config/logger.js', () => ({
  createModuleLogger: () => loggerMock,
}));

const prismaMock = {
  indexerState: {
    upsert: jest.fn(),
    update: jest.fn(),
  },
  contractEvent: { create: jest.fn() },
  paymentStream: {
    upsert: jest.fn(),
    updateMany: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
  },
  $transaction: jest.fn(async (ops) => (Array.isArray(ops) ? Promise.all(ops) : ops)),
};
jest.unstable_mockModule('../../lib/prisma.js', () => ({ default: prismaMock }));

jest.unstable_mockModule('../../services/stellarService.js', () => ({
  getContractEvents: jest.fn(),
  getLatestLedger: jest.fn(),
}));

// ── Import SUT ────────────────────────────────────────────────────────────────

const { dispatchEvent, handleStreamCreated, handleStreamClaimed, handleStreamCancelled } =
  await import('../../services/streamingIndexer.js');
const { getContractEvents, getLatestLedger } = await import('../../services/stellarService.js');

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeEvent(overrides = {}) {
  return {
    topic: ['str_crt', '1'],
    value: ['sender_addr', 'recipient_addr', 'token_addr', '100000000000', '10000000', '1000'],
    txHash: 'tx_hash_1',
    id: '0-1',
    ledger: 100,
    ledgerClosedAt: '2025-01-15T10:00:00Z',
    contractId: 'CONTRACT123',
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  prismaMock.indexerState.upsert.mockResolvedValue({ id: 2, lastProcessedLedger: BigInt(0) });
  prismaMock.indexerState.update.mockResolvedValue({});
  prismaMock.contractEvent.create.mockResolvedValue({});
  prismaMock.paymentStream.upsert.mockResolvedValue({});
  prismaMock.paymentStream.updateMany.mockResolvedValue({});
  getLatestLedger.mockResolvedValue(100);
  getContractEvents.mockResolvedValue([]);
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('streamingIndexer — StreamCreated handler', () => {
  it('creates a PaymentStream row on str_crt event', async () => {
    const event = makeEvent({
      topic: ['str_crt', '42'],
      value: ['sender_g', 'recipient_g', 'token_g', '5000000000', '20000000', '2000'],
    });

    await handleStreamCreated(event, {
      ledger: BigInt(100),
      ledgerAt: new Date('2025-01-15T10:00:00Z'),
      txHash: 'tx1',
      eventIndex: 0,
      contractId: 'CONTRACT123',
    });

    expect(prismaMock.paymentStream.upsert).toHaveBeenCalledTimes(1);
    const args = prismaMock.paymentStream.upsert.mock.calls[0][0];
    expect(args.where.streamId).toBe(BigInt(42));
    expect(args.create.senderAddress).toBe('sender_g');
    expect(args.create.recipientAddress).toBe('recipient_g');
    expect(args.create.totalAmount).toBe('5000000000');
    expect(args.create.ratePerSecond).toBe('20000000');
    expect(args.create.status).toBe('Active');
  });

  it('is idempotent on duplicate stream ID', async () => {
    const err = new Error('Unique constraint');
    err.code = 'P2002';
    prismaMock.paymentStream.upsert.mockRejectedValue(err);

    const event = makeEvent({ topic: ['str_crt', '1'] });

    // P2002 is caught in dispatchEvent, not in handleStreamCreated itself —
    // exercise the actual idempotency path.
    await expect(dispatchEvent(event)).resolves.toBeUndefined();
  });
});

describe('streamingIndexer — StreamClaimed handler', () => {
  it('updates claimed_total and last_claimed_at on str_clm event', async () => {
    const event = makeEvent({
      topic: ['str_clm', '42'],
      value: ['5000000', 'recipient_g', '99995000000'],
    });

    await handleStreamClaimed(event, {
      ledger: BigInt(200),
      ledgerAt: new Date('2025-01-15T11:00:00Z'),
      txHash: 'tx2',
      eventIndex: 0,
      contractId: 'CONTRACT123',
    });

    expect(prismaMock.paymentStream.updateMany).toHaveBeenCalledTimes(1);
    const args = prismaMock.paymentStream.updateMany.mock.calls[0][0];
    expect(args.where).toEqual({ streamId: BigInt(42) });
    expect(args.data.lastClaimedAt).toEqual(new Date('2025-01-15T11:00:00Z'));
    expect(args.data.status).toBe('Active');
  });
});

describe('streamingIndexer — StreamCancelled handler', () => {
  it('marks stream as Cancelled on str_can event', async () => {
    const event = makeEvent({
      topic: ['str_can', '42'],
      value: ['30000000', '70000000'],
    });

    await handleStreamCancelled(event, {
      ledger: BigInt(300),
      ledgerAt: new Date('2025-01-15T12:00:00Z'),
      txHash: 'tx3',
      eventIndex: 0,
      contractId: 'CONTRACT123',
    });

    expect(prismaMock.paymentStream.updateMany).toHaveBeenCalledTimes(1);
    const args = prismaMock.paymentStream.updateMany.mock.calls[0][0];
    expect(args.where).toEqual({ streamId: BigInt(42) });
    expect(args.data.status).toBe('Cancelled');
    expect(args.data.cancelledAt).toEqual(new Date('2025-01-15T12:00:00Z'));
  });
});

describe('streamingIndexer — dispatchEvent', () => {
  it('routes str_crt to handleStreamCreated', async () => {
    const event = makeEvent({ topic: ['str_crt', '1'] });
    await dispatchEvent(event);
    expect(prismaMock.paymentStream.upsert).toHaveBeenCalled();
  });

  it('routes str_clm to handleStreamClaimed', async () => {
    const event = makeEvent({ topic: ['str_clm', '1'], value: ['1000', 'addr', '99000'] });
    await dispatchEvent(event);
    expect(prismaMock.paymentStream.updateMany).toHaveBeenCalled();
  });

  it('routes str_can to handleStreamCancelled', async () => {
    const event = makeEvent({ topic: ['str_can', '1'], value: ['5000', '5000'] });
    await dispatchEvent(event);
    expect(prismaMock.paymentStream.updateMany).toHaveBeenCalled();
  });

  it('ignores unknown event types', async () => {
    const event = makeEvent({ topic: ['unknown_evt', '1'] });
    await dispatchEvent(event);
    expect(prismaMock.paymentStream.upsert).not.toHaveBeenCalled();
    expect(prismaMock.paymentStream.updateMany).not.toHaveBeenCalled();
  });
});
