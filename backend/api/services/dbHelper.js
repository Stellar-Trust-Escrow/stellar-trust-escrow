/**
 * Database Helper — Transactional Retry Wrapper
 *
 * Wraps Prisma $transaction calls with deadlock-aware retry logic.
 * On PostgreSQL deadlock (40P01) or serialization failure (40001),
 * waits a random jitter duration and retries up to MAX_RETRIES times.
 * Throws after exhausting retries so callers can surface the error.
 *
 * Usage:
 *   import { withRetryTransaction } from '../api/services/dbHelper.js';
 *   const result = await withRetryTransaction((tx) => {
 *     return tx.escrow.update(...);
 *   });
 */

import prisma from '../../lib/prisma.js';
import { createModuleLogger } from '../../config/logger.js';

const log = createModuleLogger('dbHelper');

/** PostgreSQL error codes that indicate a retryable concurrency conflict. */
export const DEADLOCK_CODES = new Set(['40P01', '40001']);

const MAX_RETRIES = parseInt(process.env.DB_RETRY_MAX || '3', 10);
const BASE_DELAY_MS = parseInt(process.env.DB_RETRY_BASE_MS || '50', 10);
const MAX_DELAY_MS = parseInt(process.env.DB_RETRY_MAX_MS || '200', 10);

/**
 * Returns true when the error is a retryable deadlock / serialization failure.
 * @param {unknown} err
 */
export function isDeadlockError(err) {
  const code = err?.code ?? err?.meta?.code;
  return DEADLOCK_CODES.has(code);
}

/**
 * Execute a Prisma transaction with automatic deadlock retry.
 *
 * @template T
 * @param {(tx: import('@prisma/client').PrismaClient) => Promise<T>} fn
 * @param {object} [opts]
 * @param {number} [opts.maxRetries]     — override MAX_RETRIES
 * @param {number} [opts.baseDelayMs]    — override BASE_DELAY_MS
 * @param {string} [opts.isolationLevel] — Prisma isolation level
 * @returns {Promise<T>}
 */
export async function withRetryTransaction(
  fn,
  { maxRetries = MAX_RETRIES, baseDelayMs = BASE_DELAY_MS, isolationLevel = 'ReadCommitted' } = {},
) {
  let attempt = 0;

  while (true) {
    try {
      return await prisma.$transaction(fn, { isolationLevel });
    } catch (err) {
      attempt++;

      if (!isDeadlockError(err) || attempt > maxRetries) {
        if (attempt > maxRetries) {
          log.error({
            message: 'db_deadlock_max_retries_exceeded',
            attempts: attempt,
            error: err?.message,
            code: err?.code,
          });
        }
        throw err;
      }

      const base = Math.min(baseDelayMs * 2 ** (attempt - 1), MAX_DELAY_MS);
      const jitter = base + Math.random() * base; // uniform jitter: [base, 2*base]

      log.warn({
        message: 'db_deadlock_retry',
        attempt,
        maxRetries,
        delayMs: Math.round(jitter),
        code: err?.code,
      });

      await new Promise((r) => setTimeout(r, jitter));
    }
  }
}

export default { withRetryTransaction, isDeadlockError, DEADLOCK_CODES };
