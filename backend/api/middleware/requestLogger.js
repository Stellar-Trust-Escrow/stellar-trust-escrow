import { randomUUID } from 'node:crypto';
import { getLogger, requestContext } from '../../config/logger.js';

/**
 * Assigns a request id (header X-Request-Id or generated), exposes it on req.id,
 * echoes X-Request-Id on the response, and runs the rest of the chain inside AsyncLocalStorage.
 */
export function assignRequestContext(req, res, next) {
  const requestId =
    (typeof req.headers['x-request-id'] === 'string' && req.headers['x-request-id'].trim()) ||
    randomUUID();

  req.id = requestId;
  res.setHeader('X-Request-Id', requestId);

  requestContext.run({ requestId }, () => next());
}

/**
 * One structured JSON line per HTTP request when the response finishes.
 */
export function httpRequestLogger(req, res, next) {
  const start = process.hrtime.bigint();

  res.on('finish', () => {
    const durationNs = process.hrtime.bigint() - start;
    const durationMs = Number(durationNs) / 1e6;

    const pathOnly = req.originalUrl?.split('?')[0] || req.path;

    getLogger().info({
      message: 'http_request',
      type: 'http_request',
      requestId: req.id,
      method: req.method,
      path: pathOnly,
      statusCode: res.statusCode,
      durationMs: Math.round(durationMs * 1000) / 1000,
      contentLength: res.getHeader('content-length') ?? undefined,
      userAgent: req.get('user-agent') ?? undefined,
    });
  });

  next();
}
