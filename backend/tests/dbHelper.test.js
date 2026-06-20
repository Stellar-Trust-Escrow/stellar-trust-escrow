/**
 * Tests for backend/api/services/dbHelper.js
 */

import { jest } from '@jest/globals';

// ── Mock prisma ───────────────────────────────────────────────────────────────

const mockTransaction = jest.fn();

jest.unstable_mockModule('../lib/prisma.js', () => ({
  default: { $transaction: mockTransaction },
}));

jest.unstable_mockModule('../config/logger.js', () => ({
  createModuleLogger: () => ({ warn: jest.fn(), error: jest.fn(), info: jest.fn() }),
}));

const { withRetryTransaction, isDeadlockError, DEADLOCK_CODES } =
  await import('../api/services/dbHelper.js');

// ── Helpers ───────────────────────────────────────────────────────────────────

function deadlockError(code = '40P01') {
  const err = new Error('deadlock detected');
  err.code = code;
  return err;
}

beforeEach(() => {
  jest.clearAllMocks();
});

// ── isDeadlockError ───────────────────────────────────────────────────────────

describe('isDeadlockError', () => {
  it.each([...DEADLOCK_CODES])('returns true for code %s', (code) => {
    expect(isDeadlockError({ code })).toBe(true);
  });

  it('returns true for nested meta.code', () => {
    expect(isDeadlockError({ meta: { code: '40P01' } })).toBe(true);
  });

  it('returns false for non-deadlock codes', () => {
    expect(isDeadlockError({ code: 'P2002' })).toBe(false);
    expect(isDeadlockError(new Error('generic'))).toBe(false);
    expect(isDeadlockError(null)).toBe(false);
  });
});

// ── withRetryTransaction ──────────────────────────────────────────────────────

describe('withRetryTransaction', () => {
  it('resolves immediately on success', async () => {
    mockTransaction.mockResolvedValue('result');

    const result = await withRetryTransaction(() => {}, { maxRetries: 3 });

    expect(result).toBe('result');
    expect(mockTransaction).toHaveBeenCalledTimes(1);
  });

  it('retries on deadlock and succeeds on second attempt', async () => {
    mockTransaction.mockRejectedValueOnce(deadlockError('40P01')).mockResolvedValue('ok');

    const result = await withRetryTransaction(() => {}, { maxRetries: 3, baseDelayMs: 1 });

    expect(result).toBe('ok');
    expect(mockTransaction).toHaveBeenCalledTimes(2);
  });

  it('retries on serialization failure (40001)', async () => {
    mockTransaction.mockRejectedValueOnce(deadlockError('40001')).mockResolvedValue('ok');

    const result = await withRetryTransaction(() => {}, { maxRetries: 3, baseDelayMs: 1 });

    expect(result).toBe('ok');
    expect(mockTransaction).toHaveBeenCalledTimes(2);
  });

  it('throws immediately for non-deadlock errors without retrying', async () => {
    const err = new Error('unique constraint');
    err.code = 'P2002';
    mockTransaction.mockRejectedValue(err);

    await expect(withRetryTransaction(() => {}, { maxRetries: 3 })).rejects.toThrow(
      'unique constraint',
    );
    expect(mockTransaction).toHaveBeenCalledTimes(1);
  });

  it('throws after exhausting maxRetries on persistent deadlock', async () => {
    mockTransaction.mockRejectedValue(deadlockError('40P01'));

    await expect(
      withRetryTransaction(() => {}, { maxRetries: 3, baseDelayMs: 1 }),
    ).rejects.toMatchObject({ code: '40P01' });
    // 1 initial + 3 retries = 4 total calls
    expect(mockTransaction).toHaveBeenCalledTimes(4);
  });

  it('passes isolationLevel to prisma.$transaction', async () => {
    mockTransaction.mockResolvedValue(undefined);

    await withRetryTransaction(() => {}, { isolationLevel: 'Serializable' });

    expect(mockTransaction).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({ isolationLevel: 'Serializable' }),
    );
  });
});
