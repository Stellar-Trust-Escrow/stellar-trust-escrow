/**
 * Tests for backend/workers/ipfsSyncWorker.js
 */

import { jest } from '@jest/globals';

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockUpdateMany = jest.fn().mockResolvedValue({ count: 1 });

jest.unstable_mockModule('../lib/prisma.js', () => ({
  default: { disputeEvidence: { updateMany: mockUpdateMany } },
}));

jest.unstable_mockModule('../config/logger.js', () => ({
  createModuleLogger: () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  }),
}));

// Stub global fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

const { syncCid } = await import('../workers/ipfsSyncWorker.js');

// ── Helpers ───────────────────────────────────────────────────────────────────

function validMetadata(overrides = {}) {
  return { description: 'Evidence A', evidenceType: 'file', filename: 'proof.pdf', ...overrides };
}

function mockGatewayOk(data = validMetadata()) {
  mockFetch.mockResolvedValue({
    ok: true,
    json: async () => data,
  });
}

function mockGatewayError(status = 503) {
  mockFetch.mockResolvedValue({ ok: false, status });
}

beforeEach(() => {
  jest.clearAllMocks();
});

// Flush all pending promises and timers
async function flushAll() {
  await new Promise((r) => setImmediate(r));
  await new Promise((r) => setImmediate(r));
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('syncCid — valid metadata', () => {
  it('fetches from the IPFS gateway and caches in the DB', async () => {
    mockGatewayOk();

    syncCid('Qmvalid123', 1);
    await flushAll();

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/ipfs/Qmvalid123'),
      expect.any(Object),
    );
    expect(mockUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { ipfsCid: 'Qmvalid123', description: null },
        data: expect.objectContaining({ description: 'Evidence A' }),
      }),
    );
  });
});

describe('syncCid — invalid metadata', () => {
  it('does not write to DB when metadata is missing required fields', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ someOtherField: 'x' }), // missing description + evidenceType
    });

    syncCid('QmBadMeta', 2);
    await flushAll();

    // After MAX_RETRIES all fail — DB should never be called
    expect(mockUpdateMany).not.toHaveBeenCalled();
  });

  it('does not write to DB when gateway returns non-200', async () => {
    mockGatewayError(503);

    syncCid('QmGatewayDown', 3);
    await flushAll();

    expect(mockUpdateMany).not.toHaveBeenCalled();
  });
});

describe('syncCid — retry logic', () => {
  it('calls fetch more than once when the first attempt fails', async () => {
    // Both calls fail — we just verify retry attempts are made
    mockFetch.mockResolvedValue({ ok: false, status: 503 });

    syncCid('QmRetryAttempt', 4);
    // Wait for at least the first retry delay (IPFS_SYNC_RETRY_DELAY_MS defaults to 2000ms * 1)
    // We only verify that fetch was called at least twice, not the full retry chain
    await new Promise((r) => setTimeout(r, 2200));
    await flushAll();

    expect(mockFetch.mock.calls.length).toBeGreaterThanOrEqual(2);
  }, 10_000);
});

describe('syncCid — deduplication', () => {
  it('does not enqueue the same CID twice while in-flight', async () => {
    mockGatewayOk();

    syncCid('QmDup', 5);
    syncCid('QmDup', 5); // duplicate — should be ignored

    await flushAll();

    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('ignores falsy CIDs', () => {
    syncCid('', 6);
    syncCid(null, 7);

    expect(mockFetch).not.toHaveBeenCalled();
  });
});
