/**
 * Chaos Fault Injector
 *
 * Primitives for injecting faults into the running process.
 * All injectors are no-ops unless CHAOS_ENABLED=true.
 *
 * Supported fault types:
 *   latency       — adds artificial delay before proceeding
 *   error         — throws / responds with an HTTP error
 *   timeout       — never resolves within a given window
 *   db-failure    — simulates a Prisma connection error
 *   stellar-error — simulates a Stellar RPC failure
 */

import { chaosInjectedTotal } from '../lib/metrics.js';

/**
 * Returns true when chaos mode is enabled.
 * Controlled by the CHAOS_ENABLED environment variable.
 */
export function isChaosEnabled() {
  return process.env.CHAOS_ENABLED === 'true';
}

/**
 * Inject artificial latency.
 *
 * @param {number}  delayMs    Base delay in milliseconds
 * @param {number}  [jitter=0] Max random jitter added on top of delayMs
 * @param {string}  [experimentId='manual']
 * @returns {Promise<void>}
 */
export async function injectLatency(delayMs, jitter = 0, experimentId = 'manual') {
  if (!isChaosEnabled()) return;

  const actual = delayMs + Math.floor(Math.random() * jitter);
  chaosInjectedTotal.inc({ experiment_id: experimentId, fault_type: 'latency' });
  await new Promise((resolve) => setTimeout(resolve, actual));
}

/**
 * Inject an HTTP error response and abort further request handling.
 *
 * @param {import('express').Response} res
 * @param {number}  statusCode
 * @param {string}  message
 * @param {string}  [experimentId='manual']
 * @returns {boolean} true if the error was injected, false if chaos disabled
 */
export function injectHttpError(res, statusCode, message, experimentId = 'manual') {
  if (!isChaosEnabled()) return false;

  chaosInjectedTotal.inc({ experiment_id: experimentId, fault_type: 'http-error' });
  res.status(statusCode).json({ error: message, chaos: true });
  return true;
}

/**
 * Inject a database connection error (Prisma P1001 code).
 *
 * @param {string} [experimentId='manual']
 * @throws {Error} with Prisma error code P1001
 */
export function injectDatabaseError(experimentId = 'manual') {
  if (!isChaosEnabled()) return;

  chaosInjectedTotal.inc({ experiment_id: experimentId, fault_type: 'db-failure' });
  const err = new Error("Can't reach database server — chaos injected");
  err.code = 'P1001';
  throw err;
}

/**
 * Inject a Stellar RPC error.
 *
 * @param {string} [experimentId='manual']
 * @throws {Error}
 */
export function injectStellarError(experimentId = 'manual') {
  if (!isChaosEnabled()) return;

  chaosInjectedTotal.inc({ experiment_id: experimentId, fault_type: 'stellar-error' });
  const err = new Error('Stellar RPC unavailable — chaos injected');
  err.code = 'STELLAR_RPC_ERROR';
  throw err;
}

/**
 * Wrap an async operation with a hard timeout.
 * If the operation doesn't complete within timeoutMs the promise rejects
 * with a timeout error.
 *
 * @template T
 * @param {() => Promise<T>} fn
 * @param {number}           timeoutMs
 * @param {string}           [experimentId='manual']
 * @returns {Promise<T>}
 */
export async function withTimeout(fn, timeoutMs, experimentId = 'manual') {
  if (isChaosEnabled()) {
    chaosInjectedTotal.inc({ experiment_id: experimentId, fault_type: 'timeout' });
  }

  return Promise.race([
    fn(),
    new Promise((_, reject) =>
      setTimeout(() => {
        const err = new Error(`Operation timed out after ${timeoutMs}ms`);
        err.code = 'ETIMEDOUT';
        reject(err);
      }, timeoutMs),
    ),
  ]);
}

/**
 * Probabilistic fault gate — apply a fault at the given probability.
 *
 * @param {number}   probability  0–1 (e.g. 0.3 = 30% chance)
 * @param {Function} faultFn      Fault to apply (sync or async)
 * @returns {Promise<boolean>}    true if the fault was triggered
 */
export async function withProbability(probability, faultFn) {
  if (!isChaosEnabled()) return false;
  if (Math.random() < probability) {
    await faultFn();
    return true;
  }
  return false;
}
