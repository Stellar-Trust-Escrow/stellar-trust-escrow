import { jest } from '@jest/globals';

// ── Mocks ─────────────────────────────────────────────────────────────────────

const loggerMock = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
jest.unstable_mockModule('../config/logger.js', () => ({
  createModuleLogger: () => loggerMock,
}));

// Redis mock — tracks SET NX PX calls and eval (Lua CAS delete)
const redisMock = {
  set: jest.fn(),
  eval: jest.fn(),
  on: jest.fn(),
};
jest.unstable_mockModule('ioredis', () => ({
  Redis: jest.fn(() => redisMock),
}));

// Prisma mock
const prismaMock = {
  indexerState: {
    upsert: jest.fn(),
    update: jest.fn(),
  },
  contractEvent: { upsert: jest.fn() },
  milestone: { updateMany: jest.fn() },
  escrow: { updateMany: jest.fn() },
  dispute: { upsert: jest.fn() },
  reputationRecord: { upsert: jest.fn() },
  $transaction: jest.fn(async (ops) => (Array.isArray(ops) ? Promise.all(ops) : ops)),
  $executeRaw: jest.fn(),
};
jest.unstable_mockModule('../lib/prisma.js', () => ({ default: prismaMock }));

// withRetry — just call the fn directly
jest.unstable_mockModule('../lib/transaction.js', () => ({
  withRetry: jest.fn((fn) => fn()),
}));

// ── Import SUT ────────────────────────────────────────────────────────────────

const { startIndexer } = await import('../workers/escrowIndexer.js');

// ── Helpers ───────────────────────────────────────────────────────────────────

function setupEnv(overrides = {}) {
  process.env.ESCROW_CONTRACT_ID = overrides.contractId ?? 'CONTRACT123';
  process.env.SOROBAN_RPC_URL = overrides.rpcUrl ?? 'https://rpc.example.com';
  process.env.INDEXER_POLL_INTERVAL_MS = '999999'; // prevent real polling
  process.env.INDEXER_BATCH_SIZE = overrides.batchSize ?? '10';
  process.env.INDEXER_LOCK_TTL_MS = overrides.lockTtl ?? '30000';
  process.env.INDEXER_LOCK_RETRY_COUNT = overrides.retryCount ?? '3';
  process.env.INDEXER_LOCK_RETRY_DELAY_MS = '0';
  process.env.INDEXER_START_LEDGER = '0';
}

beforeEach(() => {
  jest.clearAllMocks();
  redisMock.set.mockResolvedValue('OK');
  redisMock.eval.mockResolvedValue(1);
  prismaMock.indexerState.upsert.mockResolvedValue({ id: 1, lastProcessedLedger: BigInt(0) });
  prismaMock.indexerState.update.mockResolvedValue({});
  global.fetch = jest.fn();
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('escrowIndexer — distributed Redis locking', () => {
  describe('lock acquisition', () => {
    it('acquires lock with SET NX PX and processes events', async () => {
      setupEnv();
      redisMock.set.mockResolvedValue('OK');

      // getLatestLedger → 5, getEvents → 2 events
      global.fetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ result: { sequence: 5 } }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            result: {
              events: [
                {
                  topic: ['esc_crt', '1'],
                  value: ['addr1', 'addr2', '100'],
                  txHash: 'tx1',
                  id: 0,
                  ledger: 1,
                  ledgerClosedAt: new Date().toISOString(),
                },
                {
                  topic: ['esc_crt', '2'],
                  value: ['addr3', 'addr4', '200'],
                  txHash: 'tx2',
                  id: 1,
                  ledger: 2,
                  ledgerClosedAt: new Date().toISOString(),
                },
              ],
            },
          }),
        });

      prismaMock.contractEvent.upsert.mockResolvedValue({});

      await startIndexer();
      await new Promise((r) => setTimeout(r, 50));

      // SET NX PX must have been called for the lock
      expect(redisMock.set).toHaveBeenCalledWith(
        expect.stringMatching(/^indexer:ledger:/),
        expect.any(String),
        'NX',
        'PX',
        expect.any(Number),
      );
    });

    it('skips batch when lock is already held (SET NX returns null)', async () => {
      setupEnv();
      redisMock.set.mockResolvedValue(null); // lock held by another node

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ result: { sequence: 5 } }),
      });

      await startIndexer();
      await new Promise((r) => setTimeout(r, 50));

      // fetch should only have been called once (getLatestLedger), not for getEvents
      const eventCalls = global.fetch.mock.calls.filter(([, opts]) => {
        try {
          return JSON.parse(opts.body).method === 'getEvents';
        } catch {
          return false;
        }
      });
      expect(eventCalls).toHaveLength(0);

      expect(loggerMock.debug).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'indexer_lock_skipped' }),
      );
    });

    it('retries lock acquisition up to LOCK_RETRY_COUNT times', async () => {
      setupEnv({ retryCount: '3' });
      // Fail twice, succeed on third
      redisMock.set
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce('OK');

      global.fetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ result: { sequence: 3 } }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ result: { events: [] } }),
        });

      await startIndexer();
      await new Promise((r) => setTimeout(r, 50));

      expect(redisMock.set).toHaveBeenCalledTimes(3);
    });

    it('releases lock via Lua CAS after processing', async () => {
      setupEnv();
      redisMock.set.mockResolvedValue('OK');
      redisMock.eval.mockResolvedValue(1);

      global.fetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ result: { sequence: 2 } }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ result: { events: [] } }),
        });

      await startIndexer();
      await new Promise((r) => setTimeout(r, 50));

      expect(redisMock.eval).toHaveBeenCalledWith(
        expect.stringContaining('redis.call'),
        1,
        expect.stringMatching(/^indexer:ledger:/),
        expect.any(String),
      );
    });

    it('releases lock even when event processing throws', async () => {
      setupEnv();
      redisMock.set.mockResolvedValue('OK');

      global.fetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ result: { sequence: 2 } }),
        })
        .mockRejectedValueOnce(new Error('RPC down'));

      await startIndexer();
      await new Promise((r) => setTimeout(r, 50));

      // Lock release (eval) should still be called
      expect(redisMock.eval).toHaveBeenCalled();
    });
  });

  describe('lock TTL auto-expiry', () => {
    it('sets lock with the configured TTL so crashed nodes unblock the cluster', async () => {
      setupEnv({ lockTtl: '15000' });
      redisMock.set.mockResolvedValue('OK');

      global.fetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ result: { sequence: 1 } }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ result: { events: [] } }),
        });

      await startIndexer();
      await new Promise((r) => setTimeout(r, 50));

      const [, , , , ttl] = redisMock.set.mock.calls[0];
      expect(ttl).toBe(15000);
    });
  });

  describe('cursor persistence', () => {
    it('advances cursor only after successful DB write', async () => {
      setupEnv();
      redisMock.set.mockResolvedValue('OK');

      global.fetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ result: { sequence: 3 } }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ result: { events: [] } }),
        });

      await startIndexer();
      await new Promise((r) => setTimeout(r, 50));

      expect(prismaMock.indexerState.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { lastProcessedLedger: BigInt(3) } }),
      );
    });
  });

  describe('no contract ID', () => {
    it('skips indexing when ESCROW_CONTRACT_ID is not set', async () => {
      process.env.ESCROW_CONTRACT_ID = '';
      await startIndexer();
      expect(redisMock.set).not.toHaveBeenCalled();
    });
  });

  describe('Redis error resilience', () => {
    it('treats Redis network error as lock failure and skips batch', async () => {
      setupEnv({ retryCount: '1' });
      redisMock.set.mockRejectedValue(new Error('ECONNREFUSED'));

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ result: { sequence: 5 } }),
      });

      await startIndexer();
      await new Promise((r) => setTimeout(r, 50));

      // No getEvents call — batch was skipped
      const eventCalls = global.fetch.mock.calls.filter(([, opts]) => {
        try {
          return JSON.parse(opts.body).method === 'getEvents';
        } catch {
          return false;
        }
      });
      expect(eventCalls).toHaveLength(0);
    });
  });
});
