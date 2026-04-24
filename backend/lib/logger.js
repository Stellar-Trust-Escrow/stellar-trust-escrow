import fs from 'fs';
import path from 'path';
import pino from 'pino';
import pinoHttp from 'pino-http';
import { randomUUID } from 'crypto';
import rfs from 'rotating-file-stream';
import * as Sentry from './sentry.js';

const LOG_LEVEL = process.env.LOG_LEVEL || 'info';
const LOG_DIR = process.env.LOG_DIR || 'logs';
const LOG_FILE = process.env.LOG_FILE_NAME || 'api.log';
const LOG_ROTATION_PERIOD = process.env.LOG_ROTATION_PERIOD || '1d';
const LOG_ROTATION_MAX_SIZE = process.env.LOG_ROTATION_MAX_SIZE || '1G';
const LOG_RETENTION_DAYS = Number(process.env.LOG_RETENTION_DAYS || '30');

const resolvedLogDir = path.resolve(process.cwd(), LOG_DIR);
if (!fs.existsSync(resolvedLogDir)) {
  fs.mkdirSync(resolvedLogDir, { recursive: true });
}

const rotatingStream = rfs.createStream(LOG_FILE, {
  interval: LOG_ROTATION_PERIOD,
  maxSize: LOG_ROTATION_MAX_SIZE,
  maxFiles: LOG_RETENTION_DAYS,
  path: resolvedLogDir,
  compress: 'gzip',
});

const redactPaths = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["set-cookie"]',
  'req.headers["x-admin-api-key"]',
  'req.body.password',
  'req.body.private_key',
  'req.body.secret_key',
  'req.body.seed',
  'req.body.mnemonic',
];

export const logger = pino(
  {
    level: LOG_LEVEL,
    redact: {
      paths: redactPaths,
      censor: '[REDACTED]',
    },
    base: {
      service: 'stellar-trust-escrow-backend',
      env: process.env.NODE_ENV || 'development',
    },
    timestamp: pino.stdTimeFunctions.isoTime,
  },
  rotatingStream,
);

const pinoRequestLogger = pinoHttp({
  logger,
  genReqId: (req) => {
    const headerId = req.headers['x-request-id'] || req.headers['x-correlation-id'];
    return headerId || randomUUID();
  },
  customLogLevel: (req, res, err) => {
    if (err || res.statusCode >= 500) return 'error';
    if (res.statusCode >= 400) return 'warn';
    if (res.statusCode >= 300) return 'debug';
    return 'info';
  },
  customSuccessMessage: 'request completed',
  customErrorMessage: 'request errored',
  serializers: {
    req: (req) => ({
      id: req.id,
      method: req.method,
      url: req.url,
      headers: req.headers,
      params: req.params,
      query: req.query,
      body: req.body,
    }),
    res: pino.stdSerializers.res,
  },
  customProps: (req, res) => {
    const userId = req.user?.userId || null;
    const tenantId = req.tenant?.id || null;

    if (process.env.SENTRY_DSN) {
      Sentry.configureScope((scope) => {
        scope.setTag('request_id', req.id);
        if (userId) scope.setUser({ id: String(userId) });
        if (tenantId) scope.setTag('tenant_id', String(tenantId));
        scope.setExtra('endpoint', req.originalUrl);
      });

      Sentry.addBreadcrumb({
        category: 'http',
        message: `${req.method} ${req.originalUrl}`,
        data: {
          statusCode: res?.statusCode,
          requestId: req.id,
          userId,
          tenantId,
        },
        level: 'info',
      });
    }

    return {
      requestId: req.id,
      userId,
      tenantId,
      endpoint: req.originalUrl,
      method: req.method,
      status: res.statusCode,
      durationMs: res.responseTime,
    };
  },
});

export function requestLogger(req, res, next) {
  pinoRequestLogger(req, res, () => {
    if (req.id) {
      res.setHeader('X-Request-Id', req.id);
    }
    next();
  });
}
