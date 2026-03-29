/**
 * Structured JSON logging (Winston) with optional daily file rotation.
 *
 * Env:
 *   LOG_LEVEL              — debug | info | warn | error (default: info prod, debug dev)
 *   LOG_FILE_ENABLED       — set "true" to write rotated files under LOG_DIR
 *   LOG_DIR                — directory for rotated logs (default: logs)
 *   LOG_MAX_SIZE           — max size per file before rotate (default: 20m)
 *   LOG_MAX_FILES          — retention, e.g. 14d (default: 14d)
 *   LOG_SERVICE_NAME       — default meta.service (default: stellar-trust-escrow-api)
 *   LOG_AGGREGATOR_URL     — optional HTTPS URL; Winston HTTP transport POSTs JSON logs
 *   LOG_AGGREGATOR_TOKEN   — optional Bearer token for LOG_AGGREGATOR_URL
 *
 * Aggregation: stdout JSON lines are compatible with Docker/Kubernetes log drivers,
 * Fluent Bit, Vector, Datadog Agent, CloudWatch Logs, etc., without extra code.
 */

import 'dotenv/config';
import { AsyncLocalStorage } from 'node:async_hooks';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, '..');

const isProd = process.env.NODE_ENV === 'production';
const level = process.env.LOG_LEVEL || (isProd ? 'info' : 'debug');

const serviceName = process.env.LOG_SERVICE_NAME || 'stellar-trust-escrow-api';
const environment = process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || 'development';

/** @type {AsyncLocalStorage<{ requestId: string }>} */
export const requestContext = new AsyncLocalStorage();

const baseMeta = () => ({
  service: serviceName,
  environment,
});

const jsonFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format((info) => {
    const ctx = requestContext.getStore();
    if (ctx?.requestId) Object.assign(info, { requestId: ctx.requestId });
    return info;
  })(),
  winston.format.json(),
);

const transports = [
  new winston.transports.Console({
    level,
    format: jsonFormat,
    handleExceptions: true,
    handleRejections: true,
  }),
];

const fileEnabled = String(process.env.LOG_FILE_ENABLED || '').toLowerCase() === 'true';
const logDir = process.env.LOG_DIR || path.join(rootDir, 'logs');

if (fileEnabled) {
  fs.mkdirSync(logDir, { recursive: true });
  transports.push(
    new DailyRotateFile({
      dirname: logDir,
      filename: 'app-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      maxSize: process.env.LOG_MAX_SIZE || '20m',
      maxFiles: process.env.LOG_MAX_FILES || '14d',
      level,
      format: jsonFormat,
    }),
    new DailyRotateFile({
      dirname: logDir,
      filename: 'error-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      maxSize: process.env.LOG_MAX_SIZE || '20m',
      maxFiles: process.env.LOG_MAX_FILES || '14d',
      level: 'error',
      format: jsonFormat,
    }),
  );
}

const aggregatorUrl = process.env.LOG_AGGREGATOR_URL?.trim();
if (aggregatorUrl) {
  try {
    const u = new URL(aggregatorUrl);
    const ssl = u.protocol === 'https:';
    const port = u.port ? Number(u.port) : ssl ? 443 : 80;
    const headers = {};
    if (process.env.LOG_AGGREGATOR_TOKEN) {
      headers.Authorization = `Bearer ${process.env.LOG_AGGREGATOR_TOKEN}`;
    }
    const logPath = `${u.pathname || '/'}${u.search || ''}`;
    transports.push(
      new winston.transports.Http({
        host: u.hostname,
        port,
        path: logPath,
        ssl,
        level,
        format: jsonFormat,
        headers: Object.keys(headers).length ? headers : undefined,
      }),
    );
  } catch {
    process.stderr.write(`[logger] Invalid LOG_AGGREGATOR_URL — skipping HTTP transport\n`);
  }
}

const rootLogger = winston.createLogger({
  level,
  defaultMeta: baseMeta(),
  transports,
  exitOnError: false,
});

/**
 * Logger for the current HTTP request (includes requestId when in request context).
 */
export function getLogger() {
  return rootLogger;
}

/**
 * Child logger for background modules (indexer, email, websocket, etc.).
 * @param {string} module
 */
export function createModuleLogger(module) {
  return rootLogger.child({ module });
}

/**
 * Log controller failures with stack trace (use inside catch blocks).
 * @param {string} operation — e.g. escrow.listEscrows
 * @param {unknown} err
 * @param {import('express').Request} [req]
 */
export function logControllerError(operation, err, req) {
  const e = err instanceof Error ? err : new Error(String(err));
  rootLogger.error({
    message: operation,
    error: e.message,
    stack: e.stack,
    method: req?.method,
    path: req?.path,
    requestId: requestContext.getStore()?.requestId,
  });
}

export default rootLogger;
