import { createLogger, format, transports } from 'winston';

const { combine, timestamp, json } = format;

// Sensitive field patterns — never log these
const SENSITIVE_KEYS = /^(password|secret|token|key|authorization|db_url|database_url|connection_string)$/i;

/**
 * Redact any top-level sensitive keys from a log metadata object.
 * This is a safety net; callers should never pass raw request bodies.
 */
function sanitize(obj) {
  const result = {};
  for (const [k, v] of Object.entries(obj)) {
    result[k] = SENSITIVE_KEYS.test(k) ? '[REDACTED]' : v;
  }
  return result;
}

const logger = createLogger({
  level: process.env.LOG_LEVEL ?? 'info',
  format: combine(timestamp(), json()),
  transports: [new transports.Console()],
});

/**
 * Log an error with request context.
 *
 * @param {Error} err  - The error to log.
 * @param {object|null} req - Express request object (may be null for process-level errors).
 */
function log(err, req) {
  const statusCode = err?.statusCode ?? 500;
  const requestId = req?.headers?.['x-request-id'] ?? undefined;
  const method = req?.method ?? undefined;
  const url = req?.url ?? undefined;

  const base = sanitize({
    code: err?.code ?? 'INTERNAL_ERROR',
    message: err?.message ?? 'Unknown error',
    ...(method !== undefined && { method }),
    ...(url !== undefined && { url }),
    ...(requestId !== undefined && { requestId }),
  });

  if (statusCode >= 500) {
    logger.error({ ...base, stack: err?.stack });
  } else {
    logger.warn(base);
  }
}

export default { log };
