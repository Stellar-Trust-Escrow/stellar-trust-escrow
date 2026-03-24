/**
 * Database Retry and Reconnection Utilities
 *
 * Provides retry logic for transient database errors and enhanced error handling.
 */

import { dbConnectionErrorsTotal } from './metrics.js';

const RETRY_ATTEMPTS = 3;
const RETRY_DELAY_MS = 1000;
const RETRY_BACKOFF_MULTIPLIER = 2;

/**
 * Retry configuration for database operations
 */
export const retryConfig = {
  attempts: RETRY_ATTEMPTS,
  delay: RETRY_DELAY_MS,
  backoff: RETRY_BACKOFF_MULTIPLIER,
};

/**
 * Check if an error is retryable (transient)
 * @param {Error} error - Database error
 * @returns {boolean} True if error is retryable
 */
export function isRetryableError(error) {
  // Prisma error codes that are typically transient
  const retryableCodes = [
    'P1001', // Can't reach database server
    'P1008', // Operations timed out
    'P1017', // Server has closed the connection
    'P2028', // Transaction API error (connection issues)
  ];

  // PostgreSQL error codes that are transient
  const retryablePgCodes = [
    'ECONNRESET',
    'ECONNREFUSED',
    'ETIMEDOUT',
    'ENOTFOUND',
  ];

  return (
    retryableCodes.includes(error.code) ||
    retryablePgCodes.includes(error.code) ||
    error.message?.includes('connection') ||
    error.message?.includes('timeout')
  );
}

/**
 * Retry a database operation with exponential backoff
 * @param {Function} operation - Async operation to retry
 * @param {Object} config - Retry configuration
 * @returns {Promise} Operation result
 */
export async function retryDatabaseOperation(operation, config = retryConfig) {
  let lastError;

  for (let attempt = 1; attempt <= config.attempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      // Track connection errors
      dbConnectionErrorsTotal.inc({
        error_type: error.code || 'unknown'
      });

      // If this is the last attempt or error is not retryable, throw
      if (attempt === config.attempts || !isRetryableError(error)) {
        throw error;
      }

      // Calculate delay with exponential backoff
      const delay = config.delay * Math.pow(config.backoff, attempt - 1);

      console.warn(
        `[DB RETRY] Attempt ${attempt}/${config.attempts} failed: ${error.message}. Retrying in ${delay}ms...`
      );

      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

/**
 * Enhanced Prisma middleware with retry logic for transient failures
 * @param {import('@prisma/client').PrismaClient} prisma
 */
export function attachRetryMiddleware(prisma) {
  prisma.$use(async (params, next) => {
    return retryDatabaseOperation(() => next(params));
  });
}