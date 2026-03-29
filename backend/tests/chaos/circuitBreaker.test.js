/**
 * Circuit Breaker Unit Tests
 *
 * Validates all state transitions and metric emission for the CircuitBreaker class.
 * Uses fake timers to control window expiry and timeout without real delays.
 */

import { jest } from '@jest/globals';

// ── Mock metrics so Prometheus counters don't accumulate across test runs ─────

const circuitBreakerStateMock    = { set: jest.fn() };
const circuitBreakerCallsMock    = { inc: jest.fn() };
const circuitBreakerTransMock    = { inc: jest.fn() };

jest.unstable_mockModule('../../lib/metrics.js', () => ({
  circuitBreakerState:            circuitBreakerStateMock,
  circuitBreakerCallsTotal:       circuitBreakerCallsMock,
  circuitBreakerTransitionsTotal: circuitBreakerTransMock,
  // Other exports referenced by retryUtils etc. — provide stubs
  dbConnectionErrorsTotal:        { inc: jest.fn() },
  chaosInjectedTotal:             { inc: jest.fn() },
}));

const { CircuitBreaker, CircuitOpenError, STATES, getBreaker, clearRegistry } =
  await import('../../lib/circuitBreaker.js');

// ─── Helpers ──────────────────────────────────────────────────────────────────

const SUCCESS = () => Promise.resolve('ok');
const FAILURE = () => Promise.reject(new Error('dependency down'));

function makeBreaker(overrides = {}) {
  return new CircuitBreaker('test', {
    failureThreshold: 3,
    successThreshold: 2,
    timeout: 5000,
    windowSize: 10000,
    ...overrides,
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  clearRegistry();
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

// ─── Initial state ────────────────────────────────────────────────────────────

describe('initial state', () => {
  it('starts in CLOSED state', () => {
    const cb = makeBreaker();
    expect(cb.state).toBe(STATES.CLOSED);
  });

  it('emits state metric on construction', () => {
    makeBreaker();
    expect(circuitBreakerStateMock.set).toHaveBeenCalledWith({ name: 'test' }, 0);
  });
});

// ─── CLOSED → OPEN ───────────────────────────────────────────────────────────

describe('CLOSED → OPEN transition', () => {
  it('opens after failureThreshold failures', async () => {
    const cb = makeBreaker({ failureThreshold: 3 });

    for (let i = 0; i < 3; i++) {
      await expect(cb.execute(FAILURE)).rejects.toThrow('dependency down');
    }

    expect(cb.state).toBe(STATES.OPEN);
  });

  it('does not open before the threshold is reached', async () => {
    const cb = makeBreaker({ failureThreshold: 3 });

    for (let i = 0; i < 2; i++) {
      await expect(cb.execute(FAILURE)).rejects.toThrow();
    }

    expect(cb.state).toBe(STATES.CLOSED);
  });

  it('records transition metric on open', async () => {
    const cb = makeBreaker({ failureThreshold: 2 });
    await expect(cb.execute(FAILURE)).rejects.toThrow();
    await expect(cb.execute(FAILURE)).rejects.toThrow();

    expect(circuitBreakerTransMock.inc).toHaveBeenCalledWith(
      expect.objectContaining({ from: 'CLOSED', to: 'OPEN' }),
    );
  });

  it('resets failure window when a success arrives', async () => {
    const cb = makeBreaker({ failureThreshold: 3 });

    // Two failures
    await expect(cb.execute(FAILURE)).rejects.toThrow();
    await expect(cb.execute(FAILURE)).rejects.toThrow();

    // Success resets (implicitly via success call in CLOSED mode)
    await cb.execute(SUCCESS);

    // Advance window so old failures expire
    jest.advanceTimersByTime(11000);

    // One more failure should not open (window was reset)
    await expect(cb.execute(FAILURE)).rejects.toThrow();
    expect(cb.state).toBe(STATES.CLOSED);
  });
});

// ─── OPEN → reject ────────────────────────────────────────────────────────────

describe('OPEN state — fail fast', () => {
  async function openBreaker(cb) {
    for (let i = 0; i < cb._opts.failureThreshold; i++) {
      await expect(cb.execute(FAILURE)).rejects.toThrow();
    }
    expect(cb.state).toBe(STATES.OPEN);
  }

  it('rejects immediately with CircuitOpenError', async () => {
    const cb = makeBreaker({ failureThreshold: 2 });
    await openBreaker(cb);

    await expect(cb.execute(SUCCESS)).rejects.toBeInstanceOf(CircuitOpenError);
  });

  it('records "rejected" metric for fail-fast calls', async () => {
    const cb = makeBreaker({ failureThreshold: 2 });
    await openBreaker(cb);

    jest.clearAllMocks();
    await expect(cb.execute(SUCCESS)).rejects.toBeInstanceOf(CircuitOpenError);

    expect(circuitBreakerCallsMock.inc).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: 'rejected' }),
    );
  });

  it('CircuitOpenError has correct properties', async () => {
    const cb = makeBreaker({ failureThreshold: 2 });
    await openBreaker(cb);

    try {
      await cb.execute(SUCCESS);
    } catch (err) {
      expect(err.code).toBe('CIRCUIT_OPEN');
      expect(err.circuit).toBe('test');
      expect(err.nextAttemptAt).toBeGreaterThan(Date.now());
    }
  });
});

// ─── OPEN → HALF_OPEN ────────────────────────────────────────────────────────

describe('OPEN → HALF_OPEN transition', () => {
  async function openBreaker(cb) {
    for (let i = 0; i < cb._opts.failureThreshold; i++) {
      await expect(cb.execute(FAILURE)).rejects.toThrow();
    }
  }

  it('transitions to HALF_OPEN after timeout elapses', async () => {
    const cb = makeBreaker({ failureThreshold: 2, timeout: 5000 });
    await openBreaker(cb);

    jest.advanceTimersByTime(5001);

    // Next call should be allowed (transitions to HALF_OPEN first)
    await cb.execute(SUCCESS);
    // After one success, still HALF_OPEN (successThreshold is 2)
    expect(cb.state).toBe(STATES.HALF_OPEN);
  });

  it('still rejects before timeout elapses', async () => {
    const cb = makeBreaker({ failureThreshold: 2, timeout: 5000 });
    await openBreaker(cb);

    jest.advanceTimersByTime(4999);

    await expect(cb.execute(SUCCESS)).rejects.toBeInstanceOf(CircuitOpenError);
    expect(cb.state).toBe(STATES.OPEN);
  });
});

// ─── HALF_OPEN → CLOSED ───────────────────────────────────────────────────────

describe('HALF_OPEN → CLOSED transition', () => {
  async function halfOpenBreaker(cb) {
    for (let i = 0; i < cb._opts.failureThreshold; i++) {
      await expect(cb.execute(FAILURE)).rejects.toThrow();
    }
    jest.advanceTimersByTime(cb._opts.timeout + 1);
  }

  it('closes after successThreshold consecutive successes', async () => {
    const cb = makeBreaker({ failureThreshold: 2, successThreshold: 2, timeout: 1000 });
    await halfOpenBreaker(cb);

    await cb.execute(SUCCESS); // 1st success in HALF_OPEN
    expect(cb.state).toBe(STATES.HALF_OPEN);

    await cb.execute(SUCCESS); // 2nd success → CLOSED
    expect(cb.state).toBe(STATES.CLOSED);
  });

  it('records transition metric on close', async () => {
    const cb = makeBreaker({ failureThreshold: 2, successThreshold: 1, timeout: 1000 });
    await halfOpenBreaker(cb);
    jest.clearAllMocks();

    await cb.execute(SUCCESS);

    expect(circuitBreakerTransMock.inc).toHaveBeenCalledWith(
      expect.objectContaining({ from: 'HALF_OPEN', to: 'CLOSED' }),
    );
  });
});

// ─── HALF_OPEN → OPEN ────────────────────────────────────────────────────────

describe('HALF_OPEN → OPEN on failure', () => {
  it('reopens immediately on any failure in HALF_OPEN', async () => {
    const cb = makeBreaker({ failureThreshold: 2, timeout: 1000 });

    for (let i = 0; i < 2; i++) {
      await expect(cb.execute(FAILURE)).rejects.toThrow();
    }
    jest.advanceTimersByTime(1001);

    // Trigger HALF_OPEN probe, then fail
    await expect(cb.execute(FAILURE)).rejects.toThrow('dependency down');
    expect(cb.state).toBe(STATES.OPEN);
  });
});

// ─── reset() ─────────────────────────────────────────────────────────────────

describe('reset()', () => {
  it('forces the breaker back to CLOSED', async () => {
    const cb = makeBreaker({ failureThreshold: 2 });
    await expect(cb.execute(FAILURE)).rejects.toThrow();
    await expect(cb.execute(FAILURE)).rejects.toThrow();

    cb.reset();
    expect(cb.state).toBe(STATES.CLOSED);
  });

  it('allows calls again after reset', async () => {
    const cb = makeBreaker({ failureThreshold: 2 });
    await expect(cb.execute(FAILURE)).rejects.toThrow();
    await expect(cb.execute(FAILURE)).rejects.toThrow();

    cb.reset();
    await expect(cb.execute(SUCCESS)).resolves.toBe('ok');
  });
});

// ─── toJSON() ────────────────────────────────────────────────────────────────

describe('toJSON()', () => {
  it('returns a snapshot with all fields', () => {
    const cb = makeBreaker();
    const snap = cb.toJSON();
    expect(snap).toMatchObject({
      name: 'test',
      state: STATES.CLOSED,
      failureCount: 0,
      successCount: 0,
    });
  });
});

// ─── Registry ─────────────────────────────────────────────────────────────────

describe('getBreaker registry', () => {
  it('returns the same instance for the same name', () => {
    const a = getBreaker('db');
    const b = getBreaker('db');
    expect(a).toBe(b);
  });

  it('returns different instances for different names', () => {
    const a = getBreaker('db');
    const b = getBreaker('stellar');
    expect(a).not.toBe(b);
  });

  it('clearRegistry creates fresh instances', () => {
    const a = getBreaker('db');
    clearRegistry();
    const b = getBreaker('db');
    expect(a).not.toBe(b);
  });
});

// ─── Sliding window ───────────────────────────────────────────────────────────

describe('sliding failure window', () => {
  it('does not count failures that have aged out of the window', async () => {
    const cb = makeBreaker({ failureThreshold: 3, windowSize: 5000 });

    // Two failures
    await expect(cb.execute(FAILURE)).rejects.toThrow();
    await expect(cb.execute(FAILURE)).rejects.toThrow();

    // Age them out
    jest.advanceTimersByTime(5001);

    // One more failure — still below threshold with fresh window
    await expect(cb.execute(FAILURE)).rejects.toThrow();
    expect(cb.state).toBe(STATES.CLOSED);
  });
});
