/**
 * Circuit Breaker
 *
 * Implements the circuit breaker pattern to prevent cascading failures.
 * Wraps external calls (database, Stellar RPC, third-party APIs) and
 * automatically fails fast when a dependency is unhealthy.
 *
 * States:
 *   CLOSED    — Normal operation. Requests flow through.
 *   OPEN      — Failing fast. All requests rejected immediately.
 *   HALF_OPEN — Recovery probe. Limited requests allowed to test health.
 *
 * Transition rules:
 *   CLOSED  → OPEN       when failures >= failureThreshold within windowSize
 *   OPEN    → HALF_OPEN  after timeout ms has elapsed
 *   HALF_OPEN → CLOSED   after successThreshold consecutive successes
 *   HALF_OPEN → OPEN     on any failure
 */

import {
  circuitBreakerState,
  circuitBreakerCallsTotal,
  circuitBreakerTransitionsTotal,
} from './metrics.js';

export const STATES = Object.freeze({
  CLOSED: 'CLOSED',
  OPEN: 'OPEN',
  HALF_OPEN: 'HALF_OPEN',
});

const STATE_VALUES = { CLOSED: 0, OPEN: 1, HALF_OPEN: 2 };

const DEFAULT_OPTIONS = {
  failureThreshold: 5,    // failures before opening
  successThreshold: 2,    // consecutive successes in HALF_OPEN to close
  timeout: 30_000,        // ms to wait in OPEN before probing
  windowSize: 10_000,     // ms sliding window for failure counting
};

export class CircuitBreaker {
  /**
   * @param {string} name          Identifier used in logs and metrics
   * @param {object} [options]     Override default thresholds
   */
  constructor(name, options = {}) {
    this.name = name;
    this._state = STATES.CLOSED;
    this._failureTimestamps = [];  // sliding window of failure times
    this._successCount = 0;        // consecutive successes in HALF_OPEN
    this._nextAttemptAt = 0;       // epoch ms when OPEN → HALF_OPEN allowed

    this._opts = { ...DEFAULT_OPTIONS, ...options };

    // Initialise state metric
    circuitBreakerState.set({ name: this.name }, STATE_VALUES.CLOSED);
  }

  get state() {
    return this._state;
  }

  /**
   * Execute a function protected by the circuit breaker.
   *
   * @template T
   * @param {() => Promise<T>} fn
   * @returns {Promise<T>}
   * @throws {CircuitOpenError} if the circuit is OPEN and the probe window has not elapsed
   */
  async execute(fn) {
    this._maybeTransitionFromOpen();

    if (this._state === STATES.OPEN) {
      circuitBreakerCallsTotal.inc({ name: this.name, outcome: 'rejected' });
      throw new CircuitOpenError(this.name, this._nextAttemptAt);
    }

    try {
      const result = await fn();
      this._onSuccess();
      return result;
    } catch (error) {
      this._onFailure();
      throw error;
    }
  }

  /**
   * Manually reset the circuit breaker to CLOSED.
   * Use in tests or after confirming a dependency is healthy.
   */
  reset() {
    this._transitionTo(STATES.CLOSED);
    this._failureTimestamps = [];
    this._successCount = 0;
  }

  /**
   * Returns a snapshot of the circuit breaker for health endpoints.
   */
  toJSON() {
    return {
      name: this.name,
      state: this._state,
      failureCount: this._countRecentFailures(),
      successCount: this._successCount,
      nextAttemptAt: this._nextAttemptAt || null,
      options: this._opts,
    };
  }

  // ─── Private ────────────────────────────────────────────────────────────────

  _onSuccess() {
    circuitBreakerCallsTotal.inc({ name: this.name, outcome: 'success' });

    if (this._state === STATES.HALF_OPEN) {
      this._successCount++;
      if (this._successCount >= this._opts.successThreshold) {
        this._transitionTo(STATES.CLOSED);
      }
    } else {
      // Prune old failures on success to avoid stale window data
      this._pruneFailureWindow();
    }
  }

  _onFailure() {
    circuitBreakerCallsTotal.inc({ name: this.name, outcome: 'failure' });
    this._failureTimestamps.push(Date.now());
    this._pruneFailureWindow();

    if (this._state === STATES.HALF_OPEN) {
      // Single failure in HALF_OPEN reopens the circuit
      this._transitionTo(STATES.OPEN);
    } else if (this._countRecentFailures() >= this._opts.failureThreshold) {
      this._transitionTo(STATES.OPEN);
    }
  }

  _maybeTransitionFromOpen() {
    if (this._state === STATES.OPEN && Date.now() >= this._nextAttemptAt) {
      this._transitionTo(STATES.HALF_OPEN);
    }
  }

  _transitionTo(newState) {
    const oldState = this._state;
    if (oldState === newState) return;

    this._state = newState;

    if (newState === STATES.OPEN) {
      this._nextAttemptAt = Date.now() + this._opts.timeout;
      this._successCount = 0;
      console.warn(
        `[CircuitBreaker] "${this.name}": ${oldState} → OPEN` +
        ` (probe at ${new Date(this._nextAttemptAt).toISOString()})`,
      );
    } else if (newState === STATES.HALF_OPEN) {
      this._successCount = 0;
      console.info(`[CircuitBreaker] "${this.name}": ${oldState} → HALF_OPEN`);
    } else if (newState === STATES.CLOSED) {
      this._failureTimestamps = [];
      this._successCount = 0;
      this._nextAttemptAt = 0;
      console.info(`[CircuitBreaker] "${this.name}": ${oldState} → CLOSED`);
    }

    circuitBreakerState.set({ name: this.name }, STATE_VALUES[newState]);
    circuitBreakerTransitionsTotal.inc({ name: this.name, from: oldState, to: newState });
  }

  _pruneFailureWindow() {
    const cutoff = Date.now() - this._opts.windowSize;
    this._failureTimestamps = this._failureTimestamps.filter((t) => t > cutoff);
  }

  _countRecentFailures() {
    this._pruneFailureWindow();
    return this._failureTimestamps.length;
  }
}

/**
 * Thrown when a call is rejected because the circuit is OPEN.
 */
export class CircuitOpenError extends Error {
  constructor(name, nextAttemptAt) {
    super(`Circuit breaker OPEN for "${name}". Next probe at ${new Date(nextAttemptAt).toISOString()}.`);
    this.name = 'CircuitOpenError';
    this.circuit = name;
    this.nextAttemptAt = nextAttemptAt;
    this.code = 'CIRCUIT_OPEN';
  }
}

// ─── Registry ─────────────────────────────────────────────────────────────────
// Module-level named breakers so services share the same instance.

const _registry = new Map();

/**
 * Get or create a named circuit breaker.
 *
 * @param {string} name
 * @param {object} [options]
 * @returns {CircuitBreaker}
 */
export function getBreaker(name, options = {}) {
  if (!_registry.has(name)) {
    _registry.set(name, new CircuitBreaker(name, options));
  }
  return _registry.get(name);
}

/**
 * List all registered circuit breakers (for health endpoints).
 *
 * @returns {object[]}
 */
export function getAllBreakers() {
  return Array.from(_registry.values()).map((b) => b.toJSON());
}

/**
 * Reset all registered circuit breakers. Useful in tests.
 */
export function resetAllBreakers() {
  for (const breaker of _registry.values()) {
    breaker.reset();
  }
}

/**
 * Clear the registry entirely. Useful in tests.
 */
export function clearRegistry() {
  _registry.clear();
}
