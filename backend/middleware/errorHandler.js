/**
 * Global Express error handler middleware.
 * Must be registered as the last middleware in the chain (after Sentry).
 */

import { randomUUID } from 'crypto';
import { AppError, NotFoundError, ValidationError } from '../lib/errors.js';
import errorLogger from '../lib/errorLogger.js';
import { errorsTotal } from '../lib/metrics.js';

// File system path patterns to strip from error messages
const FS_PATH_PATTERN = /(?:\/home\/|\/usr\/|\/var\/|\/tmp\/|\/opt\/|C:\\|node_modules\/)[\w./\\-]*/g;

/**
 * Strip file system paths from a message string.
 * @param {string} message
 * @returns {string}
 */
function sanitizeMessage(message) {
  if (typeof message !== 'string') return message;
  return message.replace(FS_PATH_PATTERN, '[path]');
}

/**
 * Normalize Prisma-specific errors into AppError subclasses.
 * @param {Error} err
 * @returns {Error}
 */
function normalizePrismaError(err) {
  const name = err?.constructor?.name;

  if (name === 'PrismaClientKnownRequestError' && err.code === 'P2025') {
    return new NotFoundError(err.message || 'Resource not found');
  }

  if (name === 'PrismaClientValidationError') {
    return new ValidationError('Invalid request data');
  }

  return err;
}

/**
 * Four-argument Express error handler.
 */
// eslint-disable-next-line no-unused-vars
export default function errorHandler(err, req, res, next) {
  // 1. Normalize Prisma errors
  const normalized = normalizePrismaError(err);

  // 2. Derive requestId
  const requestId = req.headers?.['x-request-id'] ?? randomUUID();

  // 3. Determine statusCode and code
  const isAppError = normalized instanceof AppError;
  const statusCode = isAppError ? normalized.statusCode : 500;
  const code = isAppError ? normalized.code : 'INTERNAL_ERROR';
  const isOperational = isAppError ? normalized.isOperational : false;

  // 4. Sanitize message
  const isProduction = process.env.NODE_ENV === 'production';
  let message = normalized.message || 'An unexpected error occurred';

  // Strip file system paths
  message = sanitizeMessage(message);

  // In production, replace non-operational error messages
  if (isProduction && !isOperational) {
    message = 'An unexpected error occurred';
  }

  // 5. Log the error
  errorLogger.log(normalized, req);

  // 6. Increment Prometheus counter
  errorsTotal.inc({
    type: normalized.code || 'INTERNAL_ERROR',
    route: req.path || 'unknown',
  });

  // 7. Build and send Error_Response
  const errorBody = {
    code,
    message,
    requestId,
  };

  if (!isProduction) {
    errorBody.stack = normalized.stack;
  }

  res.setHeader('Content-Type', 'application/json');
  res.status(statusCode).json({ error: errorBody });
}
