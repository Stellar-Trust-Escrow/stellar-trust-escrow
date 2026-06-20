/**
 * Tests for backend/services/lockManager.js
 */

import { jest } from '@jest/globals';

// ── Mock ioredis ──────────────────────────────────────────────────────────────

const mockRedis = {
  set: jest.fn(),
  eval: jest.fn(),
  quit: jest.fn().mockResolvedValue(undefined),
  on: jest.fn(),
};

jest.unstable_mockModule('ioredis', () => ({
  default: jest.fn(() => mockRedis),
}));

// ── Import SUT after mocks ────────────────────────────────────────────────────

const { default: LockManager } = await import('../services/lockManager.js');

// ── Helpers ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('LockManager.acquire', () => {
  it('returns a Lock when Redis SET NX succeeds', async () => {
    mockRedis.set.mockResolvedValue('OK');

    const lock = await LockManager.acquire('test_lock', 5000, { autoRenew: false });

    expect(lock).not.toBeNull();
    expect(mockRedis.set).toHaveBeenCalledWith('test_lock', expect.any(String), 'PX', 5000, 'NX');
  });

  it('returns null when the lock is already held (SET NX returns null)', async () => {
    mockRedis.set.mockResolvedValue(null);

    const lock = await LockManager.acquire('test_lock', 5000, { autoRenew: false });

    expect(lock).toBeNull();
  });

  it('returns null and logs a warning when Redis throws', async () => {
    mockRedis.set.mockRejectedValue(new Error('connection refused'));

    const lock = await LockManager.acquire('test_lock', 5000, { autoRenew: false });

    expect(lock).toBeNull();
  });
});

describe('Lock.release', () => {
  it('calls the Lua release script with the correct token', async () => {
    mockRedis.set.mockResolvedValue('OK');
    mockRedis.eval.mockResolvedValue(1);

    const lock = await LockManager.acquire('rel_lock', 5000, { autoRenew: false });
    await lock.release();

    expect(mockRedis.eval).toHaveBeenCalledWith(
      expect.stringContaining('redis.call("del"'),
      1,
      'rel_lock',
      expect.any(String),
    );
  });

  it('is safe to call multiple times (idempotent)', async () => {
    mockRedis.set.mockResolvedValue('OK');
    mockRedis.eval.mockResolvedValue(1);

    const lock = await LockManager.acquire('idem_lock', 5000, { autoRenew: false });
    await lock.release();
    await lock.release(); // second call should not throw

    expect(mockRedis.eval).toHaveBeenCalledTimes(2);
  });

  it('does not throw when Redis eval fails during release', async () => {
    mockRedis.set.mockResolvedValue('OK');
    mockRedis.eval.mockRejectedValue(new Error('redis down'));

    const lock = await LockManager.acquire('err_lock', 5000, { autoRenew: false });
    await expect(lock.release()).resolves.toBeUndefined();
  });
});

describe('Lock auto-renewal', () => {
  it('calls the Lua renew script at 50% of TTL', async () => {
    mockRedis.set.mockResolvedValue('OK');
    mockRedis.eval.mockResolvedValue(1);

    const ttl = 10_000;
    const lock = await LockManager.acquire('renew_lock', ttl, { autoRenew: true });

    // Advance time past the renewal interval (50% of TTL)
    jest.advanceTimersByTime(ttl * 0.5 + 100);
    await Promise.resolve(); // flush microtasks

    expect(mockRedis.eval).toHaveBeenCalledWith(
      expect.stringContaining('pexpire'),
      1,
      'renew_lock',
      expect.any(String),
      String(ttl),
    );

    await lock.release();
  });

  it('stops renewal when the lock is no longer owned (eval returns 0)', async () => {
    mockRedis.set.mockResolvedValue('OK');
    // First eval call = renewal returns 0 (lock stolen)
    mockRedis.eval.mockResolvedValue(0);

    const ttl = 10_000;
    await LockManager.acquire('stolen_lock', ttl, { autoRenew: true });

    jest.advanceTimersByTime(ttl * 0.5 + 100);
    await Promise.resolve();

    // Only one renewal attempt should have been made
    expect(mockRedis.eval).toHaveBeenCalledTimes(1);
  });
});

describe('LockManager.disconnect', () => {
  it('calls quit on the Redis client', async () => {
    await LockManager.disconnect();
    expect(mockRedis.quit).toHaveBeenCalled();
  });
});
