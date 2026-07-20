/**
 * Tests for services/stellarService.js
 *
 * Verifies the acceptance criteria:
 *  - submitTransaction polls with an exponential backoff (1s → 2s → 4s … capped
 *    8s, max 10 attempts).
 *  - The circuit breaker opens after 5 failures and rejects with
 *    STELLAR_RPC_UNAVAILABLE.
 *  - getContractEvents fans a large range out into exactly
 *    ceil(range / 4096) requests.
 */

import { jest } from '@jest/globals';

// ── logger (silent) ───────────────────────────────────────────────────────────
const loggerMock = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
};
jest.unstable_mockModule('../../config/logger.js', () => ({
  createModuleLogger: () => loggerMock,
}));

// ── tracing: record span names, but don't touch real OTel ─────────────────────
const withSpanMock = jest.fn((name, attrsOrFn, maybeFn) => {
  const fn = typeof attrsOrFn === 'function' ? attrsOrFn : maybeFn;
  return fn({
    recordException: jest.fn(),
    setAttribute: jest.fn(),
    setStatus: jest.fn(),
  });
});
jest.unstable_mockModule('../../lib/tracing.js', () => ({
  withSpan: withSpanMock,
  getTracer: jest.fn(),
}));

// ── Soroban SDK: a single shared mock server instance ─────────────────────────
const mockServer = {
  getLatestLedger: jest.fn(),
  sendTransaction: jest.fn(),
  getTransaction: jest.fn(),
  getEvents: jest.fn(),
  simulateTransaction: jest.fn(),
};
const mockSorobanRpc = {
  SorobanRpc: { Server: jest.fn(() => mockServer) },
  Transaction: jest.fn((xdr) => ({ xdr })),
  Networks: { PUBLIC: 'Public', TESTNET: 'Test SDF Network ; September 2015' },
};
jest.unstable_mockModule('@stellar/stellar-sdk', () => mockSorobanRpc);

const { resetAllBreakers } = await import('../../lib/circuitBreaker.js');
const stellar = await import('../../services/stellarService.js');
const {
  submitTransaction,
  getContractEvents,
  getLatestLedger,
  simulateTransaction,
  getStellarCircuitState,
  __setSleep,
  STELLAR_RPC_URL,
} = stellar;

const BATCH = 4096;

beforeEach(() => {
  jest.clearAllMocks();
  resetAllBreakers();
  withSpanMock.mockClear();

  // safe defaults
  mockServer.getLatestLedger.mockResolvedValue({ sequence: 1 });
  mockServer.getTransaction.mockResolvedValue({ status: 'NOT_FOUND' });
  mockServer.getEvents.mockResolvedValue({ events: [] });
  mockServer.sendTransaction.mockResolvedValue({ hash: 'h', status: 'PENDING' });
  mockServer.simulateTransaction.mockResolvedValue({ results: [{}] });
});

describe('span + circuit breaker wiring', () => {
  it('attaches an OpenTelemetry span to every RPC call', async () => {
    await getLatestLedger();
    expect(withSpanMock).toHaveBeenCalledWith(
      'stellarService.getLatestLedger',
      expect.anything(),
      expect.any(Function),
    );
  });

  it('reports CLOSED state when healthy', () => {
    expect(getStellarCircuitState()).toBe('CLOSED');
  });
});

describe('submitTransaction — polling backoff', () => {
  it('uses the exponential backoff schedule (capped) and times out', async () => {
    const sleep = jest.fn().mockResolvedValue(undefined);
    __setSleep(sleep);
    mockServer.sendTransaction.mockResolvedValue({ hash: 'h1', status: 'PENDING' });
    mockServer.getTransaction.mockResolvedValue({ status: 'NOT_FOUND' });

    const result = await submitTransaction('xdr');

    expect(result).toEqual({ hash: 'h1', status: 'TIMEOUT' });
    // 10 attempts → 9 sleeps; delays 1s,2s,4s,8s(cap),8s...8s
    const delays = sleep.mock.calls.map((c) => c[0]);
    expect(delays).toEqual([
      1000, 2000, 4000, 8000, 8000, 8000, 8000, 8000, 8000,
    ]);
    expect(mockServer.getTransaction).toHaveBeenCalledTimes(10);
  });

  it('resolves SUCCESS as soon as the transaction settles', async () => {
    __setSleep(jest.fn().mockResolvedValue(undefined));
    mockServer.sendTransaction.mockResolvedValue({ hash: 'h2', status: 'PENDING' });
    mockServer.getTransaction.mockResolvedValueOnce({ status: 'SUCCESS', resultXdr: 'rx' });

    const result = await submitTransaction('xdr');
    expect(result).toEqual({ hash: 'h2', status: 'SUCCESS', errorResultXdr: 'rx' });
    expect(mockServer.getTransaction).toHaveBeenCalledTimes(1);
  });

  it('returns FAILED immediately when sendTransaction reports ERROR', async () => {
    __setSleep(jest.fn().mockResolvedValue(undefined));
    mockServer.sendTransaction.mockResolvedValue({
      hash: 'h3',
      status: 'ERROR',
      errorResultXdr: 'errx',
    });

    const result = await submitTransaction('xdr');
    expect(result).toEqual({ hash: 'h3', status: 'FAILED', errorResultXdr: 'errx' });
    expect(mockServer.getTransaction).not.toHaveBeenCalled();
  });
});

describe('circuit breaker', () => {
  it('opens after 5 consecutive failures and rejects with STELLAR_RPC_UNAVAILABLE', async () => {
    mockServer.getLatestLedger.mockRejectedValue(new Error('boom'));

    for (let i = 0; i < 5; i++) {
      await expect(getLatestLedger()).rejects.toThrow('boom');
    }

    expect(getStellarCircuitState()).toBe('OPEN');

    const rejects = getLatestLedger();
    await expect(rejects).rejects.toMatchObject({ code: 'STELLAR_RPC_UNAVAILABLE' });
  });

  it('stays CLOSED after a single failure (below threshold)', async () => {
    mockServer.getLatestLedger.mockRejectedValueOnce(new Error('blip'));
    await expect(getLatestLedger()).rejects.toThrow('blip');
    expect(getStellarCircuitState()).toBe('CLOSED');
  });
});

describe('getContractEvents — 4096-ledger fan-out', () => {
  it('fetches the whole range in a single request when small', async () => {
    const start = 1000;
    mockServer.getLatestLedger.mockResolvedValue({ sequence: start + 100 });
    mockServer.getEvents.mockResolvedValue({ events: [{ id: 'e1' }] });

    const events = await getContractEvents(start, 'CONTRACT');

    expect(events).toHaveLength(1);
    expect(mockServer.getEvents).toHaveBeenCalledTimes(1);
    expect(mockServer.getEvents.mock.calls[0][0].startLedger).toBe(start);
  });

  it('issues exactly ceil(range / 4096) requests for a large range', async () => {
    const start = 1000;
    // range = 2 * 4096 + 100 = 8292 → ceil(8292 / 4096) = 3 batches
    const latest = start + 2 * BATCH + 100;
    mockServer.getLatestLedger.mockResolvedValue({ sequence: latest });
    mockServer.getEvents.mockResolvedValue({ events: [] });

    const events = await getContractEvents(start, 'CONTRACT');

    expect(events).toEqual([]);
    expect(mockServer.getEvents).toHaveBeenCalledTimes(3);
    const starts = mockServer.getEvents.mock.calls.map((c) => c[0].startLedger);
    expect(starts).toEqual([start, start + BATCH, start + 2 * BATCH]);
    expect(getStellarCircuitState()).toBe('CLOSED');
  });

  it('returns an empty array when startLedger is at or beyond the latest ledger', async () => {
    mockServer.getLatestLedger.mockResolvedValue({ sequence: 500 });
    const events = await getContractEvents(500, 'CONTRACT');
    expect(events).toEqual([]);
    expect(mockServer.getEvents).not.toHaveBeenCalled();
  });

  it('retries a failing batch up to 3 times before surfacing the error', async () => {
    const sleep = jest.fn().mockResolvedValue(undefined);
    __setSleep(sleep);
    const start = 1000;
    mockServer.getLatestLedger.mockResolvedValue({ sequence: start + 100 });
    mockServer.getEvents.mockRejectedValue(new Error('gap'));

    await expect(getContractEvents(start, 'CONTRACT')).rejects.toThrow('gap');
    // 3 attempts → 2 waits between them
    expect(mockServer.getEvents).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);
  });
});

describe('simulateTransaction — fee estimation', () => {
  it('returns the simulated cost on success', async () => {
    mockServer.simulateTransaction.mockResolvedValue({
      results: [{ cpuInsns: '12345', memBytes: '678' }],
    });
    const res = await simulateTransaction('xdr');
    expect(res).toEqual({ success: true, cost: { cpuInsns: '12345', memBytes: '678' } });
  });

  it('reports failure with zeroed cost when the simulation errors', async () => {
    mockServer.simulateTransaction.mockResolvedValue({ error: 'bad op' });
    const res = await simulateTransaction('xdr');
    expect(res).toEqual({ success: false, cost: { cpuInsns: '0', memBytes: '0' } });
  });
});

describe('module constants', () => {
  it('exposes a usable RPC URL', () => {
    expect(typeof STELLAR_RPC_URL).toBe('string');
    expect(STELLAR_RPC_URL.length).toBeGreaterThan(0);
  });
});
