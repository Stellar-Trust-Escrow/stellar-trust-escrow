/**
 * Transaction Utilities
 *
 * Wraps Prisma $transaction with:
 *   - Deadlock detection (PostgreSQL 40P01, serialization failure 40001)
 *   - Exponential backoff retry with ±20% jitter
 *   - Configurable isolation level
 *
 * Usage:
 *   import { withTransaction } from '../lib/transaction.js';
 *   const result = await withTransaction(async (tx) => {
 *     await tx.escrow.update(...);
 *     await tx.milestone.updateMany(...);
 *     return result;
 *   });
 */

import prisma from './prisma.js';

const RETRYABLE_CODES = new Set(['40P01', '40001']); // deadlock, serialization failure

const DEFAULT_MAX_RETRIES = parseInt(process.env.TX_MAX_RETRIES || '3', 10);
const DEFAULT_BASE_DELAY_MS = parseInt(process.env.TX_BASE_DELAY_MS || '50', 10);
const DEFAULT_ISOLATION = process.env.TX_ISOLATION_LEVEL || 'ReadCommitted';

export function isDeadlock(err) {
  const code = err?.code ?? err?.meta?.code;
  return RETRYABLE_CODES.has(code);
}

function sleep(ms) {
  const jitter = ms * 0.2 * (Math.random() * 2 - 1);
  return new Promise((r) => setTimeout(r, Math.max(0, ms + jitter)));
}

export async function withRetry(
  fn,
  { maxRetries = DEFAULT_MAX_RETRIES, baseDelayMs = DEFAULT_BASE_DELAY_MS } = {},
) {
  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (err) {
      attempt++;
      if (!isDeadlock(err) || attempt > maxRetries) throw err;
      const delay = baseDelayMs * 2 ** (attempt - 1);
      console.warn(`[TX] Deadlock (attempt ${attempt}/${maxRetries}), retrying in ${delay}ms`);
      await sleep(delay);
    }
  }
}

export async function withTransaction(
  fn,
  {
    isolationLevel = DEFAULT_ISOLATION,
    maxRetries = DEFAULT_MAX_RETRIES,
    baseDelayMs = DEFAULT_BASE_DELAY_MS,
    timeout = 10_000,
  } = {},
) {
  return withRetry(() => prisma.$transaction(fn, { isolationLevel, timeout }), {
    maxRetries,
    baseDelayMs,
  });
}

export default { withTransaction, withRetry, isDeadlock };
