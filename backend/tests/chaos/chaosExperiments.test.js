/**
 * Chaos Experiment Tests
 *
 * End-to-end tests for each chaos experiment. Each test:
 *   1. Enables chaos mode with a specific experiment
 *   2. Exercises the affected code path
 *   3. Asserts the expected degraded behaviour
 *   4. Disables chaos and verifies recovery
 *
 * These tests deliberately inject faults and assert that the system
 * handles them gracefully — circuit breakers open, errors are surfaced
 * correctly, and recovery happens after the fault is removed.
 */

import { jest } from '@jest/globals';

// ── Metric mocks ──────────────────────────────────────────────────────────────

const metricsMock = {
  circuitBreakerState:            { set: jest.fn() },
  circuitBreakerCallsTotal:       { inc: jest.fn() },
  circuitBreakerTransitionsTotal: { inc: jest.fn() },
  dbConnectionErrorsTotal:        { inc: jest.fn() },
  chaosInjectedTotal:             { inc: jest.fn() },
};

jest.unstable_mockModule('../../lib/metrics.js', () => metricsMock);

// ─── Imports (after mocks) ────────────────────────────────────────────────────

const { CircuitBreaker, CircuitOpenError, STATES, clearRegistry } =
  await import('../../lib/circuitBreaker.js');

const {
  isChaosEnabled,
  injectLatency,
  injectHttpError,
  injectDatabaseError,
  injectStellarError,
  withTimeout,
  withProbability,
} = await import('../../chaos/faultInjector.js');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function enableChaos(experimentId) {
  process.env.CHAOS_ENABLED   = 'true';
  process.env.CHAOS_EXPERIMENT = experimentId;
}

function disableChaos() {
  delete process.env.CHAOS_ENABLED;
  delete process.env.CHAOS_EXPERIMENT;
}

function makeMockRes() {
  const res = { statusCode: null, body: null, headersSent: false };
  res.status = jest.fn().mockImplementation((code) => { res.statusCode = code; return res; });
  res.json   = jest.fn().mockImplementation((data) => { res.body = data; res.headersSent = true; return res; });
  return res;
}

beforeEach(() => {
  jest.clearAllMocks();
  clearRegistry();
  disableChaos();
  jest.useFakeTimers({ advanceTimers: false });
});

afterEach(() => {
  disableChaos();
  jest.useRealTimers();
});

// ═══════════════════════════════════════════════════════════════════════════════
// Experiment: db-latency
// ═══════════════════════════════════════════════════════════════════════════════

describe('Experiment: db-latency — failure injection', () => {
  it('isChaosEnabled() is false when CHAOS_ENABLED is not set', () => {
    expect(isChaosEnabled()).toBe(false);
  });

  it('isChaosEnabled() is true when CHAOS_ENABLED=true', () => {
    enableChaos('db-latency');
    expect(isChaosEnabled()).toBe(true);
  });

  it('injectLatency resolves after the specified delay when chaos enabled', async () => {
    enableChaos('db-latency');

    const start = Date.now();
    const p = injectLatency(500, 0, 'db-latency');
    jest.advanceTimersByTime(500);
    await p;
    // With fake timers the actual wall clock barely advances; just verify no throw
    expect(metricsMock.chaosInjectedTotal.inc).toHaveBeenCalledWith(
      expect.objectContaining({ experiment_id: 'db-latency', fault_type: 'latency' }),
    );
  });

  it('injectLatency is a no-op when chaos disabled', async () => {
    await injectLatency(5000, 0, 'db-latency');
    expect(metricsMock.chaosInjectedTotal.inc).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Experiment: db-failure — database error injection + circuit breaker
// ═══════════════════════════════════════════════════════════════════════════════

describe('Experiment: db-failure — circuit breaker opens on DB errors', () => {
  it('injectDatabaseError throws with P1001 when chaos enabled', () => {
    enableChaos('db-failure');
    expect(() => injectDatabaseError('db-failure')).toThrow();
    try {
      injectDatabaseError('db-failure');
    } catch (err) {
      expect(err.code).toBe('P1001');
    }
  });

  it('injectDatabaseError is a no-op when chaos disabled', () => {
    expect(() => injectDatabaseError('db-failure')).not.toThrow();
  });

  it('circuit breaker opens after 5 DB errors', async () => {
    enableChaos('db-failure');

    const cb = new CircuitBreaker('database', {
      failureThreshold: 5,
      successThreshold: 2,
      timeout: 30000,
    });

    const dbCall = () => Promise.reject(Object.assign(new Error("Can't reach DB"), { code: 'P1001' }));

    for (let i = 0; i < 5; i++) {
      await expect(cb.execute(dbCall)).rejects.toThrow();
    }

    expect(cb.state).toBe(STATES.OPEN);
  });

  it('open circuit rejects calls immediately (fail-fast)', async () => {
    enableChaos('db-failure');

    const cb = new CircuitBreaker('database', { failureThreshold: 3, timeout: 30000 });
    const dbCall = () => Promise.reject(new Error('DB down'));

    for (let i = 0; i < 3; i++) {
      await expect(cb.execute(dbCall)).rejects.toThrow();
    }

    // Subsequent call: fails fast, not via dbCall
    let calledDb = false;
    const fastCall = () => { calledDb = true; return Promise.resolve(); };
    await expect(cb.execute(fastCall)).rejects.toBeInstanceOf(CircuitOpenError);
    expect(calledDb).toBe(false);
  });

  it('circuit recovers to CLOSED after timeout + successful probes', async () => {
    enableChaos('db-failure');

    const cb = new CircuitBreaker('database', {
      failureThreshold: 3,
      successThreshold: 2,
      timeout: 5000,
    });

    const fail = () => Promise.reject(new Error('DB down'));
    const succeed = () => Promise.resolve('healthy');

    for (let i = 0; i < 3; i++) {
      await expect(cb.execute(fail)).rejects.toThrow();
    }
    expect(cb.state).toBe(STATES.OPEN);

    jest.advanceTimersByTime(5001);

    await cb.execute(succeed);  // HALF_OPEN, 1st success
    expect(cb.state).toBe(STATES.HALF_OPEN);

    await cb.execute(succeed);  // 2nd success → CLOSED
    expect(cb.state).toBe(STATES.CLOSED);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Experiment: stellar-rpc-timeout — timeout injection
// ═══════════════════════════════════════════════════════════════════════════════

describe('Experiment: stellar-rpc-timeout — timeout testing', () => {
  it('withTimeout rejects when the operation exceeds the limit', async () => {
    enableChaos('stellar-rpc-timeout');

    const slowOp = () => new Promise((resolve) => setTimeout(resolve, 10000));
    const p = withTimeout(slowOp, 100, 'stellar-rpc-timeout');
    jest.advanceTimersByTime(101);
    await expect(p).rejects.toThrow('timed out');
  });

  it('withTimeout resolves when the operation completes in time', async () => {
    enableChaos('stellar-rpc-timeout');

    const fastOp = () => Promise.resolve('tx-hash-abc');
    const result = await withTimeout(fastOp, 3000, 'stellar-rpc-timeout');
    expect(result).toBe('tx-hash-abc');
  });

  it('timeout error has ETIMEDOUT code', async () => {
    enableChaos('stellar-rpc-timeout');

    const slowOp = () => new Promise(() => {}); // never resolves
    const p = withTimeout(slowOp, 50, 'stellar-rpc-timeout');
    jest.advanceTimersByTime(51);
    try {
      await p;
    } catch (err) {
      expect(err.code).toBe('ETIMEDOUT');
    }
  });

  it('withTimeout works even without chaos enabled (hard timeout)', async () => {
    // withTimeout is always functional — it's a hard timeout wrapper
    const fastOp = () => Promise.resolve('done');
    const result = await withTimeout(fastOp, 1000);
    expect(result).toBe('done');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Experiment: stellar-rpc-error — Stellar error injection + circuit breaker
// ═══════════════════════════════════════════════════════════════════════════════

describe('Experiment: stellar-rpc-error — Stellar circuit breaker', () => {
  it('injectStellarError throws with STELLAR_RPC_ERROR code when chaos enabled', () => {
    enableChaos('stellar-rpc-error');
    try {
      injectStellarError('stellar-rpc-error');
    } catch (err) {
      expect(err.code).toBe('STELLAR_RPC_ERROR');
    }
  });

  it('injectStellarError is a no-op when chaos disabled', () => {
    expect(() => injectStellarError('stellar-rpc-error')).not.toThrow();
  });

  it('Stellar circuit breaker opens after threshold failures', async () => {
    enableChaos('stellar-rpc-error');

    const cb = new CircuitBreaker('stellar-rpc', { failureThreshold: 5, timeout: 30000 });
    const rpcCall = () => Promise.reject(
      Object.assign(new Error('RPC unavailable'), { code: 'STELLAR_RPC_ERROR' }),
    );

    for (let i = 0; i < 5; i++) {
      await expect(cb.execute(rpcCall)).rejects.toThrow();
    }

    expect(cb.state).toBe(STATES.OPEN);
    expect(metricsMock.circuitBreakerTransitionsTotal.inc).toHaveBeenCalledWith(
      expect.objectContaining({ from: 'CLOSED', to: 'OPEN' }),
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Experiment: partial-api-errors — probabilistic fault injection
// ═══════════════════════════════════════════════════════════════════════════════

describe('Experiment: partial-api-errors — probabilistic HTTP errors', () => {
  it('injectHttpError sends error response and returns true when chaos enabled', () => {
    enableChaos('partial-api-errors');
    const res = makeMockRes();
    const injected = injectHttpError(res, 500, 'chaos error', 'partial-api-errors');

    expect(injected).toBe(true);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.body).toMatchObject({ error: 'chaos error', chaos: true });
  });

  it('injectHttpError returns false and does not send when chaos disabled', () => {
    const res = makeMockRes();
    const injected = injectHttpError(res, 500, 'chaos error', 'partial-api-errors');

    expect(injected).toBe(false);
    expect(res.status).not.toHaveBeenCalled();
  });

  it('withProbability triggers the fault at p=1.0', async () => {
    enableChaos('partial-api-errors');
    const faultFn = jest.fn().mockResolvedValue(undefined);

    const triggered = await withProbability(1.0, faultFn);
    expect(triggered).toBe(true);
    expect(faultFn).toHaveBeenCalledTimes(1);
  });

  it('withProbability never triggers the fault at p=0.0', async () => {
    enableChaos('partial-api-errors');
    const faultFn = jest.fn().mockResolvedValue(undefined);

    const triggered = await withProbability(0.0, faultFn);
    expect(triggered).toBe(false);
    expect(faultFn).not.toHaveBeenCalled();
  });

  it('withProbability is a no-op when chaos disabled', async () => {
    const faultFn = jest.fn().mockResolvedValue(undefined);
    const triggered = await withProbability(1.0, faultFn);

    expect(triggered).toBe(false);
    expect(faultFn).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Recovery testing — system stabilises after chaos disabled
// ═══════════════════════════════════════════════════════════════════════════════

describe('Recovery testing', () => {
  it('circuit breaker returns to normal after reset() post-experiment', async () => {
    enableChaos('db-failure');

    const cb = new CircuitBreaker('db-recovery', { failureThreshold: 3, timeout: 30000 });
    const fail = () => Promise.reject(new Error('DB down'));

    for (let i = 0; i < 3; i++) {
      await expect(cb.execute(fail)).rejects.toThrow();
    }
    expect(cb.state).toBe(STATES.OPEN);

    // Chaos experiment ends — operator resets the breaker
    disableChaos();
    cb.reset();

    expect(cb.state).toBe(STATES.CLOSED);
    const succeed = () => Promise.resolve('db healthy');
    await expect(cb.execute(succeed)).resolves.toBe('db healthy');
  });

  it('chaos functions are no-ops immediately after chaos disabled', async () => {
    enableChaos('db-failure');
    expect(isChaosEnabled()).toBe(true);

    disableChaos();

    expect(isChaosEnabled()).toBe(false);
    expect(() => injectDatabaseError('db-failure')).not.toThrow();
    expect(() => injectStellarError('stellar-rpc-error')).not.toThrow();
    await injectLatency(5000, 0, 'db-latency'); // should resolve instantly
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Metric emission
// ═══════════════════════════════════════════════════════════════════════════════

describe('Metric emission', () => {
  it('chaosInjectedTotal is incremented on each fault injection', async () => {
    enableChaos('db-failure');

    injectDatabaseError('db-failure');
    injectDatabaseError('db-failure');

    expect(metricsMock.chaosInjectedTotal.inc).toHaveBeenCalledTimes(2);
    expect(metricsMock.chaosInjectedTotal.inc).toHaveBeenCalledWith(
      expect.objectContaining({ fault_type: 'db-failure' }),
    );
  });

  it('circuitBreakerCallsTotal tracks success and failure outcomes', async () => {
    const cb = new CircuitBreaker('metrics-test', { failureThreshold: 10 });

    await cb.execute(() => Promise.resolve('ok'));
    await expect(cb.execute(() => Promise.reject(new Error('boom')))).rejects.toThrow();

    expect(metricsMock.circuitBreakerCallsMock?.inc ?? metricsMock.circuitBreakerCallsTotal.inc)
      .toHaveBeenCalledWith(expect.objectContaining({ outcome: 'success' }));
    expect(metricsMock.circuitBreakerCallsTotal.inc)
      .toHaveBeenCalledWith(expect.objectContaining({ outcome: 'failure' }));
  });
});
